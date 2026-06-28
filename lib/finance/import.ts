import type { AssetClass, FinImportSource, FinTransactionType } from '@/lib/types'
import { parseNumber } from '@/lib/finance'

export { parseNumber }

/** A normalized transaction parsed from a broker/wallet CSV, before it is
 *  resolved against the account/instrument tables and inserted. */
export interface ParsedTxn {
  tradedAt: string // ISO date (YYYY-MM-DD) or full ISO timestamp
  type: FinTransactionType
  symbol: string
  isin: string | null
  assetClass: AssetClass
  quantity: number | null
  price: number | null
  fee: number
  amount: number | null
  currency: string
  /** Stable id for idempotent re-imports: `${source}:${hash}`. */
  externalId: string
}

export interface ParseResult {
  rows: ParsedTxn[]
  errors: string[]
}

// ── CSV tokenizer ─────────────────────────────────────────────────────────────

/** Split a single CSV line, honoring double-quoted fields and the given delimiter. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } // escaped quote
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return semis > commas ? ';' : ','
}

/** Parse raw CSV text into header-keyed row objects (lowercased header keys). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const delimiter = detectDelimiter(lines[0])
  const headers = splitLine(lines[0], delimiter).map((h) => h.toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}

// ── Field helpers ─────────────────────────────────────────────────────────────

/** Find the row value whose header best matches the aliases. Scores exact >
 *  startsWith > includes so e.g. the `betrag` amount column wins over the
 *  `wertpapier` security-name column (which merely contains the `wert` alias). */
function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  let best: { value: string; score: number } | undefined
  for (const key of Object.keys(row)) {
    const v = row[key]
    if (v == null || v === '') continue
    let score = 0
    for (const a of aliases) {
      if (key === a) score = Math.max(score, 3)
      else if (key.startsWith(a)) score = Math.max(score, 2)
      else if (key.includes(a)) score = Math.max(score, 1)
    }
    if (score > 0 && (!best || score > best.score)) best = { value: v, score }
  }
  return best?.value
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO-ish already?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function normalizeType(raw: string | undefined): FinTransactionType | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  if (/buy|kauf|purchase|saving|spar/.test(s)) return 'buy'
  if (/sell|verkauf|sale/.test(s)) return 'sell'
  if (/dividend|distribution|aussch/.test(s)) return 'dividend'
  if (/deposit|einzahlung|top.?up|topup/.test(s)) return 'deposit'
  if (/withdraw|auszahlung/.test(s)) return 'withdrawal'
  if (/fee|gebühr|gebuehr/.test(s)) return 'fee'
  if (/transfer/.test(s)) return 'transfer'
  return null
}

// Tiny non-cryptographic hash for stable external ids.
function hash(parts: (string | number | null)[]): string {
  const str = parts.map((p) => p ?? '').join('|')
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const ALIASES = {
  date: ['date', 'datum', 'time', 'zeit'],
  type: ['type', 'art', 'transaction', 'aktion', 'side'],
  symbol: ['ticker', 'symbol', 'instrument', 'name', 'wertpapier', 'asset'],
  isin: ['isin'],
  quantity: ['quantity', 'shares', 'anzahl', 'stück', 'stueck', 'amount of', 'units'],
  price: ['price', 'kurs', 'rate', 'preis', 'price per'],
  fee: ['fee', 'gebühr', 'gebuehr', 'commission', 'kosten'],
  amount: ['total', 'amount', 'value', 'wert', 'betrag', 'gesamt'],
  currency: ['currency', 'währung', 'waehrung', 'ccy'],
}

function parseRows(
  text: string,
  source: FinImportSource,
  defaultAssetClass: AssetClass,
): ParseResult {
  const rows = parseCsv(text)
  const out: ParsedTxn[] = []
  const errors: string[] = []

  rows.forEach((row, i) => {
    const tradedAt = parseDate(pick(row, ALIASES.date))
    const symbolRaw = pick(row, ALIASES.symbol)
    const type = normalizeType(pick(row, ALIASES.type)) ?? 'buy'

    if (!tradedAt || !symbolRaw) {
      errors.push(`Row ${i + 2}: missing date or symbol — skipped.`)
      return
    }

    const quantity = parseNumber(pick(row, ALIASES.quantity))
    const price = parseNumber(pick(row, ALIASES.price))
    const fee = parseNumber(pick(row, ALIASES.fee)) ?? 0
    const amount = parseNumber(pick(row, ALIASES.amount))
    const currency = (pick(row, ALIASES.currency) ?? 'EUR').toUpperCase().slice(0, 3)
    const isin = pick(row, ALIASES.isin) ?? null
    const symbol = symbolRaw.toUpperCase()

    out.push({
      tradedAt,
      type,
      symbol,
      isin,
      assetClass: defaultAssetClass,
      quantity,
      price,
      fee,
      amount,
      currency,
      externalId: `${source}:${hash([tradedAt, symbol, type, quantity, price, amount])}`,
    })
  })

  return { rows: out, errors }
}

// ── Public, per-source parsers ────────────────────────────────────────────────
// Trade Republic and Revolut export tabular statements but with no stable column
// names, so all three share the tolerant header-aliasing parser above and only
// differ in the default asset class assumed when the file doesn't say.

export function parseTradeRepublic(text: string): ParseResult {
  return parseRows(text, 'csv_tr', 'etf')
}

export function parseRevolut(text: string): ParseResult {
  return parseRows(text, 'csv_revolut', 'stock')
}

export function parseCrypto(text: string): ParseResult {
  return parseRows(text, 'csv_crypto', 'crypto')
}

export function parseImport(source: FinImportSource, text: string): ParseResult {
  switch (source) {
    case 'csv_tr': return parseTradeRepublic(text)
    case 'csv_revolut': return parseRevolut(text)
    case 'csv_crypto': return parseCrypto(text)
    default: return { rows: [], errors: ['Unsupported import source.'] }
  }
}

import type {
  AssetClass,
  FinAccount,
  FinCash,
  FinHolding,
  FinInstrument,
} from '@/lib/types'

/** Everything that can occupy a slice of net worth — market instruments plus
 *  the non-invested buckets (cash, fixed-rate savings). */
export type FinCategory = AssetClass | 'cash' | 'fixed'

// Channel colors per category — literal hexes (design system accents).
export const ASSET_CLASS_META: Record<FinCategory, { label: string; color: string }> = {
  etf:    { label: 'ETF',     color: '#38bdf8' }, // cyan
  stock:  { label: 'Stocks',  color: '#00d26a' }, // mint
  crypto: { label: 'Crypto',  color: '#a78bfa' }, // violet
  cash:   { label: 'Cash',    color: '#fbbf24' }, // amber
  fixed:  { label: 'Savings', color: '#2dd4bf' }, // teal
}

/** A holding joined with its instrument and the latest + previous close price. */
export interface Position {
  holding: FinHolding
  instrument: FinInstrument
  /** The account/platform the holding lives on, when known. */
  account: FinAccount | null
  /** Latest known price, or null if no price has synced yet. */
  price: number | null
  /** Previous close (for day-change), or null. */
  prevPrice: number | null
  /** This instrument's price history, oldest → newest (for trend sparklines). */
  series: number[]
}

export interface PositionValue {
  position: Position
  marketValue: number
  costBasis: number
  unrealizedPL: number
  unrealizedPLPct: number | null
  dayChange: number
  dayChangePct: number | null
}

/** A cash/fixed balance valued at the current moment. */
export interface ValuedCash {
  row: FinCash
  /** Current value — principal for cash, principal + accrued interest for fixed. */
  value: number
  principal: number
  interest: number
}

export interface PortfolioSummary {
  /** Net worth — market positions + cash + fixed savings. */
  totalValue: number
  /** Cost basis of market positions only (cash/fixed aren't "invested"). */
  totalCost: number
  /** Unrealized P/L on market positions only. */
  totalPL: number
  totalPLPct: number | null
  dayChange: number
  dayChangePct: number | null
  /** Value per category (incl. cash/fixed), in descending order. */
  byClass: { assetClass: FinCategory; value: number; pct: number }[]
  positions: PositionValue[]
  cash: ValuedCash[]
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

/** Value a cash/fixed balance now. Fixed accrues compound annual interest from
 *  `started_at`; plain cash (apy 0) stays flat, so both share one formula. */
export function valueCash(row: FinCash, now: Date = new Date()): ValuedCash {
  const start = new Date(row.started_at).getTime()
  const years = Number.isFinite(start) ? Math.max(0, (now.getTime() - start) / YEAR_MS) : 0
  const apy = row.apy ?? 0
  const value = row.amount * Math.pow(1 + apy, years)
  return { row, value, principal: row.amount, interest: value - row.amount }
}

/** Synthesize a growth curve for a fixed-rate balance (empty for flat cash),
 *  so the appreciation sparkline has a smooth analytic series to draw. */
export function cashSeries(v: ValuedCash, points = 24, now: Date = new Date()): number[] {
  const apy = v.row.apy ?? 0
  const start = new Date(v.row.started_at).getTime()
  const end = now.getTime()
  if (apy <= 0 || !Number.isFinite(start) || end <= start) return []
  const out: number[] = []
  for (let i = 0; i <= points; i++) {
    const years = (((end - start) * i) / points) / YEAR_MS
    out.push(v.principal * Math.pow(1 + apy, years))
  }
  return out
}

export function costBasis(holding: FinHolding): number {
  return (holding.avg_cost ?? 0) * holding.quantity
}

export function valuePosition(position: Position): PositionValue {
  const qty = position.holding.quantity
  const price = position.price ?? 0
  const prev = position.prevPrice ?? position.price ?? 0
  const marketValue = price * qty
  const cost = costBasis(position.holding)
  const unrealizedPL = marketValue - cost
  const dayChange = (price - prev) * qty
  return {
    position,
    marketValue,
    costBasis: cost,
    unrealizedPL,
    unrealizedPLPct: cost > 0 ? (unrealizedPL / cost) * 100 : null,
    dayChange,
    dayChangePct: prev > 0 ? ((price - prev) / prev) * 100 : null,
  }
}

export function summarizePortfolio(positions: Position[], cash: FinCash[] = []): PortfolioSummary {
  const valued = positions.map(valuePosition)
  const valuedCash = cash.map((c) => valueCash(c))

  // Market positions and the non-invested buckets are valued separately so
  // P/L and "invested" stay about the markets, while net worth spans both.
  const investValue = valued.reduce((s, p) => s + p.marketValue, 0)
  const cashValue = valuedCash.reduce((s, c) => s + c.value, 0)
  const totalValue = investValue + cashValue
  const totalCost = valued.reduce((s, p) => s + p.costBasis, 0)
  const dayChange = valued.reduce((s, p) => s + p.dayChange, 0)
  const totalPL = investValue - totalCost
  const prevValue = totalValue - dayChange

  const classTotals = new Map<FinCategory, number>()
  for (const p of valued) {
    const cls = p.position.instrument.asset_class
    classTotals.set(cls, (classTotals.get(cls) ?? 0) + p.marketValue)
  }
  for (const c of valuedCash) {
    classTotals.set(c.row.kind, (classTotals.get(c.row.kind) ?? 0) + c.value)
  }
  const byClass = [...classTotals.entries()]
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    totalValue,
    totalCost,
    totalPL,
    totalPLPct: totalCost > 0 ? (totalPL / totalCost) * 100 : null,
    dayChange,
    dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : null,
    byClass,
    positions: valued.sort((a, b) => b.marketValue - a.marketValue),
    cash: valuedCash.sort((a, b) => b.value - a.value),
  }
}

/** Collapse raw price rows to one close per instrument per day — the day's
 *  last row. Manual intraday syncs would otherwise masquerade as day-over-day
 *  movement (two syncs an hour apart → "today +0.00%"). Returns ascending. */
export function dailyCloses(
  prices: { instrument_id: number; price: number; as_of: string }[],
): Map<number, { day: string; price: number }[]> {
  const sorted = prices.slice().sort((a, b) => a.as_of.localeCompare(b.as_of))
  const out = new Map<number, { day: string; price: number }[]>()
  for (const p of sorted) {
    const day = p.as_of.slice(0, 10)
    const list = out.get(p.instrument_id) ?? []
    const last = list[list.length - 1]
    if (last && last.day === day) last.price = p.price // later row wins the day
    else list.push({ day, price: p.price })
    out.set(p.instrument_id, list)
  }
  return out
}

/** Build positions from raw rows, attaching latest/previous daily close per instrument. */
export function buildPositions(
  holdings: FinHolding[],
  instruments: FinInstrument[],
  prices: { instrument_id: number; price: number; as_of: string }[],
  accounts: FinAccount[] = [],
): Position[] {
  const instrumentById = new Map(instruments.map((i) => [i.id, i]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const closesByInstrument = dailyCloses(prices)

  const positions: Position[] = []
  for (const holding of holdings) {
    const instrument = instrumentById.get(holding.instrument_id)
    if (!instrument) continue
    const closes = closesByInstrument.get(holding.instrument_id) ?? []
    positions.push({
      holding,
      instrument,
      account: accountById.get(holding.account_id) ?? null,
      price: closes[closes.length - 1]?.price ?? null,
      prevPrice: closes[closes.length - 2]?.price ?? null,
      series: closes.map((c) => c.price),
    })
  }
  return positions
}

/** Net-worth time series: value current holdings at each day's closing price,
 *  plus cash/fixed balances valued at that date, so the chart's latest point
 *  matches the net-worth stat. Assumes constant holdings (a trend of today's
 *  portfolio, not a back-test). */
export function portfolioHistory(
  holdings: FinHolding[],
  instruments: FinInstrument[],
  prices: { instrument_id: number; price: number; as_of: string }[],
  cash: FinCash[] = [],
): { date: string; value: number }[] {
  void instruments // signature kept symmetric with buildPositions
  if (prices.length === 0) return []

  const byInstrument = dailyCloses(prices)
  const days = [...new Set(prices.map((p) => p.as_of.slice(0, 10)))].sort()
  return days.map((day) => {
    let value = 0
    for (const h of holdings) {
      const list = byInstrument.get(h.instrument_id)
      if (!list) continue
      let price: number | null = null
      for (const row of list) {
        if (row.day <= day) price = row.price
        else break
      }
      if (price != null) value += price * h.quantity
    }
    const at = new Date(`${day}T23:59:59Z`)
    for (const c of cash) value += valueCash(c, at).value
    return { date: day, value }
  })
}

// ── Formatting ───────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', MXN: 'MX$', GBP: '£' }

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? `${currency} `
}

export function formatMoney(value: number, currency = 'EUR'): string {
  const symbol = currencySymbol(currency)
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}${symbol}${formatted}`
}

/** Compact money for chart axes — €1.2k, €3.4M. */
export function formatMoneyCompact(value: number, currency = 'EUR'): string {
  const symbol = currencySymbol(currency)
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`
  return `${sign}${symbol}${Math.round(abs)}`
}

/** Share/coin quantity — trims float noise, keeps precision for sub-1 crypto amounts. */
export function formatQuantity(q: number): string {
  const abs = Math.abs(q)
  return q.toLocaleString('en-US', { maximumFractionDigits: abs !== 0 && abs < 1 ? 8 : 4 })
}

export function formatSignedPct(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

export function plTone(value: number): 'good' | 'bad' | 'neutral' {
  if (value > 0) return 'good'
  if (value < 0) return 'bad'
  return 'neutral'
}

// ── Number parsing & FX ───────────────────────────────────────────────────────

/** Parse a number that may use either `1,234.56` or European `1.234,56` formatting.
 *  Accepts a plain comma decimal (`60,5`) too, so manual inputs aren't point-only. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null
  let s = raw.replace(/[^\d.,-]/g, '').trim()
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // European: comma is the decimal separator.
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // Anglo: comma is the thousands separator.
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Portfolio base currency — `avg_cost` and synced prices are stored in this. */
export const BASE_CURRENCY = 'EUR'

/** Latest FX rate from frankfurter.app (keyless ECB data). Returns the multiplier
 *  to go `from → to`, or null on failure so callers can refuse to store a guess. */
export async function fetchFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`)
    if (!res.ok) return null
    const j = (await res.json()) as { rates?: Record<string, number> }
    const r = j.rates?.[to]
    return typeof r === 'number' ? r : null
  } catch {
    return null
  }
}

// ── Realized P/L ─────────────────────────────────────────────────────────────
// Sells record their realized P/L (vs the avg cost at sale time) in the
// transaction's `notes`, because the basis isn't recoverable later — the
// holding row shrinks or disappears once the sale is applied.

export function encodeRealizedNote(realized: number): string {
  return `realized:${realized.toFixed(2)}`
}

export function parseRealizedNote(notes: string | null | undefined): number | null {
  const m = notes?.match(/realized:(-?\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** Sum of realized P/L across sell transactions that recorded one. */
export function totalRealizedPL(txns: { type: string; notes: string | null }[]): number {
  let sum = 0
  for (const t of txns) {
    if (t.type !== 'sell') continue
    sum += parseRealizedNote(t.notes) ?? 0
  }
  return sum
}

/** Roll a list of buy/sell transactions up into net holdings per symbol.
 *  avg_cost is the average buy price (sells reduce quantity, not basis). */
export function rollupHoldings(
  txns: { symbol: string; assetClass: AssetClass; type: string; quantity: number | null; price: number | null }[],
): Map<string, { symbol: string; assetClass: AssetClass; quantity: number; avgCost: number | null }> {
  const acc = new Map<string, { symbol: string; assetClass: AssetClass; qtyBuy: number; costBuy: number; qtySell: number }>()
  for (const t of txns) {
    const qty = t.quantity ?? 0
    if (qty <= 0) continue
    const cur = acc.get(t.symbol) ?? { symbol: t.symbol, assetClass: t.assetClass, qtyBuy: 0, costBuy: 0, qtySell: 0 }
    if (t.type === 'buy') {
      cur.qtyBuy += qty
      cur.costBuy += qty * (t.price ?? 0)
    } else if (t.type === 'sell') {
      cur.qtySell += qty
    }
    acc.set(t.symbol, cur)
  }
  const out = new Map<string, { symbol: string; assetClass: AssetClass; quantity: number; avgCost: number | null }>()
  for (const [symbol, v] of acc) {
    out.set(symbol, {
      symbol,
      assetClass: v.assetClass,
      quantity: v.qtyBuy - v.qtySell,
      avgCost: v.qtyBuy > 0 ? v.costBuy / v.qtyBuy : null,
    })
  }
  return out
}

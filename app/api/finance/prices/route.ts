import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AssetClass } from '@/lib/types'

// Live quotes for held instruments. Equities/ETFs come from a keyed provider
// (Twelve Data / Finnhub); crypto uses CoinGecko's keyless markets endpoint.
// Falls back gracefully (empty list + note) when no key is configured, so the
// app still builds and runs without market-data access.

interface QuoteRequest {
  // `id` is optional; when present (and a service-role key is configured) the
  // resulting quote is persisted to fin_prices so day-change survives reloads.
  instruments: { id?: number; symbol: string; asset_class: AssetClass }[]
  currency?: string
}

interface Quote {
  symbol: string
  asset_class: AssetClass
  price: number
  currency: string
  as_of: string
}

const PROVIDER = (process.env.MARKETDATA_PROVIDER ?? 'twelvedata').toLowerCase()
const API_KEY = process.env.MARKETDATA_API_KEY ?? ''

async function fetchCrypto(symbols: string[], vs: string): Promise<Quote[]> {
  if (symbols.length === 0) return []
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs.toLowerCase()}&symbols=${symbols.map((s) => s.toLowerCase()).join(',')}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) return []
    const data = (await res.json()) as { symbol: string; current_price: number }[]
    const now = new Date().toISOString()
    return data
      .filter((c) => typeof c.current_price === 'number')
      .map((c) => ({
        symbol: c.symbol.toUpperCase(),
        asset_class: 'crypto' as const,
        price: c.current_price,
        currency: vs.toUpperCase(),
        as_of: now,
      }))
  } catch {
    return []
  }
}

async function fetchEquities(
  instruments: { symbol: string; asset_class: AssetClass }[],
): Promise<Quote[]> {
  if (instruments.length === 0 || !API_KEY) return []
  const symbols = instruments.map((i) => i.symbol.toUpperCase())
  const now = new Date().toISOString()
  try {
    if (PROVIDER === 'twelvedata') {
      const url = `https://api.twelvedata.com/price?symbol=${symbols.join(',')}&apikey=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) return []
      const json = (await res.json()) as Record<string, { price?: string }> | { price?: string }
      // Single symbol → { price }; multiple → { SYM: { price } }.
      const out: Quote[] = []
      for (const inst of instruments) {
        const sym = inst.symbol.toUpperCase()
        const entry = symbols.length === 1 ? (json as { price?: string }) : (json as Record<string, { price?: string }>)[sym]
        const price = entry?.price ? Number(entry.price) : NaN
        if (Number.isFinite(price)) {
          out.push({ symbol: sym, asset_class: inst.asset_class, price, currency: 'USD', as_of: now })
        }
      }
      return out
    }
    if (PROVIDER === 'finnhub') {
      const results = await Promise.all(
        instruments.map(async (inst) => {
          const sym = inst.symbol.toUpperCase()
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${API_KEY}`)
          if (!res.ok) return null
          const j = (await res.json()) as { c?: number }
          return j.c ? { symbol: sym, asset_class: inst.asset_class, price: j.c, currency: 'USD', as_of: now } : null
        }),
      )
      return results.filter((q): q is Quote => q != null)
    }
  } catch {
    return []
  }
  return []
}

export async function POST(req: NextRequest) {
  let body: QuoteRequest
  try {
    body = (await req.json()) as QuoteRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const instruments = Array.isArray(body.instruments) ? body.instruments : []
  const vs = body.currency ?? 'EUR'

  const cryptoSymbols = instruments.filter((i) => i.asset_class === 'crypto').map((i) => i.symbol)
  const equities = instruments.filter((i) => i.asset_class !== 'crypto')

  const [crypto, equityQuotes] = await Promise.all([
    fetchCrypto(cryptoSymbols, vs),
    fetchEquities(equities),
  ])

  const quotes = [...crypto, ...equityQuotes]

  // Persist to fin_prices via service role (bypasses RLS) when ids are known.
  let persisted = 0
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (serviceKey && quotes.length > 0) {
    const idBySymbol = new Map(
      instruments.filter((i) => i.id != null).map((i) => [`${i.asset_class}:${i.symbol.toUpperCase()}`, i.id!]),
    )
    const rows = quotes
      .map((q) => {
        const instrument_id = idBySymbol.get(`${q.asset_class}:${q.symbol}`)
        return instrument_id == null ? null : { instrument_id, price: q.price, currency: q.currency, as_of: q.as_of, source: PROVIDER }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
    if (rows.length > 0) {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', serviceKey)
      const { error } = await supabase.from('fin_prices').upsert(rows, { onConflict: 'instrument_id,as_of' })
      if (!error) persisted = rows.length
    }
  }

  return NextResponse.json({
    quotes,
    persisted,
    provider: PROVIDER,
    equity_quotes_available: !!API_KEY,
    note: API_KEY ? undefined : 'MARKETDATA_API_KEY not set — equity/ETF quotes unavailable; crypto still live.',
  })
}

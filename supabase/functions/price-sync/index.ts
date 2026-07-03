// Market-price poller — runs on cron (daily) via the Supabase scheduler.
// Reads every instrument referenced by a holding, fetches the latest quote
// (equities/ETFs via Twelve Data or Finnhub; crypto via CoinGecko's keyless
// markets endpoint) and upserts a row into fin_prices. Keeps portfolio value
// fresh without the app being open, mirroring the whoop-sync pattern.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AssetClass = 'etf' | 'stock' | 'crypto'
interface Instrument { id: number; symbol: string; asset_class: AssetClass }
interface PriceRow { instrument_id: number; price: number; currency: string; as_of: string; source: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fetchCrypto(instruments: Instrument[], vs: string, asOf: string): Promise<PriceRow[]> {
  if (instruments.length === 0) return []
  const symbols = instruments.map((i) => i.symbol.toLowerCase()).join(',')
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs.toLowerCase()}&symbols=${symbols}`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as { symbol: string; current_price: number }[]
  const bySymbol = new Map(data.map((d) => [d.symbol.toUpperCase(), d.current_price]))
  return instruments
    .map((i) => {
      const price = bySymbol.get(i.symbol.toUpperCase())
      return typeof price === 'number'
        ? { instrument_id: i.id, price, currency: vs.toUpperCase(), as_of: asOf, source: 'coingecko' }
        : null
    })
    .filter((r): r is PriceRow => r != null)
}

async function fetchEquities(instruments: Instrument[], provider: string, key: string, asOf: string): Promise<PriceRow[]> {
  if (instruments.length === 0 || !key) return []
  if (provider === 'finnhub') {
    const rows = await Promise.all(
      instruments.map(async (i) => {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${i.symbol.toUpperCase()}&token=${key}`)
        if (!res.ok) return null
        const j = (await res.json()) as { c?: number }
        return j.c ? { instrument_id: i.id, price: j.c, currency: 'USD', as_of: asOf, source: 'finnhub' } : null
      }),
    )
    return rows.filter((r): r is PriceRow => r != null)
  }
  // Default: Twelve Data batch /quote — unlike /price it reports the listing
  // currency, so EUR-quoted ETFs aren't mistaken for USD and FX'd twice.
  const symbols = instruments.map((i) => i.symbol.toUpperCase())
  const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${key}`)
  if (!res.ok) return []
  type TdQuote = { close?: string; currency?: string }
  const json2 = (await res.json()) as Record<string, TdQuote> | TdQuote
  return instruments
    .map((i) => {
      const sym = i.symbol.toUpperCase()
      const entry = symbols.length === 1 ? (json2 as TdQuote) : (json2 as Record<string, TdQuote>)[sym]
      const price = entry?.close ? Number(entry.close) : NaN
      return Number.isFinite(price)
        ? { instrument_id: i.id, price, currency: entry?.currency?.toUpperCase() || 'USD', as_of: asOf, source: 'twelvedata' }
        : null
    })
    .filter((r): r is PriceRow => r != null)
}

async function toBaseCurrency(rows: PriceRow[], base: string): Promise<PriceRow[]> {
  const needed = [...new Set(rows.filter((r) => r.currency !== base).map((r) => r.currency))]
  if (needed.length === 0) return rows
  const rates = new Map<string, number>()
  await Promise.all(
    needed.map(async (from) => {
      try {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${base}`)
        if (!res.ok) return
        const j = (await res.json()) as { rates?: Record<string, number> }
        const r = j.rates?.[base]
        if (typeof r === 'number') rates.set(from, r)
      } catch { /* leave unconverted */ }
    }),
  )
  return rows.map((row) => {
    if (row.currency === base) return row
    const r = rates.get(row.currency)
    return r ? { ...row, price: row.price * r, currency: base } : row
  })
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) return json({ error: 'Missing Supabase env vars' }, 500)

    const provider = (Deno.env.get('MARKETDATA_PROVIDER') ?? 'twelvedata').toLowerCase()
    const apiKey = Deno.env.get('MARKETDATA_API_KEY') ?? ''
    const vs = Deno.env.get('MARKETDATA_BASE_CURRENCY') ?? 'EUR'

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Only price instruments that are actually held.
    const { data: holdings } = await supabase.from('fin_holdings').select('instrument_id').gt('quantity', 0)
    const heldIds = [...new Set((holdings ?? []).map((h) => (h as { instrument_id: number }).instrument_id))]
    if (heldIds.length === 0) return json({ ok: true, priced: 0, note: 'no holdings' })

    const { data: instruments } = await supabase
      .from('fin_instruments')
      .select('id,symbol,asset_class')
      .in('id', heldIds)
    const list = (instruments ?? []) as Instrument[]

    const asOf = new Date().toISOString()
    const crypto = list.filter((i) => i.asset_class === 'crypto')
    const equities = list.filter((i) => i.asset_class !== 'crypto')

    const [cryptoRows, equityRows] = await Promise.all([
      fetchCrypto(crypto, vs, asOf),
      fetchEquities(equities, provider, apiKey, asOf),
    ])
    // Crypto is already in `vs`; equities come back in USD — normalize to base.
    const rows = [...cryptoRows, ...(await toBaseCurrency(equityRows, vs))]

    if (rows.length > 0) {
      const { error } = await supabase.from('fin_prices').upsert(rows, { onConflict: 'instrument_id,as_of' })
      if (error) return json({ error: error.message }, 500)
    }

    return json({ ok: true, priced: rows.length, instruments: list.length, equity_quotes_enabled: !!apiKey })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

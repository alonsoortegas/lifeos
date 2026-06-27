import type {
  AssetClass,
  FinHolding,
  FinInstrument,
} from '@/lib/types'

// Channel colors per asset class — literal hexes (design system accents).
export const ASSET_CLASS_META: Record<AssetClass, { label: string; color: string }> = {
  etf:    { label: 'ETF',    color: '#38bdf8' }, // cyan
  stock:  { label: 'Stocks', color: '#00d26a' }, // mint
  crypto: { label: 'Crypto', color: '#a78bfa' }, // violet
}

/** A holding joined with its instrument and the latest + previous close price. */
export interface Position {
  holding: FinHolding
  instrument: FinInstrument
  /** Latest known price, or null if no price has synced yet. */
  price: number | null
  /** Previous close (for day-change), or null. */
  prevPrice: number | null
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

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  totalPL: number
  totalPLPct: number | null
  dayChange: number
  dayChangePct: number | null
  /** Value per asset class, in descending order. */
  byClass: { assetClass: AssetClass; value: number; pct: number }[]
  positions: PositionValue[]
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

export function summarizePortfolio(positions: Position[]): PortfolioSummary {
  const valued = positions.map(valuePosition)

  const totalValue = valued.reduce((s, p) => s + p.marketValue, 0)
  const totalCost = valued.reduce((s, p) => s + p.costBasis, 0)
  const dayChange = valued.reduce((s, p) => s + p.dayChange, 0)
  const totalPL = totalValue - totalCost
  const prevValue = totalValue - dayChange

  const classTotals = new Map<AssetClass, number>()
  for (const p of valued) {
    const cls = p.position.instrument.asset_class
    classTotals.set(cls, (classTotals.get(cls) ?? 0) + p.marketValue)
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
  }
}

/** Build positions from raw rows, attaching the two most-recent prices per instrument. */
export function buildPositions(
  holdings: FinHolding[],
  instruments: FinInstrument[],
  prices: { instrument_id: number; price: number; as_of: string }[],
): Position[] {
  const instrumentById = new Map(instruments.map((i) => [i.id, i]))

  // Latest two prices per instrument (prices assumed ordered however; we sort).
  const byInstrument = new Map<number, { price: number; as_of: string }[]>()
  for (const p of prices) {
    const list = byInstrument.get(p.instrument_id) ?? []
    list.push(p)
    byInstrument.set(p.instrument_id, list)
  }

  const positions: Position[] = []
  for (const holding of holdings) {
    const instrument = instrumentById.get(holding.instrument_id)
    if (!instrument) continue
    const sorted = (byInstrument.get(holding.instrument_id) ?? [])
      .slice()
      .sort((a, b) => b.as_of.localeCompare(a.as_of))
    positions.push({
      holding,
      instrument,
      price: sorted[0]?.price ?? null,
      prevPrice: sorted[1]?.price ?? null,
    })
  }
  return positions
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatMoney(value: number, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : ''
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}${symbol}${formatted}`
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

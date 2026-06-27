import { describe, it, expect } from 'vitest'
import {
  buildPositions,
  portfolioHistory,
  summarizePortfolio,
  valuePosition,
  formatMoney,
  formatSignedPct,
  type Position,
} from '@/lib/finance'
import type { FinHolding, FinInstrument } from '@/lib/types'

function holding(p: Partial<FinHolding>): FinHolding {
  return { id: 1, account_id: 1, instrument_id: 1, quantity: 0, avg_cost: null, updated_at: '', ...p }
}
function instrument(p: Partial<FinInstrument>): FinInstrument {
  return { id: 1, symbol: 'X', isin: null, name: null, asset_class: 'etf', currency: 'EUR', created_at: '', ...p }
}

describe('valuePosition', () => {
  it('computes market value, P/L and day change', () => {
    const pos: Position = {
      holding: holding({ quantity: 10, avg_cost: 100 }),
      instrument: instrument({}),
      price: 120,
      prevPrice: 110,
    }
    const v = valuePosition(pos)
    expect(v.marketValue).toBe(1200)
    expect(v.costBasis).toBe(1000)
    expect(v.unrealizedPL).toBe(200)
    expect(v.unrealizedPLPct).toBeCloseTo(20)
    expect(v.dayChange).toBe(100) // (120-110)*10
    expect(v.dayChangePct).toBeCloseTo(9.0909, 3)
  })

  it('handles a missing price gracefully', () => {
    const v = valuePosition({
      holding: holding({ quantity: 5, avg_cost: 50 }),
      instrument: instrument({}),
      price: null,
      prevPrice: null,
    })
    expect(v.marketValue).toBe(0)
    expect(v.dayChange).toBe(0)
    expect(v.dayChangePct).toBeNull()
  })
})

describe('summarizePortfolio', () => {
  it('aggregates value and allocation by asset class', () => {
    const positions: Position[] = [
      { holding: holding({ id: 1, instrument_id: 1, quantity: 10, avg_cost: 100 }), instrument: instrument({ id: 1, asset_class: 'etf' }), price: 120, prevPrice: 110 },
      { holding: holding({ id: 2, instrument_id: 2, quantity: 1, avg_cost: 1000 }), instrument: instrument({ id: 2, asset_class: 'crypto' }), price: 800, prevPrice: 850 },
    ]
    const s = summarizePortfolio(positions)
    expect(s.totalValue).toBe(2000) // 1200 + 800
    expect(s.totalCost).toBe(2000)
    expect(s.totalPL).toBe(0)
    expect(s.dayChange).toBe(50) // +100 etf, -50 crypto
    expect(s.byClass[0].assetClass).toBe('etf') // sorted by value desc
    expect(s.byClass[0].pct).toBeCloseTo(60)
  })
})

describe('buildPositions', () => {
  it('attaches the two most-recent prices per instrument', () => {
    const positions = buildPositions(
      [holding({ instrument_id: 7, quantity: 2, avg_cost: 10 })],
      [instrument({ id: 7 })],
      [
        { instrument_id: 7, price: 30, as_of: '2026-06-25T00:00:00Z' },
        { instrument_id: 7, price: 33, as_of: '2026-06-26T00:00:00Z' },
        { instrument_id: 7, price: 28, as_of: '2026-06-24T00:00:00Z' },
      ],
    )
    expect(positions).toHaveLength(1)
    expect(positions[0].price).toBe(33) // latest
    expect(positions[0].prevPrice).toBe(30) // second latest
  })

  it('drops holdings whose instrument is unknown', () => {
    const positions = buildPositions([holding({ instrument_id: 99 })], [instrument({ id: 1 })], [])
    expect(positions).toHaveLength(0)
  })
})

describe('portfolioHistory', () => {
  it('values current holdings at each day\'s most-recent close', () => {
    const series = portfolioHistory(
      [holding({ instrument_id: 1, quantity: 10 })],
      [instrument({ id: 1 })],
      [
        { instrument_id: 1, price: 100, as_of: '2026-06-24T08:00:00Z' },
        { instrument_id: 1, price: 110, as_of: '2026-06-25T08:00:00Z' },
        { instrument_id: 1, price: 105, as_of: '2026-06-26T08:00:00Z' },
      ],
    )
    expect(series).toEqual([
      { date: '2026-06-24', value: 1000 },
      { date: '2026-06-25', value: 1100 },
      { date: '2026-06-26', value: 1050 },
    ])
  })

  it('returns an empty series when there are no prices', () => {
    expect(portfolioHistory([holding({})], [instrument({})], [])).toEqual([])
  })
})

describe('formatting', () => {
  it('formats money with the euro symbol', () => {
    expect(formatMoney(1234.5)).toBe('€1,234.50')
    expect(formatMoney(-50)).toBe('-€50.00')
  })
  it('formats signed percentages', () => {
    expect(formatSignedPct(12.3)).toBe('+12.30%')
    expect(formatSignedPct(-1)).toBe('-1.00%')
    expect(formatSignedPct(null)).toBe('—')
  })
})

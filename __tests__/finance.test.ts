import { describe, it, expect } from 'vitest'
import {
  buildPositions,
  portfolioHistory,
  summarizePortfolio,
  valueCash,
  valuePosition,
  formatMoney,
  formatSignedPct,
  type Position,
} from '@/lib/finance'
import type { FinCash, FinHolding, FinInstrument } from '@/lib/types'

function holding(p: Partial<FinHolding>): FinHolding {
  return { id: 1, account_id: 1, instrument_id: 1, quantity: 0, avg_cost: null, updated_at: '', ...p }
}
function instrument(p: Partial<FinInstrument>): FinInstrument {
  return { id: 1, symbol: 'X', isin: null, name: null, asset_class: 'etf', currency: 'EUR', created_at: '', ...p }
}
function cash(p: Partial<FinCash>): FinCash {
  return { id: 1, account_id: 1, kind: 'cash', label: null, amount: 0, currency: 'EUR', apy: 0, started_at: '2026-01-01', updated_at: '', ...p }
}

describe('valuePosition', () => {
  it('computes market value, P/L and day change', () => {
    const pos: Position = {
      holding: holding({ quantity: 10, avg_cost: 100 }),
      instrument: instrument({}),
      account: null,
      price: 120,
      prevPrice: 110,
      series: [],
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
      account: null,
      price: null,
      prevPrice: null,
      series: [],
    })
    expect(v.marketValue).toBe(0)
    expect(v.dayChange).toBe(0)
    expect(v.dayChangePct).toBeNull()
  })
})

describe('summarizePortfolio', () => {
  it('aggregates value and allocation by asset class', () => {
    const positions: Position[] = [
      { holding: holding({ id: 1, instrument_id: 1, quantity: 10, avg_cost: 100 }), instrument: instrument({ id: 1, asset_class: 'etf' }), account: null, price: 120, prevPrice: 110, series: [] },
      { holding: holding({ id: 2, instrument_id: 2, quantity: 1, avg_cost: 1000 }), instrument: instrument({ id: 2, asset_class: 'crypto' }), account: null, price: 800, prevPrice: 850, series: [] },
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

describe('valueCash', () => {
  it('keeps plain cash flat', () => {
    const v = valueCash(cash({ kind: 'cash', amount: 5000 }), new Date('2027-01-01'))
    expect(v.value).toBe(5000)
    expect(v.interest).toBe(0)
  })

  it('accrues fixed-rate savings over time', () => {
    // 2% p.a. on 1000, exactly one year on → 1020.
    const v = valueCash(
      cash({ kind: 'fixed', amount: 1000, apy: 0.02, started_at: '2026-01-01' }),
      new Date('2027-01-01'),
    )
    expect(v.value).toBeCloseTo(1000 * Math.pow(1.02, 365 / 365.25), 4)
    expect(v.interest).toBeGreaterThan(0)
  })
})

describe('summarizePortfolio with cash', () => {
  it('folds cash into net worth and by-class but not P/L', () => {
    const positions: Position[] = [
      { holding: holding({ quantity: 10, avg_cost: 100 }), instrument: instrument({ asset_class: 'etf' }), account: null, price: 120, prevPrice: 120, series: [] },
    ]
    const s = summarizePortfolio(positions, [cash({ kind: 'cash', amount: 800 })])
    expect(s.totalValue).toBe(2000) // 1200 invested + 800 cash
    expect(s.totalCost).toBe(1000) // market cost only
    expect(s.totalPL).toBe(200) // market P/L only, unaffected by cash
    expect(s.cash).toHaveLength(1)
    expect(s.byClass.find((c) => c.assetClass === 'cash')?.value).toBe(800)
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
    expect(positions[0].series).toEqual([28, 30, 33]) // oldest → newest
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

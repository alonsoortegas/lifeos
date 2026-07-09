import { describe, it, expect } from 'vitest'
import { computeFuelTrends, type FuelDayRow } from '@/lib/trends'

const TODAY = '2026-07-08'

function day(date: string, kcalTarget: number, proteinTarget: number, items: [number, number][]): FuelDayRow {
  return {
    date,
    calories_target: kcalTarget,
    protein_target: proteinTarget,
    meal_log: items.length
      ? [{ meal_log_item: items.map(([calories, protein_g]) => ({ calories, protein_g })) }]
      : [],
  }
}

describe('computeFuelTrends', () => {
  it('sums consumed macros per day and flags unlogged days', () => {
    const t = computeFuelTrends([
      day('2026-07-07', 2400, 160, [[600, 40], [800, 50], [900, 60]]),
      day('2026-07-08', 2400, 160, []),
    ], TODAY)
    expect(t.days[0]).toMatchObject({ date: '2026-07-07', kcal: 2300, protein: 150, logged: true })
    expect(t.days[1].logged).toBe(false)
  })

  it('kcal adherence is a ±10% window, protein is a floor', () => {
    const t = computeFuelTrends([
      day('2026-07-05', 2000, 150, [[2100, 150]]), // kcal +5% ok · protein hit (== target)
      day('2026-07-06', 2000, 150, [[2500, 155]]), // kcal +25% out · protein hit
      day('2026-07-07', 2000, 150, [[1900, 100]]), // kcal -5% ok · protein miss
    ], TODAY)
    expect(t.adherence.kcalWithin10Pct).toBe(67)
    expect(t.adherence.proteinHitPct).toBe(67)
  })

  it('loggedPct denominator is the calendar span, so gap days count against it', () => {
    const t = computeFuelTrends([
      day('2026-07-01', 2000, 150, [[2000, 150]]),
      // 07-02 … 07-07 missing entirely (no nutrition_day rows)
      day('2026-07-08', 2000, 150, [[2000, 150]]),
    ], TODAY)
    expect(t.adherence.totalDays).toBe(8)
    expect(t.adherence.loggedDays).toBe(2)
    expect(t.adherence.loggedPct).toBe(25)
  })

  it('energy balance: 21d averages and scale-implied kcal/day from the weight rate', () => {
    const t = computeFuelTrends([
      day('2026-07-06', 2300, 160, [[2400, 160]]),
      day('2026-07-07', 2300, 160, [[2500, 160]]),
    ], TODAY, { actualRatePerWeek: 0.11 })
    expect(t.energyBalance.avgKcal21d).toBe(2450)
    expect(t.energyBalance.avgDeltaVsTarget21d).toBe(150)
    expect(t.energyBalance.scaleImpliedKcalPerDay).toBe(121) // 0.11 × 7700 / 7
  })

  it('proteinPerKg divides the 7d protein average by current weight', () => {
    const t = computeFuelTrends([
      day('2026-06-20', 2300, 160, [[2300, 100]]), // outside 7d window — ignored
      day('2026-07-06', 2300, 160, [[2300, 150]]),
      day('2026-07-08', 2300, 160, [[2300, 170]]),
    ], TODAY, { latestWeightKg: 80 })
    expect(t.proteinPerKg).toBeCloseTo(2.0, 2) // (150+170)/2 ÷ 80
  })

  it('returns nulls with no data', () => {
    const t = computeFuelTrends([], TODAY)
    expect(t.days).toHaveLength(0)
    expect(t.adherence.loggedPct).toBeNull()
    expect(t.energyBalance.avgKcal21d).toBeNull()
    expect(t.proteinPerKg).toBeNull()
  })
})

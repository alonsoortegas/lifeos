import { describe, it, expect } from 'vitest'
import { epley1RM, computeStrengthTrends, type StrengthLogRow } from '@/lib/trends'

const TODAY = '2026-07-08'

function set(logged_at: string, exercise: string, weight: number, reps: number, unit = 'kg'): StrengthLogRow {
  return { logged_at, exercise_name: exercise, weight_lbs: weight, weight_unit: unit, reps }
}

describe('epley1RM', () => {
  it('single rep is the weight itself', () => expect(epley1RM(100, 1)).toBe(100))
  it('applies Epley above 1 rep', () => expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1))
})

describe('computeStrengthTrends', () => {
  it('normalizes mixed units into tonnage', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Squat', 100, 5, 'kg'),
      set('2026-07-07T10:05:00Z', 'Squat', 220.462, 5, 'lbs'), // ≈ 100 kg
    ], TODAY)
    expect(t.weeklyTonnage).toHaveLength(1)
    expect(t.weeklyTonnage[0].week).toBe('2026-07-06')
    expect(t.weeklyTonnage[0].kg).toBe(1000)
  })
  it('excludes zero-weight and zero-rep sets', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Plank', 0, 1),
      set('2026-07-07T10:05:00Z', 'Squat', 100, 0),
    ], TODAY)
    expect(t.weeklyTonnage).toHaveLength(0)
    expect(t.exercises).toHaveLength(0)
  })
  it('keeps the best e1RM set per session', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Bench', 100, 5), // e1RM 116.7
      set('2026-07-07T10:10:00Z', 'Bench', 105, 2), // e1RM 112
    ], TODAY)
    expect(t.exercises[0].points).toHaveLength(1)
    expect(t.exercises[0].points[0].value).toBeCloseTo(116.7, 1)
  })
  it('keeps only the topN most-logged exercises', () => {
    const logs = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].flatMap((ex) => [
        set('2026-07-01T10:00:00Z', ex, 50, 5),
        set('2026-07-03T10:00:00Z', ex, 50, 5),
      ]),
      set('2026-07-01T10:00:00Z', 'G', 50, 5), // logged once → dropped at topN=6
    ]
    const t = computeStrengthTrends(logs, TODAY)
    expect(t.exercises.map((e) => e.exercise)).not.toContain('G')
    expect(t.exercises).toHaveLength(6)
  })
  it('rising e1RM over ≥3 sessions → strengthChip up', () => {
    const t = computeStrengthTrends([
      set('2026-06-22T10:00:00Z', 'Squat', 100, 5),
      set('2026-06-29T10:00:00Z', 'Squat', 102, 5),
      set('2026-07-06T10:00:00Z', 'Squat', 104, 5),
    ], TODAY)
    expect(t.exercises[0].slopePctPerWeek!).toBeGreaterThan(1)
    expect(t.strengthChip).toBe('up')
  })
  it('volumeChip compares last 3 complete weeks vs prior 3', () => {
    // 6 complete weeks: 3× 1000 kg then 3× 1100 kg; today's partial week excluded.
    const logs = [
      set('2026-05-26T10:00:00Z', 'Squat', 100, 10), // wk 2026-05-25
      set('2026-06-02T10:00:00Z', 'Squat', 100, 10), // wk 2026-06-01
      set('2026-06-09T10:00:00Z', 'Squat', 100, 10), // wk 2026-06-08
      set('2026-06-16T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-15
      set('2026-06-23T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-22
      set('2026-06-30T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-29
      set('2026-07-07T10:00:00Z', 'Squat', 200, 10), // current wk — excluded
    ]
    expect(computeStrengthTrends(logs, TODAY).volumeChip).toBe('up')
  })
})

import { describe, it, expect } from 'vitest'
import { computeLoadTrends, type ShapedWorkout } from '@/lib/trends'

function wkt(over: Partial<ShapedWorkout>): ShapedWorkout {
  return {
    workout_id: 'x', started_at: '2026-07-07T10:00:00Z', sport_name: 'weightlifting',
    category: 'training', strain: 10, avg_hr: 110, max_hr: 150,
    duration_min: 60, distance_m: null, altitude_gain_m: null,
    kilojoule: null, kcal: null, pace_min_per_km: null,
    zone_minutes: { z0: 30, z1: 25, z2: 5, z3: 0, z4: 0, z5: 0 },
    ...over,
  }
}

describe('computeLoadTrends', () => {
  it('splits training vs lifestyle minutes and counts training sessions only', () => {
    const t = computeLoadTrends([
      wkt({}),
      wkt({ sport_name: 'commuting', category: 'lifestyle', duration_min: 17 }),
    ], [])
    expect(t.weeks).toHaveLength(1)
    expect(t.weeks[0].trainingMin).toBe(60)
    expect(t.weeks[0].lifestyleMin).toBe(17)
    expect(t.weeks[0].sessions).toBe(1)
  })
  it('buckets Sunday vs Monday into different weeks', () => {
    const t = computeLoadTrends([
      wkt({ started_at: '2026-07-05T10:00:00Z' }), // Sun → wk 2026-06-29
      wkt({ started_at: '2026-07-06T10:00:00Z' }), // Mon → wk 2026-07-06
    ], [])
    expect(t.weeks.map((w) => w.week)).toEqual(['2026-06-29', '2026-07-06'])
  })
  it('falls back to zone-minute sum when duration is missing', () => {
    const t = computeLoadTrends([wkt({ duration_min: null })], [])
    expect(t.weeks[0].trainingMin).toBe(60) // 30+25+5
  })
  it('sums weekly strain from snapshots', () => {
    const t = computeLoadTrends([], [
      { recorded_at: '2026-07-06T06:00:00Z', strain: 10.5 },
      { recorded_at: '2026-07-07T06:00:00Z', strain: 14.2 },
    ])
    expect(t.weeks[0].strain).toBeCloseTo(24.7, 1)
  })
})

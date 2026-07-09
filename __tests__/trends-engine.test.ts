import { describe, it, expect } from 'vitest'
import { computeEngineTrends, type ShapedWorkout } from '@/lib/trends'

function wkt(over: Partial<ShapedWorkout>): ShapedWorkout {
  return {
    workout_id: 'x', started_at: '2026-07-07T10:00:00Z', sport_name: 'running',
    category: 'training', strain: 10, avg_hr: 150, max_hr: 170,
    duration_min: 40, distance_m: 6000, altitude_gain_m: null,
    kilojoule: 2000, kcal: 478, pace_min_per_km: 6.67,
    zone_minutes: { z0: 0, z1: 0, z2: 0, z3: 40, z4: 0, z5: 0 },
    ...over,
  }
}

describe('computeEngineTrends', () => {
  it('computes efficiency = speed(m/min) / avgHr', () => {
    const t = computeEngineTrends([wkt({})])
    expect(t.runs).toHaveLength(1)
    expect(t.runs[0].efficiency).toBeCloseTo(1.0, 3) // 150 m/min ÷ 150 bpm
    expect(t.runs[0].paceMinPerKm).toBeCloseTo(6.67, 2)
  })
  it('excludes runs without distance or HR, and non-running sports', () => {
    const t = computeEngineTrends([
      wkt({ distance_m: null }),
      wkt({ avg_hr: null }),
      wkt({ sport_name: 'weightlifting', avg_hr: 105, started_at: '2026-07-08T15:00:00Z' }),
    ])
    expect(t.runs).toHaveLength(0)
  })
  it('efficiency slope needs ≥3 runs', () => {
    const two = [wkt({ started_at: '2026-07-01T10:00:00Z' }), wkt({ started_at: '2026-07-05T10:00:00Z' })]
    expect(computeEngineTrends(two).efficiencySlopePctPerWeek).toBeNull()
    const three = [...two, wkt({ started_at: '2026-07-08T10:00:00Z', duration_min: 38 })]
    expect(computeEngineTrends(three).efficiencySlopePctPerWeek).not.toBeNull()
  })
})

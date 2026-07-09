import { describe, it, expect } from 'vitest'
import {
  classifyWorkout, normalizeWeightKg, berlinDateKey, weekStartKey,
  rollingAverage, linearSlopePerDay, shapeWorkout,
} from '@/lib/trends'

describe('classifyWorkout', () => {
  it('marks commuting and walking as lifestyle', () => {
    expect(classifyWorkout('commuting')).toBe('lifestyle')
    expect(classifyWorkout('walking')).toBe('lifestyle')
  })
  it('marks everything else (and null) as training', () => {
    expect(classifyWorkout('running')).toBe('training')
    expect(classifyWorkout('weightlifting')).toBe('training')
    expect(classifyWorkout(null)).toBe('training')
  })
})

describe('normalizeWeightKg', () => {
  it('passes kg through', () => expect(normalizeWeightKg(100, 'kg')).toBe(100))
  it('converts lbs', () => expect(normalizeWeightKg(100, 'lbs')).toBeCloseTo(45.359, 2))
  it('returns null for zero/null weight', () => {
    expect(normalizeWeightKg(0, 'kg')).toBeNull()
    expect(normalizeWeightKg(null, 'kg')).toBeNull()
  })
})

describe('berlinDateKey', () => {
  it('handles CEST (+2) rollover', () => expect(berlinDateKey('2026-07-08T22:30:00Z')).toBe('2026-07-09'))
  it('handles CET (+1) rollover', () => expect(berlinDateKey('2026-01-15T23:30:00Z')).toBe('2026-01-16'))
  it('keeps same-day times', () => expect(berlinDateKey('2026-07-08T10:00:00Z')).toBe('2026-07-08'))
})

describe('weekStartKey', () => {
  it('maps Wednesday to its Monday', () => expect(weekStartKey('2026-07-08')).toBe('2026-07-06'))
  it('maps Monday to itself', () => expect(weekStartKey('2026-07-06')).toBe('2026-07-06'))
  it('maps Sunday to the preceding Monday', () => expect(weekStartKey('2026-07-12')).toBe('2026-07-06'))
  it('crosses month boundaries', () => expect(weekStartKey('2026-08-01')).toBe('2026-07-27'))
})

describe('rollingAverage', () => {
  it('averages only points inside the calendar-day window', () => {
    const pts = [
      { date: '2026-07-01', value: 100 },
      { date: '2026-07-02', value: 102 },
      { date: '2026-07-10', value: 110 },
    ]
    expect(rollingAverage(pts, 7)).toEqual([
      { date: '2026-07-01', value: 100 },
      { date: '2026-07-02', value: 101 },
      { date: '2026-07-10', value: 110 },
    ])
  })
})

describe('linearSlopePerDay', () => {
  it('fits a perfect line', () => {
    const pts = [
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-02', value: 80.1 },
      { date: '2026-07-03', value: 80.2 },
    ]
    expect(linearSlopePerDay(pts)!).toBeCloseTo(0.1, 6)
  })
  it('returns null below 2 points', () => {
    expect(linearSlopePerDay([{ date: '2026-07-01', value: 80 }])).toBeNull()
  })
})

describe('shapeWorkout', () => {
  it('derives duration, pace, kcal and category from raw_json', () => {
    const shaped = shapeWorkout({
      workout_id: 'abc', cycle_id: null, started_at: '2026-07-07T10:31:06Z',
      sport_name: 'running', strain: 13.8, avg_hr: 155, max_hr: 174,
      zone0_min: 0.2, zone1_min: 0.6, zone2_min: 2.9, zone3_min: 31, zone4_min: 6.4, zone5_min: 0,
      raw_json: {
        start: '2026-07-07T10:31:06Z', end: '2026-07-07T11:12:18Z',
        score: { distance_meter: 6215.3, altitude_gain_meter: 129.2, kilojoule: 2318.9 },
      },
    })
    expect(shaped.category).toBe('training')
    expect(shaped.duration_min).toBeCloseTo(41.2, 1)
    expect(shaped.kcal).toBe(554)
    expect(shaped.pace_min_per_km!).toBeCloseTo(6.63, 2)
  })
})

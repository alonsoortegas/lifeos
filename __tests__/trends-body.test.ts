import { describe, it, expect } from 'vitest'
import { computeBodyTrend } from '@/lib/trends'
import type { TrainingPhase } from '@/lib/types'

const TODAY = '2026-07-08'

function phase(p: TrainingPhase['phase'], target: number | null = null): TrainingPhase {
  return { id: 1, phase: p, started_on: '2026-06-01', target_rate_kg_per_week: target, notes: null }
}

/** 7 weigh-ins every 3 days ending today, rising `ratePerWeek`. */
function weights(ratePerWeek: number, base = 80) {
  const dates = ['2026-06-20', '2026-06-23', '2026-06-26', '2026-06-29', '2026-07-02', '2026-07-05', '2026-07-08']
  const perDay = ratePerWeek / 7
  return dates.map((d, i) => ({ measured_on: d, weight_kg: base + perDay * i * 3 }))
}

describe('computeBodyTrend', () => {
  it('bulk on pace → on_track', () => {
    const t = computeBodyTrend(weights(0.25), phase('bulk'), TODAY)
    expect(t.ratePerWeek!).toBeCloseTo(0.25, 2)
    expect(t.targetRate).toBe(0.25)
    expect(t.verdict).toBe('on_track')
  })
  it('bulk gaining >1.5x target → fast', () => {
    expect(computeBodyTrend(weights(0.6), phase('bulk'), TODAY).verdict).toBe('fast')
  })
  it('cut losing <0.5x target → slow', () => {
    expect(computeBodyTrend(weights(-0.1), phase('cut'), TODAY).verdict).toBe('slow')
  })
  it('maintenance inside band → on_track, above → fast', () => {
    expect(computeBodyTrend(weights(0.1), phase('maintenance'), TODAY).verdict).toBe('on_track')
    expect(computeBodyTrend(weights(0.3), phase('maintenance'), TODAY).verdict).toBe('fast')
  })
  it('explicit maintenance target widens the band', () => {
    expect(computeBodyTrend(weights(0.3), phase('maintenance', 0.4), TODAY).verdict).toBe('on_track')
  })
  it('needs ≥5 weigh-ins in 21 days', () => {
    const few = weights(0.25).slice(-4)
    const t = computeBodyTrend(few, phase('bulk'), TODAY)
    expect(t.ratePerWeek).toBeNull()
    expect(t.verdict).toBeNull()
  })
  it('no phase → no target, no verdict, but still series', () => {
    const t = computeBodyTrend(weights(0.25), null, TODAY)
    expect(t.targetRate).toBeNull()
    expect(t.verdict).toBeNull()
    expect(t.weights.length).toBe(7)
    expect(t.rolling7.length).toBe(7)
  })
})

describe('computeBodyTrend · sinceStart', () => {
  it('accumulates total and average rate from the phase start, not the window', () => {
    // Phase starts 2026-06-20 (= first weigh-in): 18 days later at +0.25/wk
    const t = computeBodyTrend(weights(0.25), phase('bulk'), TODAY)
    expect(t.sinceStart).not.toBeNull()
    expect(t.sinceStart!.days).toBe(18)
    // Endpoints are 7d-rolling ("trend weight"), which lags raw weigh-ins on a
    // rising series: latest = mean(80.43, 80.54, 80.64) = 80.54, baseline = 80.0.
    expect(t.sinceStart!.totalKg).toBeCloseTo(0.54, 2)
    expect(t.sinceStart!.avgPerWeek!).toBeCloseTo(0.21, 2)
  })
  it('ignores weigh-ins before the phase start', () => {
    // Same series, but phase starts mid-way: only the tail counts
    const late: TrainingPhase = { id: 1, phase: 'bulk', started_on: '2026-07-02', target_rate_kg_per_week: null, notes: null }
    const t = computeBodyTrend(weights(0.25), late, TODAY)
    expect(t.sinceStart!.days).toBe(6) // 07-02 → 07-08
  })
  it('is null without a phase or with <2 in-phase weigh-ins', () => {
    expect(computeBodyTrend(weights(0.25), null, TODAY).sinceStart).toBeNull()
    const future: TrainingPhase = { id: 1, phase: 'bulk', started_on: '2026-07-08', target_rate_kg_per_week: null, notes: null }
    expect(computeBodyTrend(weights(0.25), future, TODAY).sinceStart).toBeNull()
  })
  it('avgPerWeek is null under 7 elapsed days', () => {
    const recent: TrainingPhase = { id: 1, phase: 'bulk', started_on: '2026-07-05', target_rate_kg_per_week: null, notes: null }
    const t = computeBodyTrend(weights(0.25), recent, TODAY)
    expect(t.sinceStart!.days).toBe(3)
    expect(t.sinceStart!.avgPerWeek).toBeNull()
  })
})

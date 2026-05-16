import { describe, it, expect } from 'vitest'
import { computeReadiness } from '../lib/readiness'
import type { WhoopSnapshot } from '../lib/types'

function snap(overrides: Partial<WhoopSnapshot> = {}): WhoopSnapshot {
  return {
    id: 0,
    cycle_id: 0,
    recorded_at: new Date().toISOString(),
    recovery_score: 80,
    rhr: 46,
    hrv_rmssd: 72,
    strain: 10,
    sleep_score: 82,
    sleep_duration_ms: 28800000,
    sleep_deep_pct: 0.2,
    sleep_rem_pct: 0.2,
    sleep_light_pct: 0.5,
    sleep_awake_pct: 0.1,
    sleep_consistency_pct: 70,
    respiratory_rate: 16,
    kilojoule: 2000,
    raw_json: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// 10 history snapshots with given values + today as index 0
function makeSnapshots(
  today: Partial<WhoopSnapshot>,
  history: Partial<WhoopSnapshot> = {},
  count = 10
): WhoopSnapshot[] {
  return [snap(today), ...Array.from({ length: count - 1 }, () => snap(history))]
}

describe('computeReadiness', () => {
  it('returns null for fewer than 3 snapshots', () => {
    expect(computeReadiness([])).toBeNull()
    expect(computeReadiness([snap()])).toBeNull()
    expect(computeReadiness([snap(), snap()])).toBeNull()
  })

  it('green — all signals supporting', () => {
    // today HRV above baseline, RHR same, sleep strong, strain below 28d avg
    const snapshots = makeSnapshots(
      { hrv_rmssd: 80, rhr: 45, sleep_score: 85, sleep_consistency_pct: 75, strain: 8 },
      { hrv_rmssd: 72, rhr: 46, sleep_score: 82, sleep_consistency_pct: 70, strain: 10 }
    )
    const result = computeReadiness(snapshots)
    expect(result).not.toBeNull()
    expect(result!.state).toBe('green')
    expect(result!.rpeCap).toBeNull()
    expect(result!.volumeCap).toBeNull()
  })

  it('controlled — one concern signal, capped RPE 8.5', () => {
    // HRV drops ~17% below baseline → concern; everything else fine
    const snapshots = makeSnapshots(
      { hrv_rmssd: 60, rhr: 47, sleep_score: 85, sleep_consistency_pct: 75, strain: 8 },
      { hrv_rmssd: 72, rhr: 46, sleep_score: 82, sleep_consistency_pct: 70, strain: 10 }
    )
    const result = computeReadiness(snapshots)
    expect(result).not.toBeNull()
    expect(result!.state).toBe('controlled')
    expect(result!.rpeCap).toBe(8.5)
  })

  it('recover — two concern signals', () => {
    // HRV -17% (concern) + RHR +7bpm (concern); sleep caution, strain fine
    const snapshots = makeSnapshots(
      { hrv_rmssd: 60, rhr: 51, sleep_score: 70, sleep_consistency_pct: 75, strain: 8 },
      { hrv_rmssd: 72, rhr: 44, sleep_score: 82, sleep_consistency_pct: 70, strain: 10 }
    )
    const result = computeReadiness(snapshots)
    expect(result).not.toBeNull()
    expect(result!.state).toBe('recover')
    expect(result!.rpeCap).toBe(6)
  })

  it('hardNo — sick signal (RHR >10bpm spike)', () => {
    // RHR delta = 57-44 = 13 > 10 → sickSignal → hardNo
    const snapshots = makeSnapshots(
      { hrv_rmssd: 60, rhr: 57, sleep_score: 55, sleep_consistency_pct: 45, strain: 15 },
      { hrv_rmssd: 72, rhr: 44, sleep_score: 82, sleep_consistency_pct: 70, strain: 10 }
    )
    const result = computeReadiness(snapshots)
    expect(result).not.toBeNull()
    expect(result!.state).toBe('hardNo')
    expect(result!.rpeCap).toBe(0)
  })

  it('missing fields — null HRV and sleep_score, still returns a result', () => {
    const snapshots = makeSnapshots(
      { hrv_rmssd: null, sleep_score: null, rhr: 46, sleep_consistency_pct: 70, strain: 10 },
      { hrv_rmssd: null, sleep_score: null, rhr: 46, sleep_consistency_pct: 70, strain: 10 }
    )
    const result = computeReadiness(snapshots)
    expect(result).not.toBeNull()
    // With null HRV the baseline is 0 → hrvPct is 0 → 'support'; sleep_score=0 → 'concern'
    // At minimum we get a typed result with all signal keys present
    expect(result!.signals.hrv).toBeDefined()
    expect(result!.signals.rhr).toBeDefined()
    expect(result!.signals.sleepScore).toBeDefined()
    expect(result!.signals.sleepConsist).toBeDefined()
    expect(result!.signals.strain7d).toBeDefined()
  })
})

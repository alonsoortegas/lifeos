import { describe, expect, it } from 'vitest'
import {
  calculateBackfillDays,
  type SnapshotCoverage,
} from '../supabase/functions/whoop-sync/backfill'

const now = new Date('2026-06-10T12:00:00.000Z')

function snapshot(
  daysAgo: number,
  overrides: Partial<SnapshotCoverage> = {},
): SnapshotCoverage {
  const recordedAt = new Date(now)
  recordedAt.setUTCDate(recordedAt.getUTCDate() - daysAgo)

  return {
    recorded_at: recordedAt.toISOString(),
    sleep_score: 80,
    sleep_duration_ms: 8 * 60 * 60 * 1000,
    ...overrides,
  }
}

describe('calculateBackfillDays', () => {
  it('requests only the latest record when all sleep days are complete', () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot(index + 1)
    )

    expect(calculateBackfillDays(snapshots, now)).toBe(1)
  })

  it('backfills through the oldest entirely missing day', () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot(index + 1)
    ).filter((row) => row.recorded_at.slice(0, 10) !== '2026-06-04')

    expect(calculateBackfillDays(snapshots, now)).toBe(7)
  })

  it('treats a null sleep score as an incomplete day', () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot(index + 1, index === 8 ? { sleep_score: null } : {})
    )

    expect(calculateBackfillDays(snapshots, now)).toBe(10)
  })

  it('treats a null sleep duration as an incomplete day', () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot(index + 1, index === 3 ? { sleep_duration_ms: null } : {})
    )

    expect(calculateBackfillDays(snapshots, now)).toBe(5)
  })

  it('accepts a date when any snapshot for that date has complete sleep data', () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      snapshot(index + 1)
    )
    snapshots.push(snapshot(7, { sleep_score: null, sleep_duration_ms: null }))

    expect(calculateBackfillDays(snapshots, now)).toBe(1)
  })

  it('can scan a 30-day production window beyond one WHOOP page', () => {
    const snapshots = Array.from({ length: 30 }, (_, index) =>
      snapshot(index + 1, index === 26 ? { sleep_score: null } : {})
    )

    expect(calculateBackfillDays(snapshots, now, 30, 60)).toBe(28)
  })
})

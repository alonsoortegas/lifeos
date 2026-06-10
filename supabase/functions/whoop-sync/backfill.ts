export type SnapshotCoverage = {
  recorded_at: string
  sleep_score: number | null
  sleep_duration_ms: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function calculateBackfillDays(
  snapshots: SnapshotCoverage[],
  now: Date,
  lookbackDays = 14,
  maxRecords = 25,
): number {
  const completeSleepDates = new Set(
    snapshots
      .filter((snapshot) =>
        snapshot.sleep_score != null && snapshot.sleep_duration_ms != null
      )
      .map((snapshot) => new Date(snapshot.recorded_at).toISOString().slice(0, 10))
  )

  for (let daysAgo = lookbackDays; daysAgo >= 1; daysAgo--) {
    const date = new Date(now.getTime() - daysAgo * DAY_MS)
    const key = date.toISOString().slice(0, 10)
    if (!completeSleepDates.has(key)) {
      return Math.min(daysAgo + 1, maxRecords)
    }
  }

  return 1
}

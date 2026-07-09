// Pure trend-metric functions for the Trends tab.
// No I/O here — everything is (rows, params) → series/summary, unit-tested in __tests__/.
import type { PhaseKind, TrainingPhase } from '@/lib/types'

export type { PhaseKind, TrainingPhase }

// ── Phase constants ───────────────────────────────────────────────────────────
export const PHASE_DEFAULT_RATE: Record<PhaseKind, number> = {
  bulk: 0.25,
  cut: -0.5,
  maintenance: 0,
}
export const MAINTENANCE_BAND_KG = 0.15

// ── Workout classification & shaping (shared with lib/mcp/db.ts) ────────────
// Commuting/walking are lifestyle movement, not training — stored but filtered
// out of training analysis.
const LIFESTYLE_SPORTS = new Set(['commuting', 'walking'])

export type WorkoutCategory = 'training' | 'lifestyle'

export function classifyWorkout(sportName: string | null): WorkoutCategory {
  return sportName && LIFESTYLE_SPORTS.has(sportName.toLowerCase()) ? 'lifestyle' : 'training'
}

export interface RawWorkoutRow {
  workout_id: string
  cycle_id: number | null
  started_at: string
  sport_name: string | null
  strain: number | null
  avg_hr: number | null
  max_hr: number | null
  zone0_min: number | null; zone1_min: number | null; zone2_min: number | null
  zone3_min: number | null; zone4_min: number | null; zone5_min: number | null
  raw_json: Record<string, unknown> | null
}

export interface ShapedWorkout {
  workout_id: string
  started_at: string
  sport_name: string | null
  category: WorkoutCategory
  strain: number | null
  avg_hr: number | null
  max_hr: number | null
  duration_min: number | null
  distance_m: number | null
  altitude_gain_m: number | null
  kilojoule: number | null
  kcal: number | null
  pace_min_per_km: number | null
  zone_minutes: { z0: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }
}

// Flatten a stored workout into an analysis-friendly shape, deriving duration,
// distance, pace, and energy from raw_json (columns only keep strain/HR/zones).
export function shapeWorkout(w: RawWorkoutRow): ShapedWorkout {
  const raw = (w.raw_json ?? {}) as Record<string, unknown>
  const score = (raw.score ?? {}) as Record<string, number | null>
  const start = raw.start ? new Date(raw.start as string) : new Date(w.started_at)
  const end = raw.end ? new Date(raw.end as string) : null
  const duration_min = end ? Math.round(((end.getTime() - start.getTime()) / 60000) * 10) / 10 : null
  const distance_m = score.distance_meter ?? null
  const kilojoule = score.kilojoule ?? null
  const kcal = kilojoule != null ? Math.round(kilojoule / 4.184) : null
  const pace_min_per_km =
    distance_m && distance_m > 0 && duration_min != null
      ? Math.round((duration_min / (distance_m / 1000)) * 100) / 100
      : null
  return {
    workout_id: w.workout_id,
    started_at: w.started_at,
    sport_name: w.sport_name,
    category: classifyWorkout(w.sport_name),
    strain: w.strain,
    avg_hr: w.avg_hr,
    max_hr: w.max_hr,
    duration_min,
    distance_m,
    altitude_gain_m: score.altitude_gain_meter ?? null,
    kilojoule,
    kcal,
    pace_min_per_km,
    zone_minutes: {
      z0: w.zone0_min, z1: w.zone1_min, z2: w.zone2_min,
      z3: w.zone3_min, z4: w.zone4_min, z5: w.zone5_min,
    },
  }
}

// ── Units ─────────────────────────────────────────────────────────────────────
// workout_logs.weight_lbs holds mixed units: the app writes kg (weight_unit
// 'kg'), the MCP tool writes lbs (weight_unit 'lbs'). Normalize once here.
export function normalizeWeightKg(weight: number | null, unit: string | null): number | null {
  if (weight == null || weight <= 0) return null
  return unit === 'lbs' ? weight * 0.45359237 : weight
}

// ── Dates & weeks ─────────────────────────────────────────────────────────────
const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function berlinDateKey(iso: string): string {
  return BERLIN_DATE.format(new Date(iso))
}

function dayNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000)
}

/** Monday-start week key for a YYYY-MM-DD date key. */
export function weekStartKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ── Series math ───────────────────────────────────────────────────────────────
export interface DatedValue { date: string; value: number }

/** Trailing calendar-day rolling average; input need not be contiguous. */
export function rollingAverage(points: DatedValue[], windowDays: number): DatedValue[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p) => {
    const end = dayNumber(p.date)
    const inWindow = sorted.filter((q) => {
      const d = dayNumber(q.date)
      return d > end - windowDays && d <= end
    })
    const mean = inWindow.reduce((s, q) => s + q.value, 0) / inWindow.length
    return { date: p.date, value: Math.round(mean * 100) / 100 }
  })
}

/** Least-squares slope in value-units per day. Null below 2 points. */
export function linearSlopePerDay(points: DatedValue[]): number | null {
  if (points.length < 2) return null
  const x0 = dayNumber(points[0].date)
  const xs = points.map((p) => dayNumber(p.date) - x0)
  const ys = points.map((p) => p.value)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den === 0 ? null : num / den
}

// ── Body & phase ──────────────────────────────────────────────────────────────
export type Verdict = 'on_track' | 'fast' | 'slow'

export interface BodyTrend {
  weights: DatedValue[]
  rolling7: DatedValue[]
  /** Rolling last-21-days rate — "what is my weight doing right now". */
  ratePerWeek: number | null
  targetRate: number | null
  verdict: Verdict | null
  /** Phase-cumulative view — "how is the whole phase going". Uses 7d-rolling
   *  values at both ends to smooth weigh-in noise. Null without a phase or
   *  with fewer than 2 in-phase weigh-ins. */
  sinceStart: { totalKg: number; avgPerWeek: number | null; days: number } | null
}

function rateVerdict(rate: number, phase: TrainingPhase): Verdict {
  if (phase.phase === 'maintenance') {
    const band = phase.target_rate_kg_per_week != null
      ? Math.abs(phase.target_rate_kg_per_week)
      : MAINTENANCE_BAND_KG
    if (Math.abs(rate) <= band) return 'on_track'
    return rate > 0 ? 'fast' : 'slow'
  }
  const target = phase.target_rate_kg_per_week ?? PHASE_DEFAULT_RATE[phase.phase]
  const ratio = rate / target
  if (ratio > 1.5) return 'fast'
  if (ratio < 0.5) return 'slow'
  return 'on_track'
}

export function computeBodyTrend(
  measurements: { measured_on: string; weight_kg: number | null }[],
  phase: TrainingPhase | null,
  todayKey: string,
): BodyTrend {
  const weights: DatedValue[] = measurements
    .filter((m) => m.weight_kg != null && m.weight_kg > 0)
    .map((m) => ({ date: m.measured_on, value: Number(m.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const rolling7 = rollingAverage(weights, 7)

  // Weekly rate = least-squares fit over the last 21 days; needs ≥5 weigh-ins.
  const cutoff = dayNumber(todayKey) - 21
  const recent = weights.filter((w) => dayNumber(w.date) > cutoff)
  const slope = recent.length >= 5 ? linearSlopePerDay(recent) : null
  const ratePerWeek = slope != null ? Math.round(slope * 7 * 100) / 100 : null

  let targetRate: number | null = null
  let verdict: Verdict | null = null
  let sinceStart: BodyTrend['sinceStart'] = null
  if (phase) {
    targetRate = phase.target_rate_kg_per_week ?? PHASE_DEFAULT_RATE[phase.phase]
    if (ratePerWeek != null) verdict = rateVerdict(ratePerWeek, phase)

    const startDay = dayNumber(phase.started_on)
    const inPhase = weights.filter((w) => dayNumber(w.date) >= startDay)
    if (inPhase.length >= 2) {
      const rollByDate = new Map(rolling7.map((p) => [p.date, p.value]))
      const baseline = rollByDate.get(inPhase[0].date) ?? inPhase[0].value
      const latest = rolling7.length ? rolling7[rolling7.length - 1].value : weights[weights.length - 1].value
      const days = dayNumber(inPhase[inPhase.length - 1].date) - dayNumber(inPhase[0].date)
      const totalKg = Math.round((latest - baseline) * 100) / 100
      sinceStart = {
        totalKg,
        avgPerWeek: days >= 7 ? Math.round(((totalKg / days) * 7) * 100) / 100 : null,
        days,
      }
    }
  }
  return { weights, rolling7, ratePerWeek, targetRate, verdict, sinceStart }
}

// ── Strength (from manually logged sets) ─────────────────────────────────────
export type Chip = 'up' | 'flat' | 'down'

export function epley1RM(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30)
}

export interface StrengthLogRow {
  logged_at: string
  exercise_name: string
  weight_lbs: number | null
  weight_unit: string | null
  reps: number | null
}

export interface ExerciseTrend {
  exercise: string
  points: DatedValue[]
  slopePctPerWeek: number | null
}

export interface StrengthTrends {
  exercises: ExerciseTrend[]
  weeklyTonnage: { week: string; kg: number }[]
  strengthChip: Chip | null
  volumeChip: Chip | null
}

export function computeStrengthTrends(logs: StrengthLogRow[], todayKey: string, topN = 6): StrengthTrends {
  const sets = logs.flatMap((l) => {
    const kg = normalizeWeightKg(l.weight_lbs, l.weight_unit)
    if (kg == null || !l.reps || l.reps <= 0) return []
    return [{ exercise: l.exercise_name, date: berlinDateKey(l.logged_at), kg, reps: l.reps }]
  })

  // Key lifts = most-logged exercises in range.
  const counts = new Map<string, number>()
  for (const s of sets) counts.set(s.exercise, (counts.get(s.exercise) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([e]) => e)

  const exercises: ExerciseTrend[] = top.map((exercise) => {
    const best = new Map<string, number>() // date → best e1RM that session
    for (const s of sets) {
      if (s.exercise !== exercise) continue
      const e1 = epley1RM(s.kg, s.reps)
      best.set(s.date, Math.max(best.get(s.date) ?? 0, e1))
    }
    const points = [...best.entries()]
      .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date))
    let slopePctPerWeek: number | null = null
    if (points.length >= 3) {
      const slope = linearSlopePerDay(points)
      const mean = points.reduce((s, p) => s + p.value, 0) / points.length
      if (slope != null && mean > 0) slopePctPerWeek = Math.round(((slope * 7) / mean) * 1000) / 10
    }
    return { exercise, points, slopePctPerWeek }
  })

  const tonnage = new Map<string, number>()
  for (const s of sets) {
    const wk = weekStartKey(s.date)
    tonnage.set(wk, (tonnage.get(wk) ?? 0) + s.kg * s.reps)
  }
  const weeklyTonnage = [...tonnage.entries()]
    .map(([week, kg]) => ({ week, kg: Math.round(kg) }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Strength chip: median e1RM slope across key lifts, ±1%/week.
  const slopes = exercises
    .map((e) => e.slopePctPerWeek)
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b)
  let strengthChip: Chip | null = null
  if (slopes.length) {
    const median = slopes[Math.floor(slopes.length / 2)]
    strengthChip = median > 1 ? 'up' : median < -1 ? 'down' : 'flat'
  }

  // Volume chip: mean of last 3 complete weeks vs the prior 3, ±5%.
  const currentWeek = weekStartKey(todayKey)
  const complete = weeklyTonnage.filter((w) => w.week < currentWeek)
  const last3 = complete.slice(-3)
  const prev3 = complete.slice(-6, -3)
  let volumeChip: Chip | null = null
  if (last3.length && prev3.length) {
    const mean = (a: { kg: number }[]) => a.reduce((s, w) => s + w.kg, 0) / a.length
    const changePct = ((mean(last3) - mean(prev3)) / mean(prev3)) * 100
    volumeChip = changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat'
  }

  return { exercises, weeklyTonnage, strengthChip, volumeChip }
}

// ── Engine (aerobic fitness) ─────────────────────────────────────────────────
export interface RunPoint {
  date: string
  paceMinPerKm: number
  avgHr: number
  efficiency: number // meters per minute per bpm — higher is fitter
  elevationGainM: number | null
}

export interface EngineTrends {
  runs: RunPoint[]
  efficiencySlopePctPerWeek: number | null
}

// Recovery/HRV live on the Whoop tab and lifting HR is too noisy to be a
// fitness signal — Engine keeps only what no other tab has: running trends.
export function computeEngineTrends(workouts: ShapedWorkout[]): EngineTrends {
  const runs: RunPoint[] = workouts
    .filter((w) =>
      w.sport_name === 'running' &&
      (w.distance_m ?? 0) > 0 &&
      (w.duration_min ?? 0) > 0 &&
      (w.avg_hr ?? 0) > 0,
    )
    .map((w) => {
      const speed = w.distance_m! / w.duration_min! // m/min
      return {
        date: berlinDateKey(w.started_at),
        paceMinPerKm: Math.round((w.duration_min! / (w.distance_m! / 1000)) * 100) / 100,
        avgHr: w.avg_hr!,
        efficiency: Math.round((speed / w.avg_hr!) * 1000) / 1000,
        elevationGainM: w.altitude_gain_m,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  let efficiencySlopePctPerWeek: number | null = null
  if (runs.length >= 3) {
    const pts = runs.map((r) => ({ date: r.date, value: r.efficiency }))
    const slope = linearSlopePerDay(pts)
    const mean = pts.reduce((s, p) => s + p.value, 0) / pts.length
    if (slope != null && mean > 0) efficiencySlopePctPerWeek = Math.round(((slope * 7) / mean) * 1000) / 10
  }

  return { runs, efficiencySlopePctPerWeek }
}

// ── Load ──────────────────────────────────────────────────────────────────────
export interface LoadWeek {
  week: string
  trainingMin: number
  lifestyleMin: number
  sessions: number
  strain: number
}

export interface LoadTrends {
  weeks: LoadWeek[]
  totalTrainingMin: number
  totalLifestyleMin: number
}

function workoutMinutes(w: ShapedWorkout): number {
  if (w.duration_min != null) return w.duration_min
  const z = w.zone_minutes
  return [z.z0, z.z1, z.z2, z.z3, z.z4, z.z5].reduce<number>((s, v) => s + (v ?? 0), 0)
}

export function computeLoadTrends(
  workouts: ShapedWorkout[],
  snapshots: { recorded_at: string; strain: number | null }[],
): LoadTrends {
  const weeks = new Map<string, LoadWeek>()
  const get = (wk: string): LoadWeek => {
    if (!weeks.has(wk)) weeks.set(wk, { week: wk, trainingMin: 0, lifestyleMin: 0, sessions: 0, strain: 0 })
    return weeks.get(wk)!
  }

  for (const w of workouts) {
    const row = get(weekStartKey(berlinDateKey(w.started_at)))
    const min = workoutMinutes(w)
    if (w.category === 'training') {
      row.trainingMin += min
      row.sessions += 1
    } else {
      row.lifestyleMin += min
    }
  }
  for (const s of snapshots) {
    if (s.strain == null) continue
    get(weekStartKey(berlinDateKey(s.recorded_at))).strain += Number(s.strain)
  }

  const sorted = [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({
      ...w,
      trainingMin: Math.round(w.trainingMin),
      lifestyleMin: Math.round(w.lifestyleMin),
      strain: Math.round(w.strain * 10) / 10,
    }))

  return {
    weeks: sorted,
    totalTrainingMin: sorted.reduce((s, w) => s + w.trainingMin, 0),
    totalLifestyleMin: sorted.reduce((s, w) => s + w.lifestyleMin, 0),
  }
}

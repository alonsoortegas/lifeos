import type { MacroTotals } from '@/lib/nutrition'

// ─── Monthly Review scoring ──────────────────────────────────────────────────
// Pure, deterministic, unit-tested — the same contract as lib/readiness.ts.
// Three channels per goal-day, never collapsed into one number: the point of
// the review is seeing WHICH system slipped.

export type ChannelState = 'on' | 'partial' | 'off' | 'none'

export interface DayDetail {
  todos: Array<{ text: string; done: boolean }>
  briefHeadline: string | null
  trainingVerdict: string | null
  adherence: string | null
  setsLogged: number
  avgRpe: number | null
  consumed: MacroTotals | null
  targets: { calories: number; protein_g: number } | null
}

export interface DayScore {
  date: string
  goals: ChannelState
  training: ChannelState
  fuel: ChannelState
  recovery: number | null
  readiness_state: string | null
  detail: DayDetail
}

export interface MonthSummary {
  goalsOnPct: number | null
  trainingOnPct: number | null
  fuelOnPct: number | null
  currentStreak: number
  bestStreak: number
  avgRecovery: number | null
  prevAvgRecovery: number | null
}

// Goals: 100% done ⇒ on · ≥50% ⇒ partial · else off · no todos ⇒ none.
export function scoreGoals(todos: Array<{ done: boolean }>): ChannelState {
  if (!todos.length) return 'none'
  const done = todos.filter(t => t.done).length
  if (done === todos.length) return 'on'
  if (done / todos.length >= 0.5) return 'partial'
  return 'off'
}

export interface TrainingScoreInput {
  /** ai_brief_outcomes.training_adherence when a brief existed for the day */
  adherence: string | null
  hadLogs: boolean
  /** plan active and DAY_META has a gym session for that weekday */
  expectedSession: boolean
}

// Training: adherence label is authoritative; fall back to logs vs expectation.
export function scoreTraining({ adherence, hadLogs, expectedSession }: TrainingScoreInput): ChannelState {
  if (adherence) {
    if (adherence === 'followed') return 'on'
    if (adherence === 'deviated_easier' || adherence === 'unknown') return 'partial'
    return 'off' // skipped | deviated_harder
  }
  if (!expectedSession) return hadLogs ? 'on' : 'none'
  return hadLogs ? 'on' : 'off'
}

export interface FuelScoreInput {
  consumed: MacroTotals | null
  targets: { calories: number; protein_g: number } | null
}

// Fuel: kcal within ±10% AND protein ≥90% ⇒ on · one of two ⇒ partial.
export function scoreFuel({ consumed, targets }: FuelScoreInput): ChannelState {
  if (!targets || !consumed) return 'none'
  if (consumed.calories <= 0) return 'none' // nothing logged ≠ fasting
  const kcalOk = targets.calories > 0 &&
    Math.abs(consumed.calories - targets.calories) / targets.calories <= 0.1
  const proteinOk = targets.protein_g > 0 &&
    consumed.protein_g >= targets.protein_g * 0.9
  if (kcalOk && proteinOk) return 'on'
  if (kcalOk || proteinOk) return 'partial'
  return 'off'
}

/** A day counts toward the streak when nothing slipped: no channel `off`
 *  and at least one channel actively `on`. */
export function isOnPointDay(day: Pick<DayScore, 'goals' | 'training' | 'fuel'>): boolean {
  const states = [day.goals, day.training, day.fuel]
  return !states.includes('off') && states.includes('on')
}

function channelPct(days: DayScore[], channel: 'goals' | 'training' | 'fuel'): number | null {
  const scored = days.filter(d => d[channel] !== 'none')
  if (!scored.length) return null
  return Math.round((scored.filter(d => d[channel] === 'on').length / scored.length) * 100)
}

export function buildMonthSummary(
  days: DayScore[],
  prevAvgRecovery: number | null = null,
): MonthSummary {
  const recoveries = days.map(d => d.recovery).filter((r): r is number => r != null)

  let bestStreak = 0
  let run = 0
  for (const day of days) {
    if (isOnPointDay(day)) {
      run += 1
      bestStreak = Math.max(bestStreak, run)
    } else if (day.goals !== 'none' || day.training !== 'none' || day.fuel !== 'none') {
      run = 0
    }
    // fully-empty days (future or untracked) don't break a streak
  }

  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]
    const empty = day.goals === 'none' && day.training === 'none' && day.fuel === 'none'
    if (empty) continue
    if (isOnPointDay(day)) currentStreak += 1
    else break
  }

  return {
    goalsOnPct: channelPct(days, 'goals'),
    trainingOnPct: channelPct(days, 'training'),
    fuelOnPct: channelPct(days, 'fuel'),
    currentStreak,
    bestStreak,
    avgRecovery: recoveries.length
      ? Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length)
      : null,
    prevAvgRecovery,
  }
}

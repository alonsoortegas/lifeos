import type { ExerciseModality } from '@/lib/types'
import type { Readiness } from '@/lib/readiness'

// ─── Portable-text formatters ────────────────────────────────────────────────
// Whoop has no write API for workouts, so the hand-off mechanism is perfectly
// formatted text: paste into Whoop AI, a coach chat, or any LLM.

export interface ShareSet {
  setNum: number
  weight: number
  reps: number
  rpe: number
  distance_m?: number
  duration_s?: number
}

export interface ShareExercise {
  name: string
  modality: ExerciseModality
  sets: ShareSet[]
}

export interface ShareWorkoutInput {
  title: string
  sessionType?: string | null
  weekNumber?: number | null
  date: Date
  exercises: ShareExercise[]
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtRpeList(sets: ShareSet[]): string {
  const rpes = sets.map(s => s.rpe).filter(r => r > 0)
  if (!rpes.length) return ''
  const uniform = rpes.every(r => r === rpes[0])
  return uniform ? `RPE ${rpes[0]}` : `RPE ${rpes.join(', ')}`
}

function strengthLine(ex: ShareExercise): string {
  const sets = ex.sets
  const uniform =
    sets.every(s => s.weight === sets[0].weight) &&
    sets.every(s => s.reps === sets[0].reps)
  const rpe = fmtRpeList(sets)
  const rpeSuffix = rpe ? ` (${rpe})` : ''

  if (uniform) {
    const load = sets[0].weight > 0 ? ` @ ${sets[0].weight} kg` : ' (bodyweight)'
    return `${ex.name}: ${sets.length}×${sets[0].reps}${load}${rpeSuffix}`
  }
  const parts = sets.map(s =>
    s.weight > 0 ? `${s.weight} kg × ${s.reps}` : `BW × ${s.reps}`
  )
  return `${ex.name}: ${parts.join(', ')}${rpeSuffix}`
}

function ergLine(ex: ShareExercise): string {
  const parts = ex.sets.map(s => {
    const dist = s.distance_m ? `${s.distance_m}m` : ''
    const time = s.duration_s ? ` in ${fmtDuration(s.duration_s)}` : ''
    return `${dist}${time}` || 'interval'
  })
  return `${ex.name}: ${ex.sets.length}× ${parts.join(', ')}`
}

function carryLine(ex: ShareExercise): string {
  const parts = ex.sets.map(s => {
    const load = s.weight > 0 ? `${s.weight} kg` : 'BW'
    const dist = s.distance_m ? ` × ${s.distance_m}m` : ''
    return `${load}${dist}`
  })
  return `${ex.name}: ${parts.join(', ')}`
}

/** Paste-ready workout summary (for Whoop AI, coaches, journals). */
export function formatWorkoutText(input: ShareWorkoutInput): string {
  const logged = input.exercises.filter(ex => ex.sets.length > 0)
  const header = [
    input.title,
    input.weekNumber ? `Week ${input.weekNumber}` : null,
    fmtDate(input.date),
  ].filter(Boolean).join(' — ')

  const lines = logged.map(ex => {
    if (ex.modality === 'erg') return ergLine(ex)
    if (ex.modality === 'carry') return carryLine(ex)
    return strengthLine(ex)
  })

  const totalSets = logged.reduce((sum, ex) => sum + ex.sets.length, 0)
  const kind = input.sessionType ? `${input.sessionType} session` : 'Workout'

  return [
    `${kind}: ${header}`,
    ...lines,
    `Total: ${logged.length} exercises · ${totalSets} sets`,
  ].join('\n')
}

export interface ShareDayInput {
  date: Date
  readiness: Readiness | null
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleepScore: number | null
  strainYesterday?: number | null
  topTodo: string | null
  nutritionRemaining: { calories: number; protein_g: number } | null
}

/** Paste-ready day snapshot (readiness + vitals + goals + fuel). */
export function formatDayText(input: ShareDayInput): string {
  const lines: string[] = [`LifeOS day summary — ${fmtDate(input.date)}`]

  if (input.readiness) {
    lines.push(`Readiness: ${input.readiness.state.toUpperCase()} — ${input.readiness.headline}`)
    lines.push(...input.readiness.rationale.map(r => `· ${r}`))
  }
  const vitals: string[] = []
  if (input.recovery != null) vitals.push(`recovery ${input.recovery}%`)
  if (input.hrv != null) vitals.push(`HRV ${input.hrv.toFixed(1)} ms`)
  if (input.rhr != null) vitals.push(`RHR ${input.rhr} bpm`)
  if (input.sleepScore != null) vitals.push(`sleep ${input.sleepScore}%`)
  if (vitals.length) lines.push(`Vitals: ${vitals.join(' · ')}`)
  if (input.strainYesterday != null) lines.push(`Yesterday strain: ${input.strainYesterday.toFixed(1)}`)
  if (input.topTodo) lines.push(`Top goal: ${input.topTodo}`)
  if (input.nutritionRemaining) {
    lines.push(`Fuel remaining: ${Math.round(input.nutritionRemaining.calories)} kcal · ${Math.round(input.nutritionRemaining.protein_g)} g protein`)
  }
  return lines.join('\n')
}

// ─── Delivery ────────────────────────────────────────────────────────────────

export type ShareResult = 'shared' | 'copied' | 'failed'

/** Native share sheet when available (mobile), else clipboard. */
export async function shareText(text: string, title = 'LifeOS'): Promise<ShareResult> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      // AbortError = user dismissed the sheet; fall through to clipboard.
      if ((error as Error).name !== 'AbortError') {
        // continue to clipboard fallback
      }
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

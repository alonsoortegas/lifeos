'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Card from '@/components/ui/Card'
import type { WorkoutSession, WorkoutExercise, WorkoutLog } from '@/lib/types'
import { getDayMeta, getPlanStatus, getTodayKey, DAY_ORDER } from '@/lib/workout'
import { formatWorkoutText, shareText, type ShareExercise } from '@/lib/share'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

// Normalise a weight string typed by the user — accept both "," and "." as decimal separator
function parseWeightInput(raw: string): number | null {
  const normalized = raw.replace(',', '.')
  const val = parseFloat(normalized)
  return Number.isFinite(val) && val >= 0 ? val : null
}

// Returns the upper bound of a prescribed_reps string ("4-5" → 5, "8/leg" → 8, "5" → 5)
function parseTopReps(r: string | null): number | null {
  if (!r) return null
  const range = r.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return parseInt(range[2], 10)
  const single = r.match(/\d+/)
  return single ? parseInt(single[0], 10) : null
}

// If the last set hit or exceeded the top of the prescribed rep range, suggest +2.5kg
function getProgressionSuggestion(ex: WorkoutExercise, last: WorkoutLog | undefined): number | null {
  if (!last?.weight_lbs || last.weight_lbs <= 0) return null
  const top = parseTopReps(ex.prescribed_reps)
  if (top === null) return null
  return (last.reps ?? 0) >= top ? last.weight_lbs + 2.5 : null
}

// Parse a prescribed_reps string to a numeric default (e.g. "4-5" → 4, "8/leg" → 8)
function parseReps(r: string | null): number {
  if (!r) return 5
  const match = r.match(/\d+/)
  return match ? parseInt(match[0], 10) : 5
}

// Parse target_rpe to numeric default
function parseRpe(r: string | null): number {
  if (!r) return 8
  const match = r.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : 8
}

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

interface ExerciseState {
  expanded: boolean
  weight: number
  weightText: string
  selectedReps: number
  selectedRpe: number
  selectedDistance: number
  selectedDuration: number
  loggedSets: { id?: number; setNum: number; weight: number; reps: number; rpe: number; distance_m?: number; duration_s?: number; loggedAt?: string }[]
}

interface ExerciseFormState {
  name: string
  sets: string
  reps: string
  weight: string
  rpe: string
  notes: string
}

const EMPTY_EXERCISE_FORM: ExerciseFormState = {
  name: '',
  sets: '',
  reps: '',
  weight: '',
  rpe: '',
  notes: '',
}

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default function WorkoutTab({ canAddExercises = false }: { canAddExercises?: boolean }) {
  const today = getTodayKey()
  const currentPlan = getPlanStatus()
  const currentWeek = currentPlan.week

  const [selectedDay, setSelectedDay] = useState(today)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [lastSets, setLastSets] = useState<Record<string, WorkoutLog>>({})
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(EMPTY_EXERCISE_FORM)
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied'>('idle')

  async function shareWorkout() {
    if (!session) return
    const shareExercises: ShareExercise[] = exercises.map((ex, i) => ({
      name: ex.exercise_name,
      modality: ex.modality,
      sets: (exerciseStates[i]?.loggedSets ?? []).map(s => ({
        setNum: s.setNum,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        distance_m: s.distance_m,
        duration_s: s.duration_s,
      })),
    }))
    const result = await shareText(formatWorkoutText({
      title: session.title,
      sessionType: session.session_type,
      weekNumber: currentWeek,
      date: new Date(),
      exercises: shareExercises,
    }))
    if (result !== 'failed') {
      setShareState(result)
      window.setTimeout(() => setShareState('idle'), 1800)
    }
  }

  const loadSession = useCallback(async (day: string) => {
    setLoading(true)
    setSession(null)
    setExercises([])
    setExerciseStates([])
    setAddOpen(false)
    setAddError(null)
    setLogError(null)

    if (currentWeek == null) {
      setLoading(false)
      return
    }

    const dbKey = getDayMeta(day, currentPlan.blockSlug).dbKey ?? day

    const { data: sessionData } = await supabase
      .from('workout_sessions')
      .select('*')
      .eq('block_slug', currentPlan.blockSlug)
      .eq('week_number', currentWeek)
      .eq('day_of_week', dbKey)
      .single()

    if (!sessionData) { setLoading(false); return }
    setSession(sessionData as WorkoutSession)

    const { data: exData } = await supabase
      .from('workout_exercises')
      .select('*')
      .eq('session_id', sessionData.id)
      .order('order_index')

    const exList = (exData ?? []) as WorkoutExercise[]
    setExercises(exList)

    // Load last logged set per exercise from a previous session (before today)
    if (exList.length > 0) {
      const names = exList.map(e => e.exercise_name)
      const { start, end } = todayRange()
      const { data: logData } = await supabase
        .from('workout_logs')
        .select('*')
        .in('exercise_name', names)
        .lt('logged_at', start)
        .order('logged_at', { ascending: false })

      const last: Record<string, WorkoutLog> = {}
      for (const log of (logData ?? []) as WorkoutLog[]) {
        if (!last[log.exercise_name]) last[log.exercise_name] = log
      }
      setLastSets(last)

      const { data: scopedLogData, error: scopedLogError } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('workout_session_id', sessionData.id)
        .order('logged_at', { ascending: true })

      let scopedLogs = (scopedLogData ?? []) as WorkoutLog[]

      if (scopedLogError) {
        const { data: fallbackLogData } = await supabase
          .from('workout_logs')
          .select('*')
          .in('exercise_name', names)
          .gte('logged_at', start)
          .lt('logged_at', end)
          .order('logged_at', { ascending: true })

        scopedLogs = (fallbackLogData ?? []) as WorkoutLog[]
      }

      setExerciseStates(exList.map(ex => {
        const initWeight = ex.prescribed_weight ?? last[ex.exercise_name]?.weight_lbs ?? 0
        return {
        expanded: false,
        weight: initWeight,
        weightText: String(initWeight),
        selectedReps: parseReps(ex.prescribed_reps),
        selectedRpe: parseRpe(ex.target_rpe),
        selectedDistance: last[ex.exercise_name]?.distance_m ?? 500,
        selectedDuration: last[ex.exercise_name]?.duration_s ?? 120,
        loggedSets: scopedLogs
          .filter(log => log.workout_exercise_id === ex.id || (!log.workout_exercise_id && log.exercise_name === ex.exercise_name))
          .map((log, idx) => ({
            id: log.id,
            setNum: log.set_number ?? idx + 1,
            weight: log.weight_lbs ?? 0,
            reps: log.reps ?? 0,
            rpe: log.rpe ?? 0,
            distance_m: log.distance_m ?? undefined,
            duration_s: log.duration_s ?? undefined,
            loggedAt: log.logged_at,
          })),
      }
      }))
    }

    setLoading(false)
  }, [currentPlan.blockSlug, currentWeek])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadSession(selectedDay)
    }, 0)

    return () => window.clearTimeout(id)
  }, [selectedDay, loadSession])

  const updateState = (i: number, patch: Partial<ExerciseState>) =>
    setExerciseStates(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const updateExerciseForm = (patch: Partial<ExerciseFormState>) => {
    setExerciseForm(prev => ({ ...prev, ...patch }))
    setAddError(null)
  }

  const addExercise = async () => {
    if (addSaving) return
    if (currentWeek == null) {
      setAddError('Start a new training block before adding planned exercises')
      return
    }

    const name = exerciseForm.name.trim()
    if (!name) {
      setAddError('Exercise name is required')
      return
    }

    const parsedSets = exerciseForm.sets ? Number.parseInt(exerciseForm.sets, 10) : Number.NaN
    const parsedWeight = exerciseForm.weight ? Number.parseFloat(exerciseForm.weight) : Number.NaN
    const orderIndex = exercises.reduce((max, ex) => Math.max(max, ex.order_index), -1) + 1

    setAddSaving(true)
    setAddError(null)

    let currentSession = session
    if (!currentSession) {
      const selectedMeta = getDayMeta(selectedDay, currentPlan.blockSlug)
      const dayKey = selectedMeta.dbKey ?? selectedDay
      const { data: newSession, error: sessionError } = await supabase
        .from('workout_sessions')
        .insert({
          week_number: currentWeek,
          day_of_week: dayKey,
          block_slug: currentPlan.blockSlug,
          title: selectedMeta.restLabel ?? 'Extra Work',
          session_type: 'extra',
          notes: null,
        })
        .select('*')
        .single()
      if (sessionError || !newSession) {
        setAddError(sessionError?.message ?? 'Failed to create session')
        setAddSaving(false)
        return
      }
      currentSession = newSession as WorkoutSession
      setSession(currentSession)
    }

    const payload = {
      session_id: currentSession.id,
      order_index: orderIndex,
      exercise_name: name,
      prescribed_sets: Number.isFinite(parsedSets) ? parsedSets : null,
      prescribed_reps: exerciseForm.reps.trim() || null,
      prescribed_weight: Number.isFinite(parsedWeight) ? parsedWeight : null,
      weight_unit: 'kg',
      target_rpe: exerciseForm.rpe.trim() || null,
      notes: exerciseForm.notes.trim() || null,
    }

    const { data, error } = await supabase
      .from('workout_exercises')
      .insert(payload)
      .select('*')
      .single()

    setAddSaving(false)

    if (error) {
      setAddError(error.message)
      return
    }

    const exercise = data as WorkoutExercise
    setExercises(prev => [...prev, exercise])
    setExerciseStates(prev => {
      const initWeight = exercise.prescribed_weight ?? 0
      return [
      ...prev,
      {
        expanded: true,
        weight: initWeight,
        weightText: String(initWeight),
        selectedReps: parseReps(exercise.prescribed_reps),
        selectedRpe: parseRpe(exercise.target_rpe),
        selectedDistance: 500,
        selectedDuration: 120,
        loggedSets: [],
      },
    ]})
    setExerciseForm(EMPTY_EXERCISE_FORM)
    setAddOpen(false)
  }

  const logSet = (i: number) => {
    if (!session) return
    const s = exerciseStates[i]
    const ex = exercises[i]
    const setNum = s.loggedSets.length + 1
    const modality = ex.modality ?? 'strength'
    const payload = {
      workout_session_id: session.id,
      workout_exercise_id: ex.id,
      exercise_name: ex.exercise_name,
      set_number: setNum,
      weight_lbs: modality === 'bodyweight' ? 0 : s.weight,
      weight_unit: 'kg',
      reps: modality === 'erg' ? null : s.selectedReps,
      rpe: s.selectedRpe,
      distance_m: modality === 'erg' || modality === 'carry' ? s.selectedDistance : null,
      duration_s: modality === 'erg' ? s.selectedDuration : null,
    }

    supabase.from('workout_logs').insert(payload).select('*').single().then(async ({ data, error }) => {
      if (error && error.message.includes('workout_session_id')) {
        const { workout_session_id, workout_exercise_id, ...legacyPayload } = payload
        void workout_session_id
        void workout_exercise_id
        const legacyResult = await supabase.from('workout_logs').insert(legacyPayload).select('*').single()
        data = legacyResult.data
        error = legacyResult.error
      }

      if (error) {
        console.error('workout log insert failed:', error.message)
        setLogError('couldn\'t log set')
        setTimeout(() => setLogError(null), 3500)
        return
      }

      const log = data as WorkoutLog
      updateState(i, {
        loggedSets: [
          ...s.loggedSets,
          {
            id: log.id,
            setNum: log.set_number ?? setNum,
            weight: log.weight_lbs ?? s.weight,
            reps: log.reps ?? s.selectedReps,
            rpe: log.rpe ?? s.selectedRpe,
            distance_m: log.distance_m ?? undefined,
            duration_s: log.duration_s ?? undefined,
            loggedAt: log.logged_at,
          },
        ],
      })
      setLastSets(prev => ({ ...prev, [ex.exercise_name]: log }))
    })
  }

  const totalSets = exerciseStates.reduce((acc, s) => acc + s.loggedSets.length, 0)
  const meta = getDayMeta(selectedDay, currentPlan.blockSlug)
  const isGymDay = !!meta?.dbKey

  return (
    <div className="px-4 space-y-5">
      {/* Day selector */}
      <div className="pt-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {DAY_ORDER.map(day => {
            const isToday = day === today
            const isSelected = day === selectedDay
            const isGym = !!getDayMeta(day, currentPlan.blockSlug).dbKey
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-[0.94] ${
                  isSelected
                    ? 'border-transparent'
                    : isToday
                    ? 'bg-[var(--ink-02)] border-[rgba(0,210,106,0.45)] text-[#00d26a]'
                    : isGym
                    ? 'bg-[var(--ink-02)] border-[var(--border)] text-[var(--text-dim)]'
                    : 'bg-transparent border-transparent text-[var(--text-faint)]'
                }`}
                style={{
                  fontFamily: 'var(--font-jetbrains-mono, monospace)',
                  ...(isSelected ? {
                    background: 'linear-gradient(180deg, #2ee6a8, #00d26a)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 14px rgba(0,210,106,0.3)',
                    color: '#062514',
                  } : {}),
                }}
              >
                {getDayMeta(day, currentPlan.blockSlug).label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rest / cardio day */}
      {!isGymDay && !loading && (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                · {meta?.restLabel} ·
              </div>
              <div className="text-[var(--text-dim)] text-sm" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {meta?.restSub}
              </div>
            </div>
            {canAddExercises && (
              <button
                type="button"
                onClick={() => {
                  setAddOpen(open => !open)
                  setAddError(null)
                }}
                aria-label={addOpen ? 'Close add exercise form' : 'Add exercise'}
                className={`flex-shrink-0 h-10 w-10 rounded-full border text-xl leading-none flex items-center justify-center transition-all active:scale-[0.9] ${
                  addOpen
                    ? 'btn-accent border-transparent'
                    : 'border-[var(--border)] bg-[var(--ink-04)] text-[#00d26a]'
                }`}
              >
                {addOpen ? '−' : '+'}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-[var(--text-faint)] text-sm text-center py-8" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          loading…
        </div>
      )}

      {/* No session for this week/day */}
      {isGymDay && !loading && !session && (
        <Card className="p-6 flex flex-col items-center gap-2 text-center">
          <div className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            · {currentWeek == null ? 'NO ACTIVE TRAINING BLOCK' : 'REST DAY'} ·
          </div>
          <div className="text-[var(--text-dim)] text-sm" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            {currentWeek == null ? 'The previous six-week plan has ended' : 'No session scheduled'}
          </div>
        </Card>
      )}

      {/* Session header — gym days with a scheduled session */}
      {isGymDay && !loading && session && (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[#00d26a] uppercase text-[11px] tracking-widest mb-1" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                WEEK {currentWeek} · {session.session_type.toUpperCase()}
              </div>
              <h1 className="text-[22px] font-bold text-[var(--text)]">{session.title}</h1>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {totalSets > 0 && (
                <button
                  type="button"
                  onClick={() => void shareWorkout()}
                  aria-label="Copy workout summary"
                  className={`glass h-10 rounded-full border px-3.5 text-[11px] font-semibold transition-all active:scale-[0.95] ${
                    shareState !== 'idle'
                      ? 'border-[#00d26a] text-[#00d26a]'
                      : 'border-[var(--border)] text-[var(--text-dim)]'
                  }`}
                  style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                >
                  {shareState === 'copied' ? 'Copied ✓' : shareState === 'shared' ? 'Shared ✓' : 'Copy'}
                </button>
              )}
              {canAddExercises && (
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(open => !open)
                    setAddError(null)
                  }}
                  aria-label={addOpen ? 'Close add exercise form' : 'Add exercise'}
                  className={`h-10 w-10 rounded-full border text-xl leading-none flex items-center justify-center transition-all active:scale-[0.9] ${
                    addOpen
                      ? 'btn-accent border-transparent'
                      : 'border-[var(--border)] bg-[var(--ink-04)] text-[#00d26a]'
                  }`}
                >
                  {addOpen ? '−' : '+'}
                </button>
              )}
            </div>
          </div>
          <div className="text-[var(--text-faint)] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            {exercises.length} exercises · {totalSets} sets logged
          </div>
          {session.notes && (
            <div className="text-[var(--text-faint)] text-[11px] mt-1 leading-relaxed" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {session.notes}
            </div>
          )}
        </div>
      )}

      {/* Add form — available on all days */}
      {canAddExercises && addOpen && (
            <Card className="p-4">
              <form
                className="space-y-3"
                onSubmit={event => {
                  event.preventDefault()
                  void addExercise()
                }}
              >
                <div>
                  <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-name">
                    Exercise
                  </label>
                  <input
                    id="exercise-name"
                    value={exerciseForm.name}
                    onChange={event => updateExerciseForm({ name: event.target.value })}
                    placeholder="e.g. Farmers Carry"
                    className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none placeholder:text-[var(--border-hi)] focus:border-[#00d26a]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-sets">
                      Sets
                    </label>
                    <input
                      id="exercise-sets"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      value={exerciseForm.sets}
                      onChange={event => updateExerciseForm({ sets: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-reps">
                      Reps
                    </label>
                    <input
                      id="exercise-reps"
                      value={exerciseForm.reps}
                      onChange={event => updateExerciseForm({ reps: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-weight">
                      KG
                    </label>
                    <input
                      id="exercise-weight"
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.5"
                      value={exerciseForm.weight}
                      onChange={event => updateExerciseForm({ weight: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[88px_1fr] gap-2">
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-rpe">
                      RPE
                    </label>
                    <input
                      id="exercise-rpe"
                      inputMode="decimal"
                      value={exerciseForm.rpe}
                      onChange={event => updateExerciseForm({ rpe: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-notes">
                      Notes
                    </label>
                    <input
                      id="exercise-notes"
                      value={exerciseForm.notes}
                      onChange={event => updateExerciseForm({ notes: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                </div>

                {addError && (
                  <div className="text-[#ff6b6b] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                    {addError}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false)
                      setAddError(null)
                    }}
                    className="glass h-11 flex-1 rounded-xl border border-[var(--border)] text-[var(--text-dim)] text-sm font-bold transition-transform active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSaving}
                    className="btn-accent h-11 flex-1 rounded-xl text-sm font-bold"
                  >
                    {addSaving ? 'Adding…' : 'Add exercise'}
                  </button>
                </div>
              </form>
            </Card>
          )}

      {/* Exercise cards — available on all days */}
      {!loading && exercises.map((ex, i) => {
            const s = exerciseStates[i]
            if (!s) return null
            const last = lastSets[ex.exercise_name]
            const setsTarget = ex.prescribed_sets ?? 0
            const suggestion = getProgressionSuggestion(ex, last)

            return (
              <Card key={ex.id} className="overflow-hidden">
                <button
                  onClick={() => updateState(i, { expanded: !s.expanded })}
                  className="w-full flex items-center justify-between px-4 py-4 min-h-[56px]"
                >
                  <div className="text-left flex-1 min-w-0 pr-3">
                    <div className="text-[var(--text)] text-sm font-medium">{ex.exercise_name}</div>
                    <div className="text-[var(--text-faint)] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {ex.prescribed_sets && ex.prescribed_reps ? `${ex.prescribed_sets}×${ex.prescribed_reps}` : ''}
                      {ex.prescribed_weight ? ` · ${ex.prescribed_weight}${ex.weight_unit}` : ''}
                      {ex.target_rpe ? ` · RPE ${ex.target_rpe}` : ''}
                    </div>
                    {last && (
                      <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        <span className="text-[var(--border-hi)]">last {last.weight_lbs}{last.weight_unit} × {last.reps} @ {last.rpe}</span>
                        {suggestion !== null && (
                          <span className="text-[#00d26a]">→ try {suggestion}kg</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {s.loggedSets.length > 0 && (
                      <span className={`text-[11px] ${s.loggedSets.length >= setsTarget ? 'text-[#00d26a]' : 'text-[var(--text-dim)]'}`} style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        {s.loggedSets.length}{setsTarget > 0 ? `/${setsTarget}` : ''}
                      </span>
                    )}
                    <span className="text-[var(--text-faint)] text-lg leading-none">{s.expanded ? '−' : '+'}</span>
                  </div>
                </button>

                {s.expanded && (
                  <div className="border-t border-[var(--border)] px-4 pb-4 space-y-4 pt-4">
                    {/* Modality: strength — weight + reps */}
                    {(ex.modality === 'strength' || ex.modality === 'carry' || !ex.modality) && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-dim)] text-xs uppercase tracking-wider">Weight</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const next = Math.max(0, s.weight - 2.5)
                              updateState(i, { weight: next, weightText: String(next) })
                            }}
                            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]"
                          >−</button>
                          <div className="flex items-baseline min-w-[64px] justify-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={s.weightText}
                              onChange={e => {
                                const raw = e.target.value
                                const parsed = parseWeightInput(raw)
                                updateState(i, { weightText: raw, ...(parsed !== null ? { weight: parsed } : {}) })
                              }}
                              onFocus={e => e.target.select()}
                              onBlur={() => updateState(i, { weightText: String(s.weight) })}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              className="text-[var(--text)] text-2xl font-bold w-[56px] text-center bg-transparent outline-none border-b border-[var(--border)] focus:border-[#00d26a] transition-colors"
                              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                            />
                            <span className="text-[var(--text-faint)] text-sm ml-0.5">kg</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = s.weight + 2.5
                              updateState(i, { weight: next, weightText: String(next) })
                            }}
                            className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]"
                          >+</button>
                        </div>
                      </div>
                    )}

                    {/* Distance — erg + carry */}
                    {(ex.modality === 'erg' || ex.modality === 'carry') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-dim)] text-xs uppercase tracking-wider">Distance</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateState(i, { selectedDistance: Math.max(50, s.selectedDistance - 50) })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">−</button>
                          <span className="text-[var(--text)] text-2xl font-bold min-w-[72px] text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            {s.selectedDistance}<span className="text-[var(--text-faint)] text-sm ml-0.5">m</span>
                          </span>
                          <button onClick={() => updateState(i, { selectedDistance: s.selectedDistance + 50 })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">+</button>
                        </div>
                      </div>
                    )}

                    {/* Duration — erg only */}
                    {ex.modality === 'erg' && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-dim)] text-xs uppercase tracking-wider">Time</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateState(i, { selectedDuration: Math.max(10, s.selectedDuration - 10) })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">−</button>
                          <span className="text-[var(--text)] text-2xl font-bold min-w-[72px] text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            {Math.floor(s.selectedDuration / 60)}:{String(s.selectedDuration % 60).padStart(2, '0')}
                          </span>
                          <button onClick={() => updateState(i, { selectedDuration: s.selectedDuration + 10 })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">+</button>
                        </div>
                      </div>
                    )}

                    {/* Reps — strength + bodyweight + carry */}
                    {ex.modality !== 'erg' && (
                      <div>
                        <div className="text-[var(--text-dim)] text-xs uppercase tracking-wider mb-2">Reps</div>
                        <div className="flex flex-wrap gap-2">
                          {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(r => (
                            <button
                              key={r}
                              onClick={() => updateState(i, { selectedReps: r })}
                              className={`min-w-[40px] min-h-[36px] px-3 py-1.5 rounded-full text-sm border transition-all active:scale-[0.92] ${
                                s.selectedReps === r
                                  ? 'border-transparent font-bold'
                                  : 'bg-[var(--ink-04)] border-[var(--border)] text-[var(--text-dim)]'
                              }`}
                              style={{
                                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                                ...(s.selectedReps === r ? {
                                  background: 'linear-gradient(180deg, #2ee6a8, #00d26a)',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,210,106,0.3)',
                                  color: '#062514',
                                } : {}),
                              }}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RPE */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[var(--text-dim)] text-xs uppercase tracking-wider">RPE</span>
                        <span className="text-[var(--text)] text-sm font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{s.selectedRpe}</span>
                      </div>
                      <div className="flex gap-2">
                        {RPE_OPTIONS.map(r => (
                          <button
                            key={r}
                            onClick={() => updateState(i, { selectedRpe: r })}
                            className={`flex-1 h-8 rounded-lg text-[10px] border transition-all active:scale-[0.92] ${
                              s.selectedRpe === r
                                ? 'border-transparent font-bold'
                                : 'bg-[var(--ink-04)] border-[var(--border)] text-[var(--text-faint)]'
                            }`}
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono, monospace)',
                              ...(s.selectedRpe === r ? {
                                background: 'linear-gradient(180deg, #2ee6a8, #00d26a)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,210,106,0.3)',
                                color: '#062514',
                              } : {}),
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    {ex.notes && (
                      <div className="text-[var(--text-faint)] text-[11px] leading-relaxed" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        {ex.notes}
                      </div>
                    )}

                    {/* Log set */}
                    <button
                      onClick={() => logSet(i)}
                      className="btn-accent w-full rounded-xl py-3 text-sm font-bold min-h-[44px]"
                    >
                      Log set {s.loggedSets.length + 1}{setsTarget > 0 ? ` of ${setsTarget}` : ''} →
                    </button>

                    {logError && (
                      <p className="text-[11px] text-red-400" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        {logError}
                      </p>
                    )}

                    {/* Logged sets */}
                    {s.loggedSets.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[var(--text-faint)] text-[11px] uppercase tracking-wider">Logged</div>
                        {s.loggedSets.map(ls => (
                          <div key={ls.setNum} className="flex items-center justify-between text-[var(--text-dim)] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            <span>Set {ls.setNum}</span>
                            {ls.distance_m != null
                              ? <span>{ls.distance_m}m{ls.duration_s != null ? ` · ${Math.floor(ls.duration_s / 60)}:${String(ls.duration_s % 60).padStart(2, '0')}` : ''}</span>
                              : <span>{ex.modality !== 'bodyweight' ? `${ls.weight}kg × ` : ''}{ls.reps}</span>
                            }
                            <span>RPE {ls.rpe}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
      })}

      <div className="h-4" />
    </div>
  )
}

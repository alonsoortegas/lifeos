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
  modality: string
  restSeconds: string
  supersetGroup: string
}

const EMPTY_EXERCISE_FORM: ExerciseFormState = {
  name: '',
  sets: '',
  reps: '',
  weight: '',
  rpe: '',
  notes: '',
  modality: 'strength',
  restSeconds: '',
  supersetGroup: '',
}

interface RestTimer {
  exerciseName: string
  setNum: number
  secondsLeft: number
  total: number
}

const DEFAULT_REST_S: Record<string, number> = {
  strength: 90,
  carry: 90,
  bodyweight: 60,
  isometric: 60,
  erg: 120,
}

const ISOMETRIC_PRESETS = [20, 30, 45, 60, 90, 120]

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
  const [restTimer, setRestTimer] = useState<RestTimer | null>(null)

  useEffect(() => {
    if (!restTimer || restTimer.secondsLeft <= 0) {
      if (restTimer?.secondsLeft === 0) setRestTimer(null)
      return
    }
    const id = window.setTimeout(() => {
      setRestTimer(prev => prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null)
    }, 1000)
    return () => window.clearTimeout(id)
  }, [restTimer])

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
        const defaultDuration = ex.modality === 'isometric' ? 30 : 120
        return {
          expanded: false,
          weight: initWeight,
          weightText: String(initWeight),
          selectedReps: parseReps(ex.prescribed_reps),
          selectedRpe: parseRpe(ex.target_rpe),
          selectedDistance: last[ex.exercise_name]?.distance_m ?? 500,
          selectedDuration: last[ex.exercise_name]?.duration_s ?? defaultDuration,
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
    const parsedWeight = exerciseForm.weight ? Number.parseFloat(exerciseForm.weight.replace(',', '.')) : Number.NaN
    const parsedRest = exerciseForm.restSeconds ? Number.parseInt(exerciseForm.restSeconds, 10) : Number.NaN
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
      modality: exerciseForm.modality || 'strength',
      rest_s: Number.isFinite(parsedRest) && parsedRest > 0 ? parsedRest : null,
      superset_group: exerciseForm.supersetGroup.trim().toUpperCase() || null,
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
    setExerciseStates(prev => [
      ...prev,
      {
        expanded: true,
        weight: exercise.prescribed_weight ?? 0,
        selectedReps: parseReps(exercise.prescribed_reps),
        selectedRpe: parseRpe(exercise.target_rpe),
        selectedDistance: 500,
        selectedDuration: 120,
        loggedSets: [],
      },
    ])
    setExerciseForm(EMPTY_EXERCISE_FORM)
    setAddOpen(false)
  }

  const logSet = (i: number) => {
    if (!session) return
    // Dismiss the iOS keyboard — with an input focused, position:fixed elements
    // (rest pill, TabBar) detach from the visual viewport and drift on scroll.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const s = exerciseStates[i]
    const ex = exercises[i]
    const setNum = s.loggedSets.length + 1
    const modality = ex.modality ?? 'strength'
    const isIsometric = modality === 'isometric'
    const payload = {
      workout_session_id: session.id,
      workout_exercise_id: ex.id,
      exercise_name: ex.exercise_name,
      set_number: setNum,
      weight_lbs: (modality === 'bodyweight' || isIsometric) ? 0 : s.weight,
      weight_unit: 'kg',
      reps: (modality === 'erg' || isIsometric) ? null : s.selectedReps,
      rpe: s.selectedRpe,
      distance_m: modality === 'erg' || modality === 'carry' ? s.selectedDistance : null,
      duration_s: (modality === 'erg' || isIsometric) ? s.selectedDuration : null,
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
      const newEntry = {
        id: log.id,
        setNum: log.set_number ?? setNum,
        weight: log.weight_lbs ?? s.weight,
        reps: log.reps ?? s.selectedReps,
        rpe: log.rpe ?? s.selectedRpe,
        distance_m: log.distance_m ?? undefined,
        duration_s: log.duration_s ?? undefined,
        loggedAt: log.logged_at,
      }
      setLastSets(prev => ({ ...prev, [ex.exercise_name]: log }))

      const restSeconds = ex.rest_s ?? DEFAULT_REST_S[modality] ?? 90

      if (ex.superset_group) {
        const groupIndices = exercises
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => e.superset_group === ex.superset_group)
        const myPos = groupIndices.findIndex(({ idx }) => idx === i)
        const nextInGroup = groupIndices[myPos + 1]

        if (nextInGroup) {
          setExerciseStates(prev => prev.map((st, idx) => {
            if (idx === i) return { ...st, loggedSets: [...st.loggedSets, newEntry], expanded: false }
            if (idx === nextInGroup.idx) return { ...st, expanded: true }
            return st
          }))
        } else {
          const firstInGroup = groupIndices[0]
          setExerciseStates(prev => prev.map((st, idx) => {
            if (idx === i) return { ...st, loggedSets: [...st.loggedSets, newEntry] }
            if (firstInGroup && idx === firstInGroup.idx && firstInGroup.idx !== i) return { ...st, expanded: true }
            return st
          }))
          setRestTimer({ exerciseName: ex.exercise_name, setNum, secondsLeft: restSeconds, total: restSeconds })
        }
      } else {
        setExerciseStates(prev => prev.map((st, idx) =>
          idx !== i ? st : { ...st, loggedSets: [...st.loggedSets, newEntry] }
        ))
        setRestTimer({ exerciseName: ex.exercise_name, setNum, secondsLeft: restSeconds, total: restSeconds })
      }
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

                <div>
                  <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-modality">
                    Type
                  </label>
                  <select
                    id="exercise-modality"
                    value={exerciseForm.modality}
                    onChange={event => updateExerciseForm({ modality: event.target.value })}
                    className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                  >
                    <option value="strength">Strength</option>
                    <option value="bodyweight">Bodyweight</option>
                    <option value="isometric">Isometric</option>
                    <option value="erg">Erg / Row</option>
                    <option value="carry">Carry</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-rest">
                      Rest (s)
                    </label>
                    <input
                      id="exercise-rest"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      placeholder={String(DEFAULT_REST_S[exerciseForm.modality] ?? 90)}
                      value={exerciseForm.restSeconds}
                      onChange={event => updateExerciseForm({ restSeconds: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--text-dim)] text-xs uppercase tracking-wider" htmlFor="exercise-superset">
                      Superset
                    </label>
                    <input
                      id="exercise-superset"
                      maxLength={2}
                      placeholder="A, B…"
                      value={exerciseForm.supersetGroup}
                      onChange={event => updateExerciseForm({ supersetGroup: event.target.value })}
                      className="mt-2 w-full h-11 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-[var(--text)] outline-none focus:border-[#38bdf8] uppercase"
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
            const inSuperset = !!ex.superset_group
            const nextSharedGroup = exercises[i + 1]?.superset_group === ex.superset_group && inSuperset

            const prescriptionText = ex.modality === 'isometric'
              ? [
                  ex.prescribed_sets ? `${ex.prescribed_sets}×hold` : '',
                  ex.prescribed_reps ?? '',
                ].filter(Boolean).join(' ')
              : [
                  ex.prescribed_sets && ex.prescribed_reps ? `${ex.prescribed_sets}×${ex.prescribed_reps}` : '',
                  ex.prescribed_weight ? `${ex.prescribed_weight}${ex.weight_unit}` : '',
                  ex.target_rpe ? `RPE ${ex.target_rpe}` : '',
                ].filter(Boolean).join(' · ')

            return (
              <div key={ex.id} className="relative">
                {inSuperset && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full z-10"
                    style={{ background: '#38bdf8', opacity: 0.85 }}
                  />
                )}
                <Card className={`overflow-hidden ${inSuperset ? 'ml-2' : ''}`}>
                <button
                  onClick={() => updateState(i, { expanded: !s.expanded })}
                  className="w-full flex items-center justify-between px-4 py-4 min-h-[56px]"
                >
                  <div className="text-left flex-1 min-w-0 pr-3">
                    <div className="text-[var(--text)] text-sm font-medium flex items-center gap-2 flex-wrap">
                      {inSuperset && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', lineHeight: 1.4 }}>
                          SS-{ex.superset_group}
                        </span>
                      )}
                      {ex.exercise_name}
                    </div>
                    <div className="text-[var(--text-faint)] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {prescriptionText}
                      {ex.rest_s ? ` · ${ex.rest_s}s rest` : ''}
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
                          <button onClick={() => updateState(i, { weight: Math.max(0, s.weight - 2.5) })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">−</button>
                          <span className="text-[var(--text)] text-2xl font-bold min-w-[64px] text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            {s.weight}<span className="text-[var(--text-faint)] text-sm ml-0.5">kg</span>
                          </span>
                          <button onClick={() => updateState(i, { weight: s.weight + 2.5 })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">+</button>
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

                    {/* Isometric — hold duration presets + stepper */}
                    {ex.modality === 'isometric' && (
                      <div>
                        <div className="text-[var(--text-dim)] text-xs uppercase tracking-wider mb-2">Hold Duration</div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ISOMETRIC_PRESETS.map(sec => (
                            <button
                              key={sec}
                              onClick={() => updateState(i, { selectedDuration: sec })}
                              className={`min-w-[48px] h-9 px-3 rounded-full text-sm border transition-all active:scale-[0.92] ${
                                s.selectedDuration === sec ? 'border-transparent font-bold' : 'bg-[var(--ink-04)] border-[var(--border)] text-[var(--text-dim)]'
                              }`}
                              style={{
                                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                                ...(s.selectedDuration === sec ? {
                                  background: 'linear-gradient(180deg, #2ee6a8, #00d26a)',
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,210,106,0.3)',
                                  color: '#062514',
                                } : {}),
                              }}
                            >
                              {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 justify-center">
                          <button onClick={() => updateState(i, { selectedDuration: Math.max(5, s.selectedDuration - 5) })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">−</button>
                          <span className="text-[var(--text)] text-2xl font-bold min-w-[64px] text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            {s.selectedDuration < 60 ? `${s.selectedDuration}s` : `${Math.floor(s.selectedDuration / 60)}:${String(s.selectedDuration % 60).padStart(2, '0')}`}
                          </span>
                          <button onClick={() => updateState(i, { selectedDuration: s.selectedDuration + 5 })} className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--ink-04)] text-[var(--text-dim)] text-lg flex items-center justify-center transition-transform active:scale-[0.88]">+</button>
                        </div>
                      </div>
                    )}

                    {/* Reps — strength + bodyweight + carry (not erg, not isometric) */}
                    {ex.modality !== 'erg' && ex.modality !== 'isometric' && (
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
                      {ex.modality === 'isometric'
                        ? `Log ${s.selectedDuration < 60 ? `${s.selectedDuration}s` : `${Math.floor(s.selectedDuration / 60)}:${String(s.selectedDuration % 60).padStart(2, '0')}`} hold →`
                        : `Log set ${s.loggedSets.length + 1}${setsTarget > 0 ? ` of ${setsTarget}` : ''} →`
                      }
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
                              : ex.modality === 'isometric'
                              ? <span>{ls.duration_s != null ? (ls.duration_s < 60 ? `${ls.duration_s}s hold` : `${Math.floor(ls.duration_s / 60)}:${String(ls.duration_s % 60).padStart(2, '0')} hold`) : '—'}</span>
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
                {nextSharedGroup && (
                  <div className="ml-[11px] w-0.5 h-3 bg-[#38bdf8] opacity-40 rounded-full" />
                )}
              </div>
            )
      })}

      <div className="h-4" />

      {/* Rest timer — fixed glass pill above TabBar */}
      {restTimer && (
        <div
          className="fixed inset-x-0 px-4 z-50 flex justify-center"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}
        >
          <div className="glass-thick border border-[var(--border-hi)] rounded-2xl px-4 py-3 flex items-center gap-3 max-w-sm w-full" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
            <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
              <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="22" cy="22" r="18"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="113.1"
                strokeDashoffset={113.1 * (1 - restTimer.secondsLeft / restTimer.total)}
                transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <text x="22" y="27" textAnchor="middle" style={{ fill: 'var(--text)', fontSize: '12px', fontWeight: 'bold', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {restTimer.secondsLeft}
              </text>
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-[var(--text)] text-sm font-semibold">Rest</div>
              <div className="text-[var(--text-faint)] text-[11px] truncate" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                after {restTimer.exerciseName}
              </div>
            </div>
            <button
              onClick={() => setRestTimer(null)}
              className="text-[var(--text-dim)] text-xs font-semibold border border-[var(--border)] rounded-full px-3 h-8 bg-[var(--ink-04)] transition-all active:scale-[0.95]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

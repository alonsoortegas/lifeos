'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Card from '@/components/ui/Card'
import type { WorkoutSession, WorkoutExercise, WorkoutLog } from '@/lib/types'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

// Plan started Monday April 27 2026
const PLAN_START = new Date('2026-04-27T00:00:00')
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function getCurrentWeek(): number {
  const elapsed = Date.now() - PLAN_START.getTime()
  return Math.min(6, Math.max(1, Math.ceil(elapsed / MS_PER_WEEK)))
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const DAY_META: Record<string, { label: string; dbKey: string | null; restLabel: string; restSub: string }> = {
  monday:    { label: 'MON', dbKey: 'monday',      restLabel: 'REST DAY',         restSub: 'No session scheduled' },
  tuesday:   { label: 'TUE', dbKey: null,           restLabel: 'ZONE 2 + HYROX',   restSub: 'Zone 2 run AM · Hyrox class PM' },
  wednesday: { label: 'WED', dbKey: 'wednesday',    restLabel: 'REST DAY',         restSub: 'No session scheduled' },
  thursday:  { label: 'THU', dbKey: 'thursday_am',  restLabel: 'INTERVALS',        restSub: 'VO₂ max intervals PM — legs already covered AM' },
  friday:    { label: 'FRI', dbKey: null,           restLabel: 'MACHINE WORK',     restSub: 'SkiErg / Row trials or accessory work' },
  saturday:  { label: 'SAT', dbKey: null,           restLabel: 'THRESHOLD RUN',    restSub: 'Threshold run or Hyrox simulation' },
  sunday:    { label: 'SUN', dbKey: null,           restLabel: 'REST DAY',         restSub: 'Full recovery — no session scheduled' },
}

function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? 'monday'
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
  loggedSets: { id?: number; setNum: number; weight: number; reps: number; rpe: number; loggedAt?: string }[]
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
  const currentWeek = getCurrentWeek()

  const [selectedDay, setSelectedDay] = useState(today)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [lastSets, setLastSets] = useState<Record<string, WorkoutLog>>({})
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(EMPTY_EXERCISE_FORM)

  const loadSession = useCallback(async (day: string) => {
    setLoading(true)
    setSession(null)
    setExercises([])
    setExerciseStates([])
    setAddOpen(false)
    setAddError(null)

    const dbKey = DAY_META[day]?.dbKey
    if (!dbKey) { setLoading(false); return }

    const { data: sessionData } = await supabase
      .from('workout_sessions')
      .select('*')
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

    // Load last logged set per exercise
    if (exList.length > 0) {
      const names = exList.map(e => e.exercise_name)
      const { start, end } = todayRange()
      const { data: logData } = await supabase
        .from('workout_logs')
        .select('*')
        .in('exercise_name', names)
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

      setExerciseStates(exList.map(ex => ({
        expanded: false,
        weight: ex.prescribed_weight ?? last[ex.exercise_name]?.weight_lbs ?? 0,
        selectedReps: parseReps(ex.prescribed_reps),
        selectedRpe: parseRpe(ex.target_rpe),
        loggedSets: scopedLogs
          .filter(log => log.workout_exercise_id === ex.id || (!log.workout_exercise_id && log.exercise_name === ex.exercise_name))
          .map((log, idx) => ({
            id: log.id,
            setNum: log.set_number ?? idx + 1,
            weight: log.weight_lbs ?? 0,
            reps: log.reps ?? 0,
            rpe: log.rpe ?? 0,
            loggedAt: log.logged_at,
          })),
      })))
    }

    setLoading(false)
  }, [currentWeek])

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
    if (!session || addSaving) return

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

    const payload = {
      session_id: session.id,
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
    setExerciseStates(prev => [
      ...prev,
      {
        expanded: true,
        weight: exercise.prescribed_weight ?? 0,
        selectedReps: parseReps(exercise.prescribed_reps),
        selectedRpe: parseRpe(exercise.target_rpe),
        loggedSets: [],
      },
    ])
    setExerciseForm(EMPTY_EXERCISE_FORM)
    setAddOpen(false)
  }

  const logSet = (i: number) => {
    if (!session) return
    const s = exerciseStates[i]
    const ex = exercises[i]
    const setNum = s.loggedSets.length + 1
    const payload = {
      workout_session_id: session.id,
      workout_exercise_id: ex.id,
      exercise_name: ex.exercise_name,
      set_number: setNum,
      weight_lbs: s.weight,
      weight_unit: 'kg',
      reps: s.selectedReps,
      rpe: s.selectedRpe,
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
            loggedAt: log.logged_at,
          },
        ],
      })
      setLastSets(prev => ({ ...prev, [ex.exercise_name]: log }))
    })
  }

  const totalSets = exerciseStates.reduce((acc, s) => acc + s.loggedSets.length, 0)
  const meta = DAY_META[selectedDay]
  const isGymDay = !!meta?.dbKey

  return (
    <div className="px-4 space-y-5">
      {/* Day selector */}
      <div className="pt-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {DAY_ORDER.map(day => {
            const isToday = day === today
            const isSelected = day === selectedDay
            const isGym = !!DAY_META[day]?.dbKey
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  isSelected
                    ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e]'
                    : isToday
                    ? 'bg-transparent border-[#00d26a] text-[#00d26a]'
                    : isGym
                    ? 'bg-transparent border-[#2a2a2a] text-[#888]'
                    : 'bg-transparent border-[#1a1a1a] text-[#555]'
                }`}
                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              >
                {DAY_META[day]?.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rest / cardio day */}
      {!isGymDay && (
        <Card className="p-6 flex flex-col items-center gap-2 text-center">
          <div className="text-[#555] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            · {meta?.restLabel} ·
          </div>
          <div className="text-[#888] text-sm" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            {meta?.restSub}
          </div>
        </Card>
      )}

      {/* Loading */}
      {isGymDay && loading && (
        <div className="text-[#555] text-sm text-center py-8" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          loading…
        </div>
      )}

      {/* No session for this week/day */}
      {isGymDay && !loading && !session && (
        <Card className="p-6 flex flex-col items-center gap-2 text-center">
          <div className="text-[#555] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            · REST DAY ·
          </div>
          <div className="text-[#888] text-sm" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            No session scheduled
          </div>
        </Card>
      )}

      {/* Session */}
      {isGymDay && !loading && session && (
        <>
          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[#00d26a] uppercase text-[11px] tracking-widest mb-1" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                  WEEK {currentWeek} · {session.session_type.toUpperCase()}
                </div>
                <h1 className="text-[22px] font-bold text-[#ededed]">{session.title}</h1>
              </div>
              {canAddExercises && (
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(open => !open)
                    setAddError(null)
                  }}
                  aria-label={addOpen ? 'Close add exercise form' : 'Add exercise'}
                  className={`flex-shrink-0 h-10 w-10 rounded-lg border text-xl leading-none flex items-center justify-center transition-colors ${
                    addOpen
                      ? 'border-[#00d26a] bg-[#00d26a] text-[#0e0e0e]'
                      : 'border-[#2a2a2a] bg-transparent text-[#00d26a]'
                  }`}
                >
                  {addOpen ? '−' : '+'}
                </button>
              )}
            </div>
            <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {exercises.length} exercises · {totalSets} sets logged
            </div>
            {session.notes && (
              <div className="text-[#555] text-[11px] mt-1 leading-relaxed" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {session.notes}
              </div>
            )}
          </div>

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
                  <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-name">
                    Exercise
                  </label>
                  <input
                    id="exercise-name"
                    value={exerciseForm.name}
                    onChange={event => updateExerciseForm({ name: event.target.value })}
                    placeholder="e.g. Farmers Carry"
                    className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none placeholder:text-[#3a3a3a] focus:border-[#00d26a]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-sets">
                      Sets
                    </label>
                    <input
                      id="exercise-sets"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      value={exerciseForm.sets}
                      onChange={event => updateExerciseForm({ sets: event.target.value })}
                      className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-reps">
                      Reps
                    </label>
                    <input
                      id="exercise-reps"
                      value={exerciseForm.reps}
                      onChange={event => updateExerciseForm({ reps: event.target.value })}
                      className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-weight">
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
                      className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-[88px_1fr] gap-2">
                  <div>
                    <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-rpe">
                      RPE
                    </label>
                    <input
                      id="exercise-rpe"
                      inputMode="decimal"
                      value={exerciseForm.rpe}
                      onChange={event => updateExerciseForm({ rpe: event.target.value })}
                      className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none focus:border-[#00d26a]"
                    />
                  </div>
                  <div>
                    <label className="text-[#888] text-xs uppercase tracking-wider" htmlFor="exercise-notes">
                      Notes
                    </label>
                    <input
                      id="exercise-notes"
                      value={exerciseForm.notes}
                      onChange={event => updateExerciseForm({ notes: event.target.value })}
                      className="mt-2 w-full h-11 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] px-3 text-[#ededed] outline-none focus:border-[#00d26a]"
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
                    className="h-11 flex-1 rounded-lg border border-[#2a2a2a] text-[#888] text-sm font-bold active:opacity-70"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSaving}
                    className="h-11 flex-1 rounded-lg bg-[#00d26a] text-[#0e0e0e] text-sm font-bold active:opacity-80 disabled:opacity-50"
                  >
                    {addSaving ? 'Adding…' : 'Add exercise'}
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* Exercise cards */}
          {exercises.map((ex, i) => {
            const s = exerciseStates[i]
            if (!s) return null
            const last = lastSets[ex.exercise_name]
            const setsTarget = ex.prescribed_sets ?? 0

            return (
              <Card key={ex.id} className="overflow-hidden">
                <button
                  onClick={() => updateState(i, { expanded: !s.expanded })}
                  className="w-full flex items-center justify-between px-4 py-4 min-h-[56px]"
                >
                  <div className="text-left flex-1 min-w-0 pr-3">
                    <div className="text-[#ededed] text-sm font-medium">{ex.exercise_name}</div>
                    <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {ex.prescribed_sets && ex.prescribed_reps ? `${ex.prescribed_sets}×${ex.prescribed_reps}` : ''}
                      {ex.prescribed_weight ? ` · ${ex.prescribed_weight}${ex.weight_unit}` : ''}
                      {ex.target_rpe ? ` · RPE ${ex.target_rpe}` : ''}
                    </div>
                    {last && (
                      <div className="text-[#3a3a3a] text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        last: {last.weight_lbs}{last.weight_unit} × {last.reps} @ {last.rpe}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {s.loggedSets.length > 0 && (
                      <span className={`text-[11px] ${s.loggedSets.length >= setsTarget ? 'text-[#00d26a]' : 'text-[#888]'}`} style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        {s.loggedSets.length}{setsTarget > 0 ? `/${setsTarget}` : ''}
                      </span>
                    )}
                    <span className="text-[#555] text-lg leading-none">{s.expanded ? '−' : '+'}</span>
                  </div>
                </button>

                {s.expanded && (
                  <div className="border-t border-[#2a2a2a] px-4 pb-4 space-y-4 pt-4">
                    {/* Weight adjuster */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#888] text-xs uppercase tracking-wider">Weight</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateState(i, { weight: Math.max(0, s.weight - 2.5) })}
                          className="w-8 h-8 rounded-lg border border-[#2a2a2a] text-[#888] text-lg flex items-center justify-center active:opacity-60"
                        >
                          −
                        </button>
                        <span className="text-[#ededed] text-2xl font-bold min-w-[64px] text-center" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                          {s.weight}<span className="text-[#555] text-sm ml-0.5">kg</span>
                        </span>
                        <button
                          onClick={() => updateState(i, { weight: s.weight + 2.5 })}
                          className="w-8 h-8 rounded-lg border border-[#2a2a2a] text-[#888] text-lg flex items-center justify-center active:opacity-60"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Reps */}
                    <div>
                      <div className="text-[#888] text-xs uppercase tracking-wider mb-2">Reps</div>
                      <div className="flex flex-wrap gap-2">
                        {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(r => (
                          <button
                            key={r}
                            onClick={() => updateState(i, { selectedReps: r })}
                            className={`min-w-[40px] min-h-[36px] px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                              s.selectedReps === r
                                ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e] font-bold'
                                : 'bg-transparent border-[#2a2a2a] text-[#888]'
                            }`}
                            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* RPE */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[#888] text-xs uppercase tracking-wider">RPE</span>
                        <span className="text-[#ededed] text-sm font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{s.selectedRpe}</span>
                      </div>
                      <div className="flex gap-2">
                        {RPE_OPTIONS.map(r => (
                          <button
                            key={r}
                            onClick={() => updateState(i, { selectedRpe: r })}
                            className={`flex-1 h-8 rounded text-[10px] border transition-colors ${
                              s.selectedRpe === r
                                ? 'bg-[#00d26a] border-[#00d26a] text-[#0e0e0e] font-bold'
                                : 'bg-transparent border-[#2a2a2a] text-[#555]'
                            }`}
                            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    {ex.notes && (
                      <div className="text-[#555] text-[11px] leading-relaxed" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                        {ex.notes}
                      </div>
                    )}

                    {/* Log set */}
                    <button
                      onClick={() => logSet(i)}
                      className="w-full bg-[#00d26a] text-[#0e0e0e] rounded-xl py-3 text-sm font-bold min-h-[44px] active:opacity-80 transition-opacity"
                    >
                      Log set {s.loggedSets.length + 1}{setsTarget > 0 ? ` of ${setsTarget}` : ''} →
                    </button>

                    {/* Logged sets */}
                    {s.loggedSets.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[#555] text-[11px] uppercase tracking-wider">Logged</div>
                        {s.loggedSets.map(ls => (
                          <div key={ls.setNum} className="flex items-center justify-between text-[#888] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                            <span>Set {ls.setNum}</span>
                            <span>{ls.weight}kg × {ls.reps}</span>
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
        </>
      )}

      <div className="h-4" />
    </div>
  )
}

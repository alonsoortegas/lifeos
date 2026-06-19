'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { WorkoutSession, WorkoutExercise, WorkoutLog, WhoopSnapshot } from '@/lib/types'
import { getDayMeta, getPlanStatus, getTodayKey, DAY_ORDER } from '@/lib/workout'
import { computeReadiness, stateColor, stateLabel } from '@/lib/readiness'
import { formatWorkoutText, shareText, type ShareExercise } from '@/lib/share'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

function parseTopReps(r: string | null): number | null {
  if (!r) return null
  const range = r.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return parseInt(range[2], 10)
  const single = r.match(/\d+/)
  return single ? parseInt(single[0], 10) : null
}

function getProgressionSuggestion(ex: WorkoutExercise, last: WorkoutLog | undefined): number | null {
  if (!last?.weight_lbs || last.weight_lbs <= 0) return null
  const top = parseTopReps(ex.prescribed_reps)
  if (top === null) return null
  return (last.reps ?? 0) >= top ? last.weight_lbs + 2.5 : null
}

function parseReps(r: string | null): number {
  if (!r) return 5
  const match = r.match(/\d+/)
  return match ? parseInt(match[0], 10) : 5
}

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
  loggedSets: { id?: number; setNum: number; weight: number; reps: number; rpe: number }[]
}

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

const mono = 'var(--font-jetbrains-mono, monospace)'
const sans = 'var(--font-inter-tight, sans-serif)'

export default function WorkoutDesktop({
  initialAction,
  onInitialActionConsumed,
}: {
  initialAction?: string
  onInitialActionConsumed?: () => void
}) {
  const today = getTodayKey()
  const currentPlan = getPlanStatus()
  const currentWeek = currentPlan.week

  const [selectedDay, setSelectedDay] = useState(today)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [lastSets, setLastSets] = useState<Record<string, WorkoutLog>>({})
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([])
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<WhoopSnapshot[]>([])
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied'>('idle')

  async function shareWorkout() {
    if (!session) return
    const shareExercises: ShareExercise[] = exercises.map((ex, i) => ({
      name: ex.exercise_name,
      modality: ex.modality,
      sets: (exerciseStates[i]?.loggedSets ?? []).map(s => ({
        setNum: s.setNum, weight: s.weight, reps: s.reps, rpe: s.rpe,
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

  // Load readiness snapshots once
  useEffect(() => {
    supabase.from('whoop_snapshots').select('*').order('recorded_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setSnapshots(data as WhoopSnapshot[]) })
  }, [])

  const readiness = useMemo(() => snapshots.length >= 3 ? computeReadiness(snapshots) : null, [snapshots])
  const rpeCap = readiness?.rpeCap ?? null

  const loadSession = useCallback(async (day: string) => {
    setLoading(true); setSession(null); setExercises([]); setExerciseStates([]); setActiveExIdx(0)
    const dbKey = getDayMeta(day, currentPlan.blockSlug).dbKey
    if (!dbKey || currentWeek == null) { setLoading(false); return }
    const { data: sessionData } = await supabase.from('workout_sessions').select('*').eq('block_slug', currentPlan.blockSlug).eq('week_number', currentWeek).eq('day_of_week', dbKey).single()
    if (!sessionData) { setLoading(false); return }
    setSession(sessionData as WorkoutSession)
    const { data: exData } = await supabase.from('workout_exercises').select('*').eq('session_id', sessionData.id).order('order_index')
    const exList = (exData ?? []) as WorkoutExercise[]
    setExercises(exList)
    if (exList.length > 0) {
      const names = exList.map(e => e.exercise_name)
      const { start, end } = todayRange()
      const { data: logData } = await supabase.from('workout_logs').select('*').in('exercise_name', names).lt('logged_at', start).order('logged_at', { ascending: false })
      const last: Record<string, WorkoutLog> = {}
      for (const log of (logData ?? []) as WorkoutLog[]) { if (!last[log.exercise_name]) last[log.exercise_name] = log }
      setLastSets(last)
      const { data: scopedLogData } = await supabase.from('workout_logs').select('*').eq('workout_session_id', sessionData.id).order('logged_at', { ascending: true })
      let scopedLogs = (scopedLogData ?? []) as WorkoutLog[]
      if (!scopedLogData) {
        const { data: fallback } = await supabase.from('workout_logs').select('*').in('exercise_name', names).gte('logged_at', start).lt('logged_at', end).order('logged_at', { ascending: true })
        scopedLogs = (fallback ?? []) as WorkoutLog[]
      }
      setExerciseStates(exList.map(ex => ({
        expanded: false,
        weight: ex.prescribed_weight ?? last[ex.exercise_name]?.weight_lbs ?? 0,
        selectedReps: parseReps(ex.prescribed_reps),
        selectedRpe: parseRpe(ex.target_rpe),
        loggedSets: scopedLogs.filter(log => log.workout_exercise_id === ex.id || (!log.workout_exercise_id && log.exercise_name === ex.exercise_name))
          .map((log, idx) => ({ id: log.id, setNum: log.set_number ?? idx + 1, weight: log.weight_lbs ?? 0, reps: log.reps ?? 0, rpe: log.rpe ?? 0 })),
      })))
    }
    setLoading(false)
  }, [currentPlan.blockSlug, currentWeek])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadSession(selectedDay) }, 0)
    return () => window.clearTimeout(id)
  }, [selectedDay, loadSession])

  // Jump to first exercise when launched via "Start workout" command
  useEffect(() => {
    if (initialAction !== 'start' || loading) return

    const id = window.setTimeout(() => {
      setActiveExIdx(0)
      onInitialActionConsumed?.()
    }, 0)

    return () => window.clearTimeout(id)
  }, [initialAction, loading, onInitialActionConsumed])

  const updateState = (i: number, patch: Partial<ExerciseState>) =>
    setExerciseStates(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  const logSet = (i: number) => {
    if (!session) return
    const s = exerciseStates[i]; const ex = exercises[i]; const setNum = s.loggedSets.length + 1
    const payload = { workout_session_id: session.id, workout_exercise_id: ex.id, exercise_name: ex.exercise_name, set_number: setNum, weight_lbs: s.weight, weight_unit: 'kg', reps: s.selectedReps, rpe: s.selectedRpe }
    supabase.from('workout_logs').insert(payload).select('*').single().then(async ({ data, error }) => {
      if (error && error.message.includes('workout_session_id')) {
        const { workout_session_id, workout_exercise_id, ...legacyPayload } = payload
        void workout_session_id; void workout_exercise_id
        const r = await supabase.from('workout_logs').insert(legacyPayload).select('*').single()
        data = r.data; error = r.error
      }
      if (error) { console.error('workout log insert failed:', error.message); return }
      const log = data as WorkoutLog
      updateState(i, { loggedSets: [...s.loggedSets, { id: log.id, setNum: log.set_number ?? setNum, weight: log.weight_lbs ?? s.weight, reps: log.reps ?? s.selectedReps, rpe: log.rpe ?? s.selectedRpe }] })
      setLastSets(prev => ({ ...prev, [ex.exercise_name]: log }))
      // Auto-advance to next exercise if target sets reached
      const target = ex.prescribed_sets ?? 0
      if (target > 0 && (s.loggedSets.length + 1) >= target) {
        const nextIncomplete = exercises.findIndex((e, idx) => idx > i && (exerciseStates[idx]?.loggedSets.length ?? 0) < (e.prescribed_sets ?? 0))
        if (nextIncomplete !== -1) setActiveExIdx(nextIncomplete)
      }
    })
  }

  const isGymDay = !!getDayMeta(selectedDay, currentPlan.blockSlug).dbKey
  const totalSets = exerciseStates.reduce((acc, s) => acc + s.loggedSets.length, 0)
  const totalTarget = exercises.reduce((acc, ex) => acc + (ex.prescribed_sets ?? 0), 0)
  const activeEx = exercises[activeExIdx] ?? null
  const activeState = exerciseStates[activeExIdx] ?? null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 28px 24px', gap: 12, overflow: 'hidden', fontFamily: sans }}>

      {/* Day rail */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {DAY_ORDER.map(day => {
          const isToday = day === today
          const isSelected = day === selectedDay
          const meta = getDayMeta(day, currentPlan.blockSlug)
          const isGym = !!meta?.dbKey
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                flex: 1, padding: '9px 10px', background: isSelected ? 'rgba(0,210,106,0.06)' : 'var(--surface)',
                border: `1px solid ${isSelected ? '#00d26a' : isToday ? '#00d26a44' : 'var(--border)'}`, borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.16em', color: isSelected ? '#00d26a' : isToday ? '#00d26a' : 'var(--text-dim)', fontWeight: 700 }}>
                  {meta?.label?.slice(0, 3).toUpperCase()}
                </span>
                {isToday && <span style={{ fontFamily: mono, fontSize: 9, color: '#00d26a', marginLeft: 'auto' }}>TODAY</span>}
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: isSelected ? '#00d26a' : isGym ? 'var(--text)' : 'var(--text-faint)', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {meta?.dbKey ? meta.dbKey.replace(/_/g, ' ') : meta?.restLabel ?? 'rest'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Rest/cardio day */}
      {!isGymDay && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>· {getDayMeta(selectedDay, currentPlan.blockSlug).restLabel} ·</div>
            <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--border-hi)', marginTop: 6 }}>{getDayMeta(selectedDay, currentPlan.blockSlug).restSub}</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isGymDay && loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 12, color: 'var(--text-faint)' }}>loading…</div>
      )}

      {/* No session */}
      {isGymDay && !loading && !session && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', fontFamily: mono, fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.14em' }}>
            {currentWeek == null ? 'NO ACTIVE TRAINING BLOCK' : 'NO SESSION SCHEDULED'}
          </div>
        </div>
      )}

      {/* Session */}
      {isGymDay && !loading && session && (
        <>
          {/* Session header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8, flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#00d26a', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                WEEK {currentWeek} · {session.session_type.toUpperCase()}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '3px 0 0', letterSpacing: '-0.01em' }}>{session.title}</h1>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {totalSets > 0 && (
                <button
                  type="button"
                  onClick={() => void shareWorkout()}
                  aria-label="Copy workout summary"
                  style={{
                    fontFamily: mono, fontSize: 10, fontWeight: 600, padding: '5px 10px',
                    borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
                    color: shareState !== 'idle' ? '#00d26a' : 'var(--text-dim)',
                    borderColor: shareState !== 'idle' ? '#00d26a' : 'var(--border)',
                    cursor: 'pointer', transition: 'color 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  {shareState === 'copied' ? 'Copied ✓' : shareState === 'shared' ? 'Shared ✓' : 'Copy'}
                </button>
              )}
              <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-faint)' }}>
                <span style={{ color: '#00d26a' }}>{totalSets}</span> / {totalTarget} sets
              </span>
            </span>
          </div>

          {/* Two columns */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.85fr 1.4fr', gap: 18, minHeight: 0 }}>

            {/* LEFT — exercise list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: 6, flexShrink: 0 }}>
                Session · {exercises.length} exercises
              </div>
              <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
                {exercises.map((ex, i) => {
                  const s = exerciseStates[i]
                  const isActive = i === activeExIdx
                  const isDone = s ? (s.loggedSets.length >= (ex.prescribed_sets ?? 0)) && ex.prescribed_sets != null && ex.prescribed_sets > 0 : false
                  return (
                    <button
                      key={ex.id}
                      onClick={() => setActiveExIdx(i)}
                      style={{
                        background: isActive ? 'rgba(0,210,106,0.05)' : 'var(--surface)',
                        border: `1px solid ${isActive ? '#00d26a' : 'var(--border)'}`,
                        borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', opacity: isDone ? 0.7 : 1, textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: isDone ? 'var(--text-faint)' : isActive ? '#00d26a' : 'transparent', border: !isDone && !isActive ? '1px solid var(--border-hi)' : 'none', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: isActive ? 600 : 500, textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.exercise_name}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                          {ex.prescribed_sets}×{ex.prescribed_reps}{ex.prescribed_weight ? ` · ${ex.prescribed_weight}kg` : ''}{ex.target_rpe ? ` · RPE ${ex.target_rpe}` : ''}
                        </div>
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: isDone ? 'var(--text-faint)' : isActive ? '#00d26a' : 'var(--text-dim)', flexShrink: 0 }}>
                        {s?.loggedSets.length ?? 0}/{ex.prescribed_sets ?? '?'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Readiness banner */}
              {readiness && readiness.state !== 'green' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  background: `${stateColor(readiness.state)}08`,
                  border: `1px solid ${stateColor(readiness.state)}44`,
                  borderLeft: `3px solid ${stateColor(readiness.state)}`,
                  borderRadius: 8, flexShrink: 0,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: stateColor(readiness.state), flexShrink: 0 }} />
                  <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5, flex: 1 }}>
                    <span style={{ color: stateColor(readiness.state), fontWeight: 700, letterSpacing: '0.14em' }}>{stateLabel(readiness.state)} · </span>
                    {rpeCap != null && rpeCap > 0 ? `cap RPE at ${rpeCap}` : 'full rest today'}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>→ Today</span>
                </div>
              )}
            </div>

            {/* RIGHT — active logger */}
            {activeEx && activeState && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'auto' }}>
                {/* Exercise header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#00d26a', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                      · NOW · SET {activeState.loggedSets.length + 1} OF {activeEx.prescribed_sets ?? '?'} ·
                    </div>
                    <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: '4px 0 0', letterSpacing: '-0.01em' }}>{activeEx.exercise_name}</h2>
                    <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
                      prescribed: {activeEx.prescribed_sets}×{activeEx.prescribed_reps}{activeEx.prescribed_weight ? ` · ${activeEx.prescribed_weight}kg` : ''}{activeEx.target_rpe ? ` · RPE ${activeEx.target_rpe}` : ''}
                    </div>
                  </div>
                  {lastSets[activeEx.exercise_name] && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>last session</span>
                      <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-dim)' }}>
                        {lastSets[activeEx.exercise_name].weight_lbs}kg × {lastSets[activeEx.exercise_name].reps} @ {lastSets[activeEx.exercise_name].rpe}
                      </span>
                      {getProgressionSuggestion(activeEx, lastSets[activeEx.exercise_name]) !== null && (
                        <span style={{ fontFamily: mono, fontSize: 10, color: '#00d26a', fontWeight: 700 }}>
                          → try {getProgressionSuggestion(activeEx, lastSets[activeEx.exercise_name])}kg
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Weight + Reps */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14, flexShrink: 0 }}>
                  {/* Weight stepper */}
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Weight</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button onClick={() => updateState(activeExIdx, { weight: Math.max(0, activeState.weight - 2.5) })} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer' }}>−</button>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontFamily: mono, fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{activeState.weight}</span>
                        <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-faint)' }}>kg</span>
                      </div>
                      <button onClick={() => updateState(activeExIdx, { weight: activeState.weight + 2.5 })} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-dim)', fontSize: 18, cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                  {/* Reps grid */}
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Reps</span>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(r => (
                        <button
                          key={r}
                          onClick={() => updateState(activeExIdx, { selectedReps: r })}
                          style={{
                            minWidth: 36, height: 34, padding: '0 8px', borderRadius: 999, cursor: 'pointer',
                            background: activeState.selectedReps === r ? 'linear-gradient(180deg, #2ee6a8, #00d26a)' : 'var(--ink-04)',
                            border: `1px solid ${activeState.selectedReps === r ? 'transparent' : 'var(--border)'}`,
                            boxShadow: activeState.selectedReps === r ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,210,106,0.3)' : 'none',
                            color: activeState.selectedReps === r ? '#062514' : 'var(--text-dim)',
                            fontFamily: mono, fontSize: 12, fontWeight: activeState.selectedReps === r ? 700 : 500,
                          }}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RPE */}
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>RPE</span>
                    {rpeCap != null && rpeCap > 0 && (
                      <span style={{ fontFamily: mono, fontSize: 10, color: '#f59e0b' }}>
                        readiness cap: <span style={{ fontWeight: 700 }}>≤ {rpeCap}</span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {RPE_OPTIONS.map(r => {
                      const overCap = rpeCap != null && rpeCap > 0 && r > rpeCap
                      const selected = activeState.selectedRpe === r
                      return (
                        <button
                          key={r}
                          onClick={() => !overCap && updateState(activeExIdx, { selectedRpe: r })}
                          style={{
                            flex: 1, height: 30, borderRadius: 8, cursor: overCap ? 'not-allowed' : 'pointer',
                            background: selected ? 'linear-gradient(180deg, #2ee6a8, #00d26a)' : 'var(--ink-04)',
                            border: `1px solid ${selected ? 'transparent' : 'var(--border)'}`,
                            boxShadow: selected ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(0,210,106,0.3)' : 'none',
                            color: selected ? '#062514' : overCap ? 'var(--border-hi)' : 'var(--text-dim)',
                            fontFamily: mono, fontSize: 11, fontWeight: selected ? 700 : 500,
                            textDecoration: overCap ? 'line-through' : 'none',
                            opacity: overCap ? 0.45 : 1,
                          }}
                        >{r}</button>
                      )
                    })}
                  </div>
                </div>

                {/* Log set CTA */}
                <button
                  onClick={() => logSet(activeExIdx)}
                  className="btn-accent"
                  style={{ border: 'none', padding: '13px 0', fontFamily: sans, fontSize: 14, fontWeight: 700, borderRadius: 12, cursor: 'pointer', flexShrink: 0 }}
                >
                  Log set {activeState.loggedSets.length + 1}{activeEx.prescribed_sets ? ` of ${activeEx.prescribed_sets}` : ''} · {activeState.weight}kg × {activeState.selectedReps} @ {activeState.selectedRpe}  →
                </button>

                {/* Logged sets */}
                {activeState.loggedSets.length > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>Logged this session</div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {activeState.loggedSets.map((ls, i) => (
                        <div key={ls.setNum} style={{
                          display: 'grid', gridTemplateColumns: '36px 1fr 60px 60px',
                          fontFamily: mono, fontSize: 11, color: 'var(--text-dim)',
                          padding: '9px 12px', borderBottom: i < activeState.loggedSets.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <span style={{ color: 'var(--text-faint)' }}>{ls.setNum}</span>
                          <span>{ls.weight}kg × {ls.reps}</span>
                          <span style={{ textAlign: 'right' }}>{ls.rpe}</span>
                          <span style={{ textAlign: 'right', color: 'var(--text-faint)' }}>done</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!activeEx && !loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontFamily: mono, fontSize: 12 }}>
                select an exercise to log
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

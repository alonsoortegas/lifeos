'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { WorkoutSession, WorkoutExercise, WorkoutLog, WhoopSnapshot } from '@/lib/types'
import { getCurrentWeek, getTodayKey, DAY_ORDER, DAY_META } from '@/lib/workout'
import { computeReadiness, stateColor, stateLabel } from '@/lib/readiness'

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

export default function WorkoutDesktop() {
  const today = getTodayKey()
  const currentWeek = getCurrentWeek()

  const [selectedDay, setSelectedDay] = useState(today)
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [lastSets, setLastSets] = useState<Record<string, WorkoutLog>>({})
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([])
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<WhoopSnapshot[]>([])

  // Load readiness snapshots once
  useEffect(() => {
    supabase.from('whoop_snapshots').select('*').order('recorded_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setSnapshots(data as WhoopSnapshot[]) })
  }, [])

  const readiness = useMemo(() => snapshots.length >= 3 ? computeReadiness(snapshots) : null, [snapshots])
  const rpeCap = readiness?.rpeCap ?? null

  const loadSession = useCallback(async (day: string) => {
    setLoading(true); setSession(null); setExercises([]); setExerciseStates([]); setActiveExIdx(0)
    const dbKey = DAY_META[day]?.dbKey
    if (!dbKey) { setLoading(false); return }
    const { data: sessionData } = await supabase.from('workout_sessions').select('*').eq('week_number', currentWeek).eq('day_of_week', dbKey).single()
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
  }, [currentWeek])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadSession(selectedDay) }, 0)
    return () => window.clearTimeout(id)
  }, [selectedDay, loadSession])

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

  const isGymDay = !!DAY_META[selectedDay]?.dbKey
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
          const meta = DAY_META[day]
          const isGym = !!meta?.dbKey
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                flex: 1, padding: '9px 10px', background: isSelected ? 'rgba(0,210,106,0.06)' : '#1a1a1a',
                border: `1px solid ${isSelected ? '#00d26a' : isToday ? '#00d26a44' : '#2a2a2a'}`, borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.16em', color: isSelected ? '#00d26a' : isToday ? '#00d26a' : '#888', fontWeight: 700 }}>
                  {meta?.label?.slice(0, 3).toUpperCase()}
                </span>
                {isToday && <span style={{ fontFamily: mono, fontSize: 9, color: '#00d26a', marginLeft: 'auto' }}>TODAY</span>}
              </div>
              <div style={{ fontFamily: sans, fontSize: 11, color: isSelected ? '#00d26a' : isGym ? '#ededed' : '#555', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
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
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase' }}>· {DAY_META[selectedDay]?.restLabel} ·</div>
            <div style={{ fontFamily: mono, fontSize: 12, color: '#3a3a3a', marginTop: 6 }}>{DAY_META[selectedDay]?.restSub}</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isGymDay && loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 12, color: '#555' }}>loading…</div>
      )}

      {/* No session */}
      {isGymDay && !loading && !session && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', fontFamily: mono, fontSize: 11, color: '#555', letterSpacing: '0.14em' }}>NO SESSION SCHEDULED</div>
        </div>
      )}

      {/* Session */}
      {isGymDay && !loading && session && (
        <>
          {/* Session header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a', paddingBottom: 8, flexShrink: 0 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#00d26a', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                WEEK {currentWeek} · {session.session_type.toUpperCase()}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ededed', margin: '3px 0 0', letterSpacing: '-0.01em' }}>{session.title}</h1>
            </div>
            <span style={{ fontFamily: mono, fontSize: 11, color: '#555' }}>
              <span style={{ color: '#00d26a' }}>{totalSets}</span> / {totalTarget} sets
            </span>
          </div>

          {/* Two columns */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.85fr 1.4fr', gap: 18, minHeight: 0 }}>

            {/* LEFT — exercise list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
              <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: '#555', textTransform: 'uppercase', borderBottom: '1px solid #2a2a2a', paddingBottom: 6, flexShrink: 0 }}>
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
                        background: isActive ? 'rgba(0,210,106,0.05)' : '#1a1a1a',
                        border: `1px solid ${isActive ? '#00d26a' : '#2a2a2a'}`,
                        borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', opacity: isDone ? 0.7 : 1, textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: isDone ? '#555' : isActive ? '#00d26a' : 'transparent', border: !isDone && !isActive ? '1px solid #3a3a3a' : 'none', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#ededed', fontWeight: isActive ? 600 : 500, textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.exercise_name}</div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#555', marginTop: 1 }}>
                          {ex.prescribed_sets}×{ex.prescribed_reps}{ex.prescribed_weight ? ` · ${ex.prescribed_weight}kg` : ''}{ex.target_rpe ? ` · RPE ${ex.target_rpe}` : ''}
                        </div>
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: isDone ? '#555' : isActive ? '#00d26a' : '#888', flexShrink: 0 }}>
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
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#888', lineHeight: 1.5, flex: 1 }}>
                    <span style={{ color: stateColor(readiness.state), fontWeight: 700, letterSpacing: '0.14em' }}>{stateLabel(readiness.state)} · </span>
                    {rpeCap != null && rpeCap > 0 ? `cap RPE at ${rpeCap}` : 'full rest today'}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>→ Today</span>
                </div>
              )}
            </div>

            {/* RIGHT — active logger */}
            {activeEx && activeState && (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'auto' }}>
                {/* Exercise header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#00d26a', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                      · NOW · SET {activeState.loggedSets.length + 1} OF {activeEx.prescribed_sets ?? '?'} ·
                    </div>
                    <h2 style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: '#ededed', margin: '4px 0 0', letterSpacing: '-0.01em' }}>{activeEx.exercise_name}</h2>
                    <div style={{ fontFamily: mono, fontSize: 11, color: '#888', marginTop: 5 }}>
                      prescribed: {activeEx.prescribed_sets}×{activeEx.prescribed_reps}{activeEx.prescribed_weight ? ` · ${activeEx.prescribed_weight}kg` : ''}{activeEx.target_rpe ? ` · RPE ${activeEx.target_rpe}` : ''}
                    </div>
                  </div>
                  {lastSets[activeEx.exercise_name] && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>last session</span>
                      <span style={{ fontFamily: mono, fontSize: 12, color: '#888' }}>
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
                  <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#888', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Weight</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button onClick={() => updateState(activeExIdx, { weight: Math.max(0, activeState.weight - 2.5) })} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #3a3a3a', background: 'transparent', color: '#888', fontSize: 18, cursor: 'pointer' }}>−</button>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontFamily: mono, fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: '#ededed', lineHeight: 1 }}>{activeState.weight}</span>
                        <span style={{ fontFamily: mono, fontSize: 12, color: '#555' }}>kg</span>
                      </div>
                      <button onClick={() => updateState(activeExIdx, { weight: activeState.weight + 2.5 })} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #3a3a3a', background: 'transparent', color: '#888', fontSize: 18, cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                  {/* Reps grid */}
                  <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#888', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Reps</span>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(r => (
                        <button
                          key={r}
                          onClick={() => updateState(activeExIdx, { selectedReps: r })}
                          style={{
                            minWidth: 36, height: 34, padding: '0 8px', borderRadius: 7, cursor: 'pointer',
                            background: activeState.selectedReps === r ? '#00d26a' : 'transparent',
                            border: `1px solid ${activeState.selectedReps === r ? '#00d26a' : '#2a2a2a'}`,
                            color: activeState.selectedReps === r ? '#0e0e0e' : '#888',
                            fontFamily: mono, fontSize: 12, fontWeight: activeState.selectedReps === r ? 700 : 500,
                          }}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RPE */}
                <div style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#888', letterSpacing: '0.16em', textTransform: 'uppercase' }}>RPE</span>
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
                            flex: 1, height: 30, borderRadius: 6, cursor: overCap ? 'not-allowed' : 'pointer',
                            background: selected ? '#00d26a' : 'transparent',
                            border: `1px solid ${selected ? '#00d26a' : '#2a2a2a'}`,
                            color: selected ? '#0e0e0e' : overCap ? '#3a3a3a' : '#888',
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
                  style={{ background: '#00d26a', color: '#0e0e0e', border: 'none', padding: '13px 0', fontFamily: sans, fontSize: 14, fontWeight: 700, borderRadius: 12, cursor: 'pointer', flexShrink: 0 }}
                >
                  Log set {activeState.loggedSets.length + 1}{activeEx.prescribed_sets ? ` of ${activeEx.prescribed_sets}` : ''} · {activeState.weight}kg × {activeState.selectedReps} @ {activeState.selectedRpe}  →
                </button>

                {/* Logged sets */}
                {activeState.loggedSets.length > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 9, color: '#555', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>Logged this session</div>
                    <div style={{ border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' }}>
                      {activeState.loggedSets.map((ls, i) => (
                        <div key={ls.setNum} style={{
                          display: 'grid', gridTemplateColumns: '36px 1fr 60px 60px',
                          fontFamily: mono, fontSize: 11, color: '#888',
                          padding: '9px 12px', borderBottom: i < activeState.loggedSets.length - 1 ? '1px solid #2a2a2a' : 'none',
                        }}>
                          <span style={{ color: '#555' }}>{ls.setNum}</span>
                          <span>{ls.weight}kg × {ls.reps}</span>
                          <span style={{ textAlign: 'right' }}>{ls.rpe}</span>
                          <span style={{ textAlign: 'right', color: '#555' }}>done</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!activeEx && !loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: mono, fontSize: 12 }}>
                select an exercise to log
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

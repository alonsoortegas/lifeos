'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import DailyBriefCard from '@/components/brief/DailyBriefCard'
import Ring from '@/components/ui/Ring'
import StatCard from '@/components/ui/StatCard'
import type { WhoopSnapshot, Todo } from '@/lib/types'
import { getCurrentGoalDate, getMillisecondsUntilNextGoalReset } from '@/lib/goal-dates'
import { getDayMeta, getPlanStatus, getTodayKey, type DayMeta } from '@/lib/workout'
import { sleepHM } from '@/lib/whoop-utils'
import { computeReadiness, stateColor, stateLabel, stateTone, type Readiness } from '@/lib/readiness'
import { formatDayText, shareText } from '@/lib/share'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

function strainValue(strain: number | null | undefined): string {
  if (strain == null) return '—'
  if (strain > 0 && strain < 0.05) return '<0.1'
  return strain.toFixed(1)
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Good night'
}

// ---------------------------------------------------------------------------
// GoalTicker
// ---------------------------------------------------------------------------
function GoalTicker() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [idx, setIdx] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  const loadTodos = useCallback(async () => {
    try {
      const today = getCurrentGoalDate()
      const { data } = await supabase
        .from('todos')
        .select('*')
        .eq('day_date', today)
        .order('created_at', { ascending: true })
      setTodos(data ?? [])
      setIdx(0)
      setAnimKey(k => k + 1)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadTodos()
    }, 0)
    let resetId: number

    const refreshAtReset = () => {
      void loadTodos()
      resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)
    }

    resetId = window.setTimeout(refreshAtReset, getMillisecondsUntilNextGoalReset() + 1000)

    const channel = supabase
      .channel('ticker_todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, loadTodos)
      .subscribe()

    const handleGoalsChanged = () => loadTodos()
    window.addEventListener('goals-changed', handleGoalsChanged)

    return () => {
      window.clearTimeout(id)
      window.clearTimeout(resetId)
      supabase.removeChannel(channel)
      window.removeEventListener('goals-changed', handleGoalsChanged)
    }
  }, [loadTodos])

  const pending = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done).length
  const total = todos.length

  useEffect(() => {
    if (pending.length <= 1) return
    const id = setInterval(() => {
      setAnimKey(k => k + 1)
      setIdx(i => (i + 1) % pending.length)
    }, 5000)
    return () => clearInterval(id)
  }, [pending.length])

  let text: string
  let textColor: string
  if (total === 0) {
    text = 'No goals set yet — add one in Focus.'
    textColor = 'var(--text-faint)'
  } else if (pending.length === 0) {
    text = 'All goals complete.'
    textColor = '#00d26a'
  } else {
    text = pending[idx % pending.length]?.text ?? ''
    textColor = 'var(--text)'
  }

  const allDone = total > 0 && pending.length === 0

  return (
    <div className="relative flex items-center gap-2 px-3 py-[6px] rounded-[10px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <style>{`
        @keyframes tickerPulse { 0%,100%{ opacity:1; transform:scale(1);} 50%{ opacity:0.4; transform:scale(0.85);} }
        @keyframes tickerSlideIn { from{ transform:translateY(100%); opacity:0;} to{ transform:translateY(0); opacity:1;} }
      `}</style>
      <div
        className="w-[7px] h-[7px] rounded-full flex-shrink-0"
        style={{
          background: '#00d26a',
          animation: allDone ? 'none' : 'tickerPulse 1.6s ease-in-out infinite',
        }}
      />
      <div
        className="text-[9px] font-bold tracking-[0.18em] uppercase flex-shrink-0"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--text-faint)' }}
      >
        GOALS
      </div>
      <div className="flex-1 h-5 overflow-hidden flex items-center">
        <span
          key={animKey}
          className="block text-[12px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis w-full tabular-nums"
          style={{
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            color: textColor,
            animation: total > 0 && pending.length > 0 ? 'tickerSlideIn 0.38s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
          }}
        >
          {text}
        </span>
      </div>
      <div
        className="text-[11px] px-[7px] py-[2px] rounded-full flex-shrink-0 transition-colors duration-300"
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          color: allDone ? '#00d26a' : 'var(--text-dim)',
          background: 'var(--ink-04)',
        }}
      >
        {done}/{total}
      </div>
      {total > 0 && (
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-[#00d26a] transition-all duration-700"
          style={{ width: `${(done / total) * 100}%` }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DayRing
// ---------------------------------------------------------------------------
const DAY_STOPS: [number, [number, number, number]][] = [
  [0,    [255, 216, 158]],
  [12.5, [255, 205, 121]],
  [25,   [255, 227, 143]],
  [37.5, [255, 183, 106]],
  [50,   [255, 149,  89]],
  [62.5, [243, 111,  79]],
  [75,   [226,  93, 122]],
  [87.5, [123,  91, 176]],
  [100,  [ 47,  58, 102]],
]

function lerpDayColor(p: number): string {
  for (let i = 0; i < DAY_STOPS.length - 1; i++) {
    const [pa, a] = DAY_STOPS[i]
    const [pb, b] = DAY_STOPS[i + 1]
    if (p >= pa && p <= pb) {
      const t = (p - pa) / (pb - pa)
      return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`
    }
  }
  return 'rgb(47,58,102)'
}

function formatRemaining(hoursLeft: number): string {
  const totalMin = Math.round(hoursLeft * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

function getDayRingState(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
  const WAKE = 8, SLEEP = 24
  const C = 2 * Math.PI * 50

  if (h < WAKE) {
    return { percent: 0, stroke: 'var(--ring-track)', dashOffset: C, phase: 'SLEEPING', display: '—', remaining: null }
  }
  if (h >= SLEEP) {
    return { percent: 100, stroke: '#2e3a66', dashOffset: 0, phase: 'PAST MIDNIGHT', display: '100%', remaining: null }
  }
  const percent = ((h - WAKE) / (SLEEP - WAKE)) * 100
  const phase = percent < 25 ? 'MORNING' : percent < 50 ? 'MIDDAY' : percent < 75 ? 'AFTERNOON' : percent < 90 ? 'EVENING' : 'BEDTIME'
  return {
    percent,
    stroke: lerpDayColor(percent),
    dashOffset: C * (1 - percent / 100),
    phase,
    display: `${Math.round(percent)}%`,
    remaining: formatRemaining(SLEEP - h),
  }
}

const INITIAL_DAY_RING_STATE = {
  percent: 0,
  stroke: 'var(--ring-track)',
  dashOffset: 2 * Math.PI * 50,
  phase: 'DAY',
  display: '—',
  remaining: null as string | null,
}

function DayRing() {
  const [state, setState] = useState(INITIAL_DAY_RING_STATE)
  const C = 2 * Math.PI * 50

  useEffect(() => {
    const tick = () => setState(getDayRingState())
    const immediateId = window.setTimeout(tick, 0)
    const id = setInterval(() => setState(getDayRingState()), 60_000)
    return () => {
      window.clearTimeout(immediateId)
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-[6px]">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8" style={{ stroke: 'var(--ring-track)' }} />
          <circle
            cx="60" cy="60" r="50" fill="none"
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={state.dashOffset}
            transform="rotate(-90 60 60)"
            style={{ stroke: state.stroke, transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[var(--text)]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {state.display}
          </span>
          <span
            className="text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)] mt-[3px]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {state.phase}
          </span>
          {state.remaining && (
            <span
              className="text-[7px] tracking-[0.1em] text-[var(--text-faint)] mt-[2px]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              {state.remaining}
            </span>
          )}
        </div>
      </div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        Day Progress
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DayModeCard
// ---------------------------------------------------------------------------

interface NutritionRemaining { calories: number; protein_g: number }

function getTrainingAdvice(readiness: Readiness, todayMeta: DayMeta): string {
  if (!todayMeta.dbKey) {
    if (readiness.state === 'hardNo') return 'Keep it restorative. Skip intensity.'
    if (readiness.state === 'recover') return 'Easy movement only. Treat this as recovery.'
    return todayMeta.restSub
  }

  if (readiness.state === 'green') return 'Run the programmed session.'
  if (readiness.state === 'controlled') return `Train, but cap effort at RPE ${readiness.rpeCap}.`
  if (readiness.state === 'recover') return 'Reduce to technique work or Z2.'
  return 'No training load today.'
}

function getNutritionAdvice(readiness: Readiness, remaining: NutritionRemaining | null): string {
  if (remaining) {
    const kcal = Math.round(remaining.calories)
    const prot = Math.round(remaining.protein_g)
    if (kcal <= 0 && prot <= 0) return 'Targets hit. Stay hydrated.'
    if (prot > 0 && kcal > 0) return `+${prot}g protein · ${kcal} kcal left`
    if (prot > 0) return `+${prot}g protein left`
    if (kcal > 0) return `${kcal} kcal left`
  }
  if (readiness.state === 'green') return 'Fuel normally. Keep protein high and place carbs near training.'
  if (readiness.state === 'controlled') return 'Do not under-eat. Protein first, then steady carbs.'
  if (readiness.state === 'recover') return 'Use simpler meals. Hydrate and keep protein floor intact.'
  return 'Easy food, hydration, and an earlier night.'
}

function getRecoveryAdvice(readiness: Readiness): string {
  if (readiness.state === 'green') return 'Sleep and HRV support a normal day.'
  if (readiness.state === 'controlled') return 'Useful day, but leave margin.'
  if (readiness.state === 'recover') return 'Recovery has priority over output.'
  return 'Protect sleep. No extra stressors.'
}

function DayModeCard({
  readiness,
  todayMeta,
  topTodo,
  nutritionRemaining,
}: {
  readiness: Readiness
  todayMeta: DayMeta
  topTodo: string | null
  nutritionRemaining: NutritionRemaining | null
}) {
  const c = stateColor(readiness.state)
  const tone = stateTone(readiness.state)
  const toneColor = tone === 'good' ? '#00d26a' : tone === 'warn' ? '#f59e0b' : '#ef4444'
  const focusValue = topTodo ? `Top goal: ${topTodo}` : 'Clear the top goal before adding more.'
  const rows = [
    { label: 'Focus', value: focusValue },
    { label: 'Training', value: getTrainingAdvice(readiness, todayMeta) },
    { label: 'Nutrition', value: getNutritionAdvice(readiness, nutritionRemaining) },
    { label: 'Recovery', value: getRecoveryAdvice(readiness) },
  ]

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${c}55`,
        borderLeft: `3px solid ${c}`,
        borderRadius: 14,
        padding: '14px 14px 12px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[9px] font-bold tracking-[0.2em] uppercase"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--text-faint)' }}
          >
          DAY MODE
        </span>
        <span
          className="text-[9px] font-bold tracking-[0.14em] uppercase px-[7px] py-[3px] rounded-full"
          style={{
            fontFamily: 'var(--font-jetbrains-mono, monospace)',
            color: toneColor,
            border: `1px solid ${toneColor}55`,
            background: `${toneColor}10`,
          }}
        >
          {stateLabel(readiness.state)}
        </span>
      </div>

      <div className="text-[18px] font-semibold leading-[1.25] text-[var(--text)] mb-2" style={{ letterSpacing: '-0.01em' }}>
        {readiness.headline}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {readiness.rationale.slice(0, 3).map((r) => (
          <span
            key={r}
            className="text-[10px] px-[7px] py-[3px] rounded-full"
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              color: 'var(--text-dim)',
              background: 'var(--ink-04)',
              border: '1px solid var(--border)',
            }}
          >
            {r}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-1.5 pt-3 border-t border-[var(--border)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[82px_1fr] gap-2 rounded-lg px-2.5 py-2"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <span
              className="text-[9px] font-bold tracking-[0.16em] uppercase"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--text-faint)' }}
            >
              {row.label}
            </span>
            <span className="text-[12px] leading-[1.3] text-[var(--text)]">{row.value}</span>
          </div>
        ))}
      </div>

      {readiness.rpeCap != null && readiness.rpeCap > 0 && (
        <div
          className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--border)]"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          <span className="text-[10px] text-[var(--text-faint)]">RPE cap → Workout</span>
          <span className="text-[10px] font-bold" style={{ color: toneColor }}>RPE ≤ {readiness.rpeCap}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DayScheduleCard
// ---------------------------------------------------------------------------

interface ScheduleBlock {
  start: string  // "HH:MM"
  end: string
  label: string
  desc: string
  color: string
}

const SCHEDULE: ScheduleBlock[] = [
  { start: '06:30', end: '07:00', label: 'Wake up',           desc: 'No phone for 15 min. Outside immediately — morning light for circadian reset.',             color: '#fbbf24' },
  { start: '07:00', end: '07:45', label: 'Walk #1',           desc: '20-30 min easy pace. Digestion anchor — same as you\'ve been doing.',                       color: '#00d26a' },
  { start: '07:45', end: '08:30', label: 'Breakfast',         desc: 'Shower, scalp routine.',                                                                    color: '#f97316' },
  { start: '08:30', end: '12:30', label: 'Deep work',         desc: 'embee-tech or Movu — harder deadline first. Phone away.',                                   color: '#38bdf8' },
  { start: '12:30', end: '13:30', label: 'Lunch',             desc: 'Outside if possible. Not at the desk.',                                                     color: '#00d26a' },
  { start: '13:30', end: '17:30', label: 'Work block 2',      desc: 'Second project or split. Walking meeting if you have calls.',                               color: '#38bdf8' },
  { start: '17:30', end: '18:30', label: 'Movement',          desc: 'Light mobility + stretching. Gradual ramp — no heavy sweating yet unless cleared.',         color: '#a78bfa' },
  { start: '18:30', end: '19:30', label: 'Dinner',            desc: 'Not in front of a screen.',                                                                 color: '#f97316' },
  { start: '19:30', end: '21:30', label: 'Social / low-key',  desc: 'Call a friend, short walk, read. Cap screen time — don\'t let it slide to bed.',            color: '#a78bfa' },
  { start: '21:30', end: '22:00', label: 'Wind-down',         desc: 'No screens. The actual lever for your HRV/RHR trend.',                                      color: '#fb7185' },
  { start: '22:00', end: '22:30', label: 'Lights out',        desc: 'Sleep.',                                                                                    color: '#5b6473' },
]

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function getBlockState(block: ScheduleBlock, nowMin: number): 'past' | 'active' | 'future' {
  const start = toMinutes(block.start)
  const end = toMinutes(block.end)
  if (nowMin >= end) return 'past'
  if (nowMin >= start) return 'active'
  return 'future'
}

function getActiveProgress(block: ScheduleBlock, nowMin: number): number {
  const start = toMinutes(block.start)
  const end = toMinutes(block.end)
  return Math.min(1, Math.max(0, (nowMin - start) / (end - start)))
}

function DayScheduleCard({ now }: { now: Date | null }) {
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1
  const activeIdx = SCHEDULE.findIndex((b) => getBlockState(b, nowMin) === 'active')

  return (
    <div className="panel rounded-2xl p-4">
      <div
        className="text-[9px] font-bold tracking-[0.2em] uppercase mb-3"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--text-faint)' }}
      >
        DAY SCHEDULE
      </div>

      <div className="relative">
        {/* Vertical spine */}
        <div
          className="absolute left-[39px] top-0 bottom-0 w-px"
          style={{ background: 'var(--border)' }}
        />

        <div className="flex flex-col gap-0">
          {SCHEDULE.map((block, i) => {
            const state = getBlockState(block, nowMin)
            const progress = state === 'active' ? getActiveProgress(block, nowMin) : 0
            const isActive = state === 'active'
            const isPast = state === 'past'

            return (
              <div key={block.start} className="relative flex items-start gap-3">
                {/* Time */}
                <div
                  className="w-[39px] flex-shrink-0 pt-[10px] text-right text-[9px] leading-none tabular-nums"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono, monospace)',
                    color: isActive ? block.color : isPast ? 'var(--text-faint)' : 'var(--text-dim)',
                    opacity: isPast ? 0.45 : 1,
                  }}
                >
                  {block.start}
                </div>

                {/* Dot on spine */}
                <div className="flex-shrink-0 relative z-10 mt-[8px]">
                  <div
                    className="w-[9px] h-[9px] rounded-full border-2 transition-all duration-500"
                    style={{
                      borderColor: isActive ? block.color : isPast ? 'var(--border-hi)' : 'var(--border)',
                      background: isActive ? block.color : isPast ? 'var(--surface-2)' : 'var(--surface)',
                      boxShadow: isActive ? `0 0 8px ${block.color}88` : 'none',
                    }}
                  />
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-xl px-3 py-[9px] mb-[5px] overflow-hidden transition-all duration-300 ${isActive ? 'border' : ''}`}
                  style={{
                    background: isActive ? `${block.color}0f` : 'transparent',
                    borderColor: isActive ? `${block.color}40` : 'transparent',
                    opacity: isPast ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="text-[13px] font-semibold leading-tight"
                      style={{ color: isActive ? block.color : 'var(--text)' }}
                    >
                      {block.label}
                    </span>
                    <span
                      className="text-[9px] tabular-nums flex-shrink-0"
                      style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: 'var(--text-faint)' }}
                    >
                      {block.end}
                    </span>
                  </div>

                  {block.desc && (
                    <p
                      className="text-[11px] leading-[1.4] mt-[3px]"
                      style={{ color: isActive ? 'var(--text-dim)' : 'var(--text-faint)' }}
                    >
                      {block.desc}
                    </p>
                  )}

                  {/* Progress bar for active block */}
                  {isActive && (
                    <div
                      className="mt-[7px] h-[2px] rounded-full overflow-hidden"
                      style={{ background: `${block.color}25` }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-[60s]"
                        style={{
                          width: `${progress * 100}%`,
                          background: block.color,
                          boxShadow: `0 0 4px ${block.color}`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TodayTab
// ---------------------------------------------------------------------------
export default function TodayTab() {
  const [snapshots, setSnapshots] = useState<WhoopSnapshot[]>([])
  const [reauthRequired, setReauthRequired] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [topTodo, setTopTodo] = useState<string | null>(null)
  const [nutritionRemaining, setNutritionRemaining] = useState<NutritionRemaining | null>(null)
  const [dayShared, setDayShared] = useState(false)

  const snap = snapshots[0] ?? null
  const readiness = snapshots.length >= 3 ? computeReadiness(snapshots) : null

  useEffect(() => {
    const load = () =>
      supabase
        .from('whoop_snapshots')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(30)
        .then(({ data }) => { if (data) setSnapshots(data as WhoopSnapshot[]) })

    load()
    fetch('/api/whoop-status')
      .then(r => r.json())
      .then(d => setReauthRequired(d.reauth_required ?? false))
      .catch(() => { /* non-critical */ })

    const channel = supabase
      .channel('whoop_snapshots_today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whoop_snapshots' }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Best-effort: top unfinished goal
  useEffect(() => {
    const today = getCurrentGoalDate()
    void (async () => {
      try {
        const { data } = await supabase
          .from('todos')
          .select('text')
          .eq('day_date', today)
          .eq('done', false)
          .order('sort_order', { ascending: true })
          .limit(1)
          .single()
        setTopTodo(data?.text ?? null)
      } catch { /* non-critical */ }
    })()
  }, [])

  // Best-effort: nutrition remaining (calories + protein)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    void (async () => {
      try {
        const { data } = await supabase
          .from('nutrition_day')
          .select('calories_target, protein_target, meal_log(meal_log_item(calories, protein_g))')
          .eq('date', today)
          .single()
        if (!data) return
        const items = (data.meal_log as { meal_log_item: { calories: number; protein_g: number }[] }[] ?? [])
          .flatMap(log => log.meal_log_item ?? [])
        const consumedCal = items.reduce((s, i) => s + (Number(i.calories) || 0), 0)
        const consumedProt = items.reduce((s, i) => s + (Number(i.protein_g) || 0), 0)
        setNutritionRemaining({
          calories: (data.calories_target ?? 0) - consumedCal,
          protein_g: (data.protein_target ?? 0) - consumedProt,
        })
      } catch { /* non-critical */ }
    })()
  }, [])

  useEffect(() => {
    const tick = () => setNow(new Date())
    const immediateId = window.setTimeout(tick, 0)
    const id = setInterval(tick, 60_000)
    return () => {
      window.clearTimeout(immediateId)
      clearInterval(id)
    }
  }, [])

  const dayName = now ? now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() : 'TODAY'
  const dateStr = now ? now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : '—'
  const currentPlan = getPlanStatus()
  const trainingWeek = currentPlan.week
  const todayMeta = getDayMeta(getTodayKey(), currentPlan.blockSlug)
  const blockLabel = todayMeta.dbKey ? 'WEIGHTS' : todayMeta.restLabel
  const greeting = now ? getGreeting() : 'Welcome back'

  const recovery = snap?.recovery_score ?? 0
  const ringColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'

  return (
    <div className="boot px-4 space-y-5">
      <div className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <span
            className="flicker text-[var(--text-dim)] uppercase text-[11px] tracking-[0.18em]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {dayName} · {dateStr}
          </span>
          <button
            type="button"
            aria-label="Copy day summary"
            onClick={() => {
              void shareText(formatDayText({
                date: now ?? new Date(),
                readiness,
                recovery: snap?.recovery_score ?? null,
                hrv: snap?.hrv_rmssd ?? null,
                rhr: snap?.rhr ?? null,
                sleepScore: snap?.sleep_score ?? null,
                topTodo,
                nutritionRemaining,
              })).then(result => {
                if (result === 'failed') return
                setDayShared(true)
                window.setTimeout(() => setDayShared(false), 1800)
              })
            }}
            className={`glass rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all active:scale-[0.95] ${
              dayShared ? 'border-[#00d26a] text-[#00d26a]' : 'border-[var(--border)] text-[var(--text-faint)]'
            }`}
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {dayShared ? 'Copied ✓' : 'Copy day'}
          </button>
        </div>
        <h1 className="display text-[28px] font-bold tracking-tight text-[var(--text)] mt-1">{greeting}</h1>
        <div className="text-[var(--text-faint)] text-[11px] mt-0.5 tracking-[0.12em]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {trainingWeek ? `WEEK ${trainingWeek} · ${blockLabel}` : 'NO ACTIVE TRAINING BLOCK'}
        </div>
      </div>

      <DailyBriefCard />

      <GoalTicker />

      <div className="flex flex-col items-center py-4 gap-2">
        <div className="flex flex-row items-end justify-around gap-6 w-full flex-wrap">
          <div className="flex flex-col items-center gap-2">
            <Ring value={snap ? recovery : 0} size={140} thickness={8} color={snap ? ringColor : 'var(--border)'} />
            <div className="text-[var(--text-dim)] uppercase text-[11px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              Recovery Score
            </div>
          </div>
          <DayRing />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="HRV"
          value={snap?.hrv_rmssd != null ? snap.hrv_rmssd.toFixed(1) : '—'}
          unit={snap ? 'ms' : undefined}
          sub="rmssd · last night"
          accent={!!snap}
          color="#3b82f6"
          delta={readiness?.signals.hrv}
        />
        <StatCard
          label="RHR"
          value={snap?.rhr ?? '—'}
          unit={snap?.rhr != null ? 'bpm' : undefined}
          sub="resting heart rate"
          color="#f97316"
          delta={readiness?.signals.rhr}
        />
        <StatCard
          label="Strain"
          value={reauthRequired ? '—' : strainValue(snap?.strain)}
          sub={reauthRequired ? 'sync paused · reconnect' : snap?.strain != null ? 'daily strain' : 'no activity logged'}
          color="#a78bfa"
          delta={readiness?.signals.strain7d}
        />
        <StatCard
          label="Sleep"
          value={snap?.sleep_score ?? '—'}
          unit={snap?.sleep_score != null ? '%' : undefined}
          sub={snap?.sleep_duration_ms ? sleepHM(snap.sleep_duration_ms) + ' · last night' : 'last night'}
          color="#06b6d4"
          delta={readiness?.signals.sleepScore}
        />
      </div>

      <DayScheduleCard now={now} />

      {readiness && <DayModeCard readiness={readiness} todayMeta={todayMeta} topTodo={topTodo} nutritionRemaining={nutritionRemaining} />}

      {reauthRequired && (
        <a
          href="/api/whoop-auth"
          className="btn-accent block rounded-xl py-3 text-center text-[12px] font-bold no-underline"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          reconnect whoop
        </a>
      )}

      <div className="h-4" />

    </div>
  )
}

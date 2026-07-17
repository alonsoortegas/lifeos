'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Ring from '@/components/ui/Ring'
import StatCard from '@/components/ui/StatCard'
import type { WhoopSnapshot, Todo } from '@/lib/types'
import { getCurrentGoalDate, getMillisecondsUntilNextGoalReset } from '@/lib/goal-dates'
import { getDayMeta, getPlanStatus, getTodayKey } from '@/lib/workout'
import { sleepHM } from '@/lib/whoop-utils'
import { computeReadiness } from '@/lib/readiness'
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
// MacroRing — kcal progress ring, arc segmented by macro (protein/carbs/fat)
// ---------------------------------------------------------------------------

interface MacroTotals { calories: number; protein_g: number; carbs_g: number; fat_g: number }

const MACRO_COLORS = { protein: '#2dd4bf', carbs: '#f59e0b', fat: '#a78bfa' }

function MacroRing({ macros }: { macros: { targets: MacroTotals; consumed: MacroTotals } | null }) {
  const C = 2 * Math.PI * 50
  const consumed = macros?.consumed ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  const targetCalories = macros?.targets.calories ?? 0
  const progress = targetCalories > 0 ? Math.min(1, consumed.calories / targetCalories) : 0
  const totalArc = C * progress

  const kcalByMacro = {
    protein: consumed.protein_g * 4,
    carbs: consumed.carbs_g * 4,
    fat: consumed.fat_g * 9,
  }
  const kcalSum = kcalByMacro.protein + kcalByMacro.carbs + kcalByMacro.fat

  const segments: { color: string; length: number }[] = []
  if (kcalSum > 0) {
    for (const key of ['protein', 'carbs', 'fat'] as const) {
      segments.push({ color: MACRO_COLORS[key], length: totalArc * (kcalByMacro[key] / kcalSum) })
    }
  }

  let cumulative = 0

  return (
    <div className="flex flex-col items-center gap-[6px]">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8" style={{ stroke: 'var(--ring-track)' }} />
          {segments.map((seg, i) => {
            const offset = -cumulative
            cumulative += seg.length
            return (
              <circle
                key={i}
                cx="60" cy="60" r="50" fill="none"
                strokeWidth="8" strokeLinecap="butt"
                strokeDasharray={`${seg.length} ${C - seg.length}`}
                strokeDashoffset={offset}
                transform="rotate(-90 60 60)"
                style={{ stroke: seg.color, transition: 'stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1)' }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-[22px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[var(--text)]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {Math.round(consumed.calories)}
          </span>
          <span
            className="text-[9px] tracking-[0.08em] tabular-nums text-[var(--text-faint)] mt-[3px]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            / {Math.round(targetCalories)} kcal
          </span>
        </div>
      </div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        Macros
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
  const [macroProgress, setMacroProgress] = useState<{ targets: MacroTotals; consumed: MacroTotals } | null>(null)
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

  // Best-effort: today's macro progress (consumed vs target, for the Macros ring)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    void (async () => {
      try {
        const { data } = await supabase
          .from('nutrition_day')
          .select('calories_target, protein_target, carbs_target, fat_target, meal_log(meal_log_item(calories, protein_g, carbs_g, fat_g))')
          .eq('date', today)
          .single()
        if (!data) return
        const items = (data.meal_log as { meal_log_item: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[] }[] ?? [])
          .flatMap(log => log.meal_log_item ?? [])
        const consumed = items.reduce<MacroTotals>((totals, i) => ({
          calories: totals.calories + (Number(i.calories) || 0),
          protein_g: totals.protein_g + (Number(i.protein_g) || 0),
          carbs_g: totals.carbs_g + (Number(i.carbs_g) || 0),
          fat_g: totals.fat_g + (Number(i.fat_g) || 0),
        }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
        setMacroProgress({
          targets: {
            calories: data.calories_target ?? 0,
            protein_g: data.protein_target ?? 0,
            carbs_g: data.carbs_target ?? 0,
            fat_g: data.fat_target ?? 0,
          },
          consumed,
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
  const nutritionRemaining = macroProgress
    ? { calories: macroProgress.targets.calories - macroProgress.consumed.calories, protein_g: macroProgress.targets.protein_g - macroProgress.consumed.protein_g }
    : null

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

      <GoalTicker />

      <div className="flex flex-col items-center py-4 gap-2">
        <div className="flex flex-row items-end justify-around gap-6 w-full flex-wrap">
          <div className="flex flex-col items-center gap-2">
            <Ring value={snap ? recovery : 0} size={140} thickness={8} color={snap ? ringColor : 'var(--border)'} />
            <div className="text-[var(--text-dim)] uppercase text-[11px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              Recovery Score
            </div>
          </div>
          <MacroRing macros={macroProgress} />
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

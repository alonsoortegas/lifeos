'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Ring from '@/components/ui/Ring'
import StatCard from '@/components/ui/StatCard'
import type { WhoopSnapshot, Todo } from '@/lib/types'
import { getCurrentGoalDate, getMillisecondsUntilNextGoalReset } from '@/lib/goal-dates'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

const WHOOP_CLIENT_ID = 'aeb5a295-3c6a-42a9-9657-57227bb0adb7'
const WHOOP_SCOPES = 'offline read:recovery read:sleep read:workout read:cycles read:body_measurement'

function sleepHM(ms: number | null): string {
  if (!ms) return '—'
  const totalMin = Math.round(ms / 60000)
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
}

function whoopAuthUrl(host: string): string {
  const redirectUri = encodeURIComponent(`${host}/api/whoop-callback`)
  const scope = encodeURIComponent(WHOOP_SCOPES)
  return `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${WHOOP_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=lifeos26`
}

function strainValue(strain: number | null | undefined): string {
  if (strain == null) return '—'
  if (strain > 0 && strain < 0.05) return '<0.1'
  return strain.toFixed(1)
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
    textColor = '#555'
  } else if (pending.length === 0) {
    text = 'All goals complete.'
    textColor = '#00d26a'
  } else {
    text = pending[idx % pending.length]?.text ?? ''
    textColor = '#ededed'
  }

  return (
    <div className="flex items-center gap-2 px-3 py-[6px] rounded-[10px] bg-[#1a1a1a] border border-[#2a2a2a]">
      <style>{`
        @keyframes tickerPulse { 0%,100%{ opacity:1; transform:scale(1);} 50%{ opacity:0.4; transform:scale(0.85);} }
        @keyframes tickerSlideIn { from{ transform:translateY(100%); opacity:0;} to{ transform:translateY(0); opacity:1;} }
      `}</style>
      <div
        className="w-[7px] h-[7px] rounded-full flex-shrink-0"
        style={{ background: '#00d26a', animation: 'tickerPulse 1.6s ease-in-out infinite' }}
      />
      <div
        className="text-[9px] font-bold tracking-[0.18em] uppercase flex-shrink-0"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: '#555' }}
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
        className="text-[11px] px-[7px] py-[2px] rounded-full flex-shrink-0"
        style={{
          fontFamily: 'var(--font-jetbrains-mono, monospace)',
          color: '#888',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {done}/{total}
      </div>
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

function getDayRingState() {
  const now = new Date()
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
  const WAKE = 8, SLEEP = 24
  const C = 2 * Math.PI * 50

  if (h < WAKE) {
    return { percent: 0, stroke: 'rgba(255,255,255,0.08)', dashOffset: C, phase: 'SLEEPING', display: '—', remaining: null }
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

function DayRing() {
  const [state, setState] = useState(getDayRingState)
  const C = 2 * Math.PI * 50

  useEffect(() => {
    const id = setInterval(() => setState(getDayRingState()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center gap-[6px]">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke={state.stroke} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={state.dashOffset}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-[#ededed]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {state.display}
          </span>
          <span
            className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#555] mt-[3px]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            {state.phase}
          </span>
          {state.remaining && (
            <span
              className="text-[7px] tracking-[0.1em] text-[#555] mt-[2px]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              {state.remaining}
            </span>
          )}
        </div>
      </div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#555]"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        Day Progress
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TodayTab
// ---------------------------------------------------------------------------
export default function TodayTab() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)
  const [reauthRequired, setReauthRequired] = useState(false)

  useEffect(() => {
    const load = () =>
      supabase
        .from('whoop_snapshots')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => { if (data) setSnap(data as WhoopSnapshot) })

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

  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  const weekNum = Math.ceil(now.getDate() / 7)

  const recovery = snap?.recovery_score ?? 0
  const ringColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'

  return (
    <div className="px-4 space-y-5">
      <div className="pt-2">
        <div className="text-[#888] uppercase text-[11px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {dayName} · {dateStr}
        </div>
        <h1 className="text-[22px] font-bold text-[#ededed] mt-1">Good morning</h1>
        <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          WEEK {weekNum} · TRAINING BLOCK A
        </div>
      </div>

      <GoalTicker />

      <div className="flex flex-col items-center py-4 gap-2">
        <div className="flex flex-row items-end justify-around gap-6 w-full flex-wrap">
          <div className="flex flex-col items-center gap-2">
            <Ring value={snap ? recovery : 0} size={140} thickness={8} color={snap ? ringColor : '#2a2a2a'} />
            <div className="text-[#888] uppercase text-[11px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
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
        />
        <StatCard
          label="RHR"
          value={snap?.rhr ?? '—'}
          unit={snap?.rhr != null ? 'bpm' : undefined}
          sub="resting heart rate"
          color="#f97316"
        />
        <StatCard
          label="Strain"
          value={reauthRequired ? '—' : strainValue(snap?.strain)}
          sub={reauthRequired ? 'sync paused · reconnect' : snap?.strain != null ? 'daily strain' : 'no activity logged'}
          color="#a78bfa"
        />
        <StatCard
          label="Sleep"
          value={snap?.sleep_score ?? '—'}
          unit={snap?.sleep_score != null ? '%' : undefined}
          sub={snap?.sleep_duration_ms ? sleepHM(snap.sleep_duration_ms) + ' · last night' : 'last night'}
          color="#06b6d4"
        />
      </div>

      {reauthRequired && (
        <a
          href={typeof window !== 'undefined' ? whoopAuthUrl(window.location.origin) : '#'}
          className="block rounded-lg bg-[#00d26a] py-3 text-center text-[12px] font-bold text-[#0e0e0e] no-underline"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          reconnect whoop
        </a>
      )}

      <div className="h-4" />
    </div>
  )
}

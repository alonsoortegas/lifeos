'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Ring from '@/components/ui/Ring'
import StatCard from '@/components/ui/StatCard'
import type { WhoopSnapshot } from '@/lib/types'

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

      <div className="flex justify-center py-4">
        <div className="flex flex-col items-center gap-2">
          <Ring value={snap ? recovery : 0} size={170} thickness={14} color={snap ? ringColor : '#2a2a2a'} />
          <div className="text-[#888] uppercase text-[11px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            Recovery Score
          </div>
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

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

function sleepHM(ms: number | null): string {
  if (!ms) return '—'
  const totalMin = Math.round(ms / 60000)
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
}

export default function TodayTab() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)

  useEffect(() => {
    supabase
      .from('whoop_snapshots')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setSnap(data as WhoopSnapshot) })
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
        />
        <StatCard
          label="RHR"
          value={snap?.rhr ?? '—'}
          unit={snap?.rhr != null ? 'bpm' : undefined}
          sub="resting heart rate"
        />
        <StatCard
          label="Strain"
          value={snap?.strain != null ? snap.strain.toFixed(1) : '—'}
          sub={snap?.strain != null ? 'daily strain' : 'no activity logged'}
        />
        <StatCard
          label="Sleep"
          value={snap?.sleep_score ?? '—'}
          unit={snap?.sleep_score != null ? '%' : undefined}
          sub={snap?.sleep_duration_ms ? sleepHM(snap.sleep_duration_ms) + ' · last night' : 'last night'}
        />
      </div>

      <div className="h-4" />
    </div>
  )
}

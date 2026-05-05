'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Ring from '@/components/ui/Ring'
import Sparkline from '@/components/ui/Sparkline'
import Card from '@/components/ui/Card'
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

function fmt(n: number | null, decimals = 0): string {
  if (n == null) return '—'
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n))
}

export default function WhoopTab() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)
  const [history, setHistory] = useState<WhoopSnapshot[]>([])

  useEffect(() => {
    supabase
      .from('whoop_snapshots')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setSnap(data as WhoopSnapshot) })

    supabase
      .from('whoop_snapshots')
      .select('recovery_score, hrv_rmssd, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(7)
      .then(({ data }) => { if (data) setHistory([...(data as WhoopSnapshot[])].reverse()) })
  }, [])

  const recovery = snap?.recovery_score ?? 0
  const ringColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'

  const recoveryHistory = history.map(h => h.recovery_score ?? 0)
  const hrvHistory = history.map(h => Number(h.hrv_rmssd ?? 0))

  const recordedDate = snap?.recorded_at
    ? new Date(snap.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
    : '—'

  const sleepStages = snap
    ? [
        { label: 'Deep', pct: snap.sleep_deep_pct ?? 0, color: '#3b5bdb' },
        { label: 'REM', pct: snap.sleep_rem_pct ?? 0, color: '#9c36b5' },
        { label: 'Light', pct: snap.sleep_light_pct ?? 0, color: '#0ca678' },
        { label: 'Awake', pct: snap.sleep_awake_pct ?? 0, color: '#555' },
      ]
    : []

  const raw = snap?.raw_json as Record<string, unknown> | null
  const recoveryScore = (raw?.recovery as Record<string, unknown> | null)?.score as Record<string, unknown> | null
  const spo2 = recoveryScore?.spo2_percentage != null ? `${Number(recoveryScore.spo2_percentage).toFixed(1)}%` : '—'
  const skinTemp = recoveryScore?.skin_temp_celsius != null ? `${Number(recoveryScore.skin_temp_celsius).toFixed(1)} °C` : '—'
  const scoreState = (snap?.raw_json as Record<string, unknown> | null)
    ? ((((snap?.raw_json as Record<string, unknown>)?.recovery as Record<string, unknown>)?.score_state as string) ?? '—')
    : '—'

  return (
    <div className="px-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-[22px] font-bold text-[#ededed]">Recovery Breakdown</h1>
        <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {recordedDate}{snap?.cycle_id ? ` · CYCLE ${snap.cycle_id}` : ''}
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-5">
          <Ring value={snap ? recovery : 0} size={130} thickness={12} color={snap ? ringColor : '#2a2a2a'} />
          <div className="flex-1 space-y-4">
            <div>
              <div className="text-[#555] uppercase text-[10px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>HRV</div>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-bold text-[#ededed] leading-none" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                  {fmt(snap?.hrv_rmssd ?? null, 1)}
                </span>
                {snap?.hrv_rmssd != null && <span className="text-[#555] text-xs" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>ms</span>}
              </div>
            </div>
            <div>
              <div className="text-[#555] uppercase text-[10px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>RHR</div>
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-bold text-[#ededed] leading-none" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                  {fmt(snap?.rhr ?? null)}
                </span>
                {snap?.rhr != null && <span className="text-[#555] text-xs" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>bpm</span>}
              </div>
            </div>
            <div>
              <div className="text-[#555] uppercase text-[10px] tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>Strain</div>
              <div className="text-[22px] font-bold leading-none" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: snap?.strain != null ? '#ededed' : '#555' }}>
                {fmt(snap?.strain ?? null, 1)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div className="text-[#555] text-[11px] tracking-widest uppercase mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>· sleep ·</div>
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[#ededed] text-2xl font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {sleepHM(snap?.sleep_duration_ms ?? null)}
            </span>
            <span className="text-[#00d26a] text-sm font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {snap?.sleep_score != null ? `${snap.sleep_score}%` : '—'}
            </span>
          </div>

          {sleepStages.length > 0 && sleepStages.some(s => s.pct > 0) ? (
            <>
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {sleepStages.map(stage => (
                  <div key={stage.label} style={{ width: `${stage.pct}%`, backgroundColor: stage.color }} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {sleepStages.map(stage => (
                  <div key={stage.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-[#888] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {stage.label} {stage.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[#555] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              sleep stages not available
            </div>
          )}
        </Card>
      </div>

      {history.length > 1 && (
        <div>
          <div className="text-[#555] text-[11px] tracking-widest uppercase mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>· 7-day trend ·</div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 space-y-2">
              <div className="text-[#888] uppercase text-[10px] tracking-widest">Recovery %</div>
              <div className="text-[#ededed] text-xl font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {recoveryHistory[recoveryHistory.length - 1]}
              </div>
              <Sparkline data={recoveryHistory} width={120} height={36} color="#00d26a" />
              <div className="text-[#555] text-[10px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                avg {Math.round(recoveryHistory.reduce((a, b) => a + b, 0) / recoveryHistory.length)}
              </div>
            </Card>
            <Card className="p-4 space-y-2">
              <div className="text-[#888] uppercase text-[10px] tracking-widest">HRV ms</div>
              <div className="text-[#ededed] text-xl font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {hrvHistory[hrvHistory.length - 1].toFixed(1)}
              </div>
              <Sparkline data={hrvHistory} width={120} height={36} color="#888" />
              <div className="text-[#555] text-[10px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                avg {(hrvHistory.reduce((a, b) => a + b, 0) / hrvHistory.length).toFixed(1)}
              </div>
            </Card>
          </div>
        </div>
      )}

      <div>
        <div className="text-[#555] text-[11px] tracking-widest uppercase mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>· metrics ·</div>
        <Card className="divide-y divide-[#2a2a2a]">
          {[
            { label: 'SpO2', value: spo2 },
            { label: 'Skin Temp', value: skinTemp },
            { label: 'Score State', value: scoreState },
          ].map(m => (
            <div key={m.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-[#888] text-sm">{m.label}</span>
              <span className="text-[#ededed] text-sm font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{m.value}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="h-4" />
    </div>
  )
}

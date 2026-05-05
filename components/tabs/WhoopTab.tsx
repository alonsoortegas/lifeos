'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Ring from '@/components/ui/Ring'
import Sparkline from '@/components/ui/Sparkline'
import Card from '@/components/ui/Card'
import type { WhoopSnapshot, WhoopWorkout } from '@/lib/types'

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

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

const ZONE_COLORS = ['#1e293b', '#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#ef4444']
const ZONE_LABELS = ['Z0', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5']

export default function WhoopTab() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)
  const [history, setHistory] = useState<WhoopSnapshot[]>([])
  const [workouts, setWorkouts] = useState<WhoopWorkout[]>([])

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
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(14)
      .then(({ data }) => { if (data) setHistory([...(data as WhoopSnapshot[])].reverse()) })

    supabase
      .from('whoop_workouts')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setWorkouts(data as WhoopWorkout[]) })
  }, [])

  const recovery = snap?.recovery_score ?? 0
  const ringColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'

  const recoveryHistory = history.map(h => h.recovery_score ?? 0)
  const hrvHistory = history.map(h => Number(h.hrv_rmssd ?? 0))
  const strainHistory = history.map(h => Number(h.strain ?? 0))
  const caloriesHistory = history.map(h => h.kilojoule != null ? Math.round(h.kilojoule / 4.184) : 0)
  const consistencyHistory = history.map(h => Number(h.sleep_consistency_pct ?? 0))
  const respHistory = history.map(h => Number(h.respiratory_rate ?? 0))

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

  const hasHistory = history.length > 1

  return (
    <div className="px-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-[22px] font-bold text-[#ededed]">Recovery Breakdown</h1>
        <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {recordedDate}{snap?.cycle_id ? ` · CYCLE ${snap.cycle_id}` : ''}
        </div>
      </div>

      {/* Recovery ring + HRV / RHR / Strain */}
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

      {/* Sleep */}
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

      {/* 14-day trends */}
      {hasHistory && (
        <div>
          <div className="text-[#555] text-[11px] tracking-widest uppercase mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>· trends ·</div>

          {/* Row 1: Recovery + HRV */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <SparkCard label="Recovery %" value={`${recoveryHistory[recoveryHistory.length - 1]}`} data={recoveryHistory} color="#00d26a" avgStr={`avg ${Math.round(avg(recoveryHistory))}`} />
            <SparkCard label="HRV ms" value={hrvHistory[hrvHistory.length - 1].toFixed(1)} data={hrvHistory} color="#888" avgStr={`avg ${avg(hrvHistory).toFixed(1)}`} />
          </div>

          {/* Row 2: Strain + Calories */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <SparkCard label="Strain" value={strainHistory[strainHistory.length - 1].toFixed(1)} data={strainHistory} color="#a78bfa" avgStr={`avg ${avg(strainHistory).toFixed(1)}`} />
            <SparkCard
              label="Calories kcal"
              value={caloriesHistory[caloriesHistory.length - 1] > 0 ? String(caloriesHistory[caloriesHistory.length - 1]) : '—'}
              data={caloriesHistory}
              color="#f43f5e"
              avgStr={caloriesHistory.some(v => v > 0) ? `avg ${Math.round(avg(caloriesHistory.filter(v => v > 0)))}` : ''}
            />
          </div>

          {/* Row 3: Sleep Consistency + Respiratory Rate */}
          {(consistencyHistory.some(v => v > 0) || respHistory.some(v => v > 0)) && (
            <div className="grid grid-cols-2 gap-3">
              {consistencyHistory.some(v => v > 0) && (
                <SparkCard label="Consistency %" value={`${consistencyHistory[consistencyHistory.length - 1]}`} data={consistencyHistory} color="#a78bfa" avgStr={`avg ${Math.round(avg(consistencyHistory.filter(v => v > 0)))}`} />
              )}
              {respHistory.some(v => v > 0) && (
                <SparkCard label="Resp Rate" value={`${respHistory[respHistory.length - 1].toFixed(1)}`} data={respHistory} color="#34d399" avgStr={`avg ${avg(respHistory.filter(v => v > 0)).toFixed(1)} brpm`} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
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

      {/* Workouts */}
      {workouts.length > 0 && (
        <div>
          <div className="text-[#555] text-[11px] tracking-widest uppercase mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>· workouts ·</div>
          <div className="space-y-2">
            {workouts.map(w => {
              const zones = [w.zone0_min, w.zone1_min, w.zone2_min, w.zone3_min, w.zone4_min, w.zone5_min]
              const totalMin = zones.reduce((s, z) => s + (z ?? 0), 0)
              const date = new Date(w.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              return (
                <Card key={w.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <span className="text-[#ededed] text-sm font-bold capitalize">{w.sport_name ?? 'workout'}</span>
                    <div className="text-right">
                      <span className="text-[#555] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>{date}</span>
                      {w.strain != null && (
                        <span className="text-[#a78bfa] text-[11px] ml-2 font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                          {w.strain.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  {(w.avg_hr != null || w.max_hr != null) && (
                    <div className="text-[#888] text-[11px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      HR {w.avg_hr != null ? `${w.avg_hr} avg` : '—'}{w.max_hr != null ? ` / ${w.max_hr} max` : ''}
                    </div>
                  )}
                  {totalMin > 1 && (
                    <div className="space-y-1">
                      <div className="flex h-2 rounded overflow-hidden gap-px">
                        {zones.map((z, i) => {
                          const pct = ((z ?? 0) / totalMin) * 100
                          if (pct < 0.5) return null
                          return <div key={i} style={{ width: `${pct}%`, backgroundColor: ZONE_COLORS[i] }} />
                        })}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {zones.map((z, i) => {
                          if (!z || z < 0.5) return null
                          return (
                            <span key={i} className="text-[10px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)', color: ZONE_COLORS[i] === '#1e293b' ? '#555' : ZONE_COLORS[i] }}>
                              {ZONE_LABELS[i]} {z.toFixed(0)}m
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}

function SparkCard({ label, value, data, color, avgStr }: {
  label: string
  value: string
  data: number[]
  color: string
  avgStr: string
}) {
  return (
    <Card className="p-4 space-y-2">
      <div className="text-[#888] uppercase text-[10px] tracking-widest">{label}</div>
      <div className="text-[#ededed] text-xl font-bold" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        {value}
      </div>
      <Sparkline data={data} width={120} height={36} color={color} />
      {avgStr && (
        <div className="text-[#555] text-[10px]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {avgStr}
        </div>
      )}
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
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

const ZONE_COLORS = ['#1e293b', '#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#ef4444']
const ZONE_LABELS = ['Z0', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5']

const WHOOP_CLIENT_ID = 'aeb5a295-3c6a-42a9-9657-57227bb0adb7'
const WHOOP_SCOPES = 'read:recovery read:sleep read:workout read:cycles read:body_measurement'

function whoopAuthUrl(host: string): string {
  const redirectUri = encodeURIComponent(`${host}/api/whoop-callback`)
  const scope = encodeURIComponent(WHOOP_SCOPES)
  return `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${WHOOP_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=lifeos26`
}

// ─── Style constants ──────────────────────────────────────────────────────────
const C = {
  bg: '#0e0e0e', card: '#1a1a1a', border: '#2a2a2a', borderHi: '#3a3a3a',
  text: '#ededed', dim: '#888', faint: '#555', accent: '#00d26a',
}
const mono = 'var(--font-jetbrains-mono, monospace)'
const sans = 'var(--font-inter-tight, sans-serif)'

// ─── Sport color map ─────────────────────────────────────────────────────────
const SPORT_COLORS: Record<string, string> = {
  functional: '#f97316', yoga: '#10b981', running: '#8b5cf6',
  walking: '#6b7280', lifting: '#06b6d4', default: '#a78bfa',
}

function sportColor(name: string | null): string {
  if (!name) return SPORT_COLORS.default
  const key = name.toLowerCase()
  return SPORT_COLORS[key] ?? SPORT_COLORS.default
}

// ─── Primitive components ─────────────────────────────────────────────────────
function MiniStat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{unit}</span>}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.faint, borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function ChartTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
      {right}
    </div>
  )
}

function AxisRow({ first, last }: { first: string; last: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: mono, fontSize: 9, color: C.faint }}>
      <span>{first}</span><span>{last}</span>
    </div>
  )
}

// ─── BigSpark ─────────────────────────────────────────────────────────────────
// Full-width SVG polyline. colorByValue=true: dots colored by zone, dashed threshold lines.
function BigSpark({
  data,
  color = C.accent,
  colorByValue = false,
  height = 80,
}: {
  data: number[]
  color?: string
  colorByValue?: boolean
  height?: number
}) {
  if (data.length < 2) return <div style={{ height }} />

  const W = 320
  const H = height
  const pad = { t: 8, r: 8, b: 8, l: 8 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * iW
    const y = pad.t + (1 - (v - min) / range) * iH
    return [x, y] as [number, number]
  })

  const polylinePoints = pts.map(([x, y]) => `${x},${y}`).join(' ')

  // Fill polygon: close down to bottom corners
  const fillPoints = [
    `${pts[0][0]},${pad.t + iH}`,
    ...pts.map(([x, y]) => `${x},${y}`),
    `${pts[pts.length - 1][0]},${pad.t + iH}`,
  ].join(' ')

  function dotColor(v: number): string {
    if (v >= 67) return '#00d26a'
    if (v >= 34) return '#f59e0b'
    return '#ef4444'
  }

  // Threshold y positions for 34 and 67
  const y34 = pad.t + (1 - (34 - min) / range) * iH
  const y67 = pad.t + (1 - (67 - min) / range) * iH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Fill */}
      <polygon
        points={fillPoints}
        fill={colorByValue ? 'rgba(255,255,255,0.05)' : color}
        fillOpacity={colorByValue ? 1 : 0.08}
      />
      {/* Threshold lines */}
      {colorByValue && min < 67 && max > 34 && (
        <>
          {y34 >= pad.t && y34 <= pad.t + iH && (
            <line x1={pad.l} y1={y34} x2={pad.l + iW} y2={y34} stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
          )}
          {y67 >= pad.t && y67 <= pad.t + iH && (
            <line x1={pad.l} y1={y67} x2={pad.l + iW} y2={y67} stroke="#00d26a" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
          )}
        </>
      )}
      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={colorByValue ? C.dim : color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots */}
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          fill={colorByValue ? dotColor(data[i]) : color}
          stroke={C.card}
          strokeWidth={1}
        />
      ))}
    </svg>
  )
}

// ─── DualSpark ────────────────────────────────────────────────────────────────
// Two polylines, each normalized to its own min/max.
function DualSpark({
  dataA,
  dataB,
  colorA = '#3b82f6',
  colorB = '#f97316',
  height = 80,
}: {
  dataA: number[]
  dataB: number[]
  colorA?: string
  colorB?: string
  height?: number
}) {
  const len = Math.min(dataA.length, dataB.length)
  if (len < 2) return <div style={{ height }} />

  const W = 320
  const H = height
  const pad = { t: 8, r: 8, b: 8, l: 8 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  function normalize(arr: number[]) {
    const mn = Math.min(...arr)
    const mx = Math.max(...arr)
    const rng = mx - mn || 1
    return arr.map((v, i) => {
      const x = pad.l + (i / (arr.length - 1)) * iW
      const y = pad.t + (1 - (v - mn) / rng) * iH
      return [x, y] as [number, number]
    })
  }

  const ptsA = normalize(dataA.slice(0, len))
  const ptsB = normalize(dataB.slice(0, len))

  function toPolyline(pts: [number, number][]) {
    return pts.map(([x, y]) => `${x},${y}`).join(' ')
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <polyline points={toPolyline(ptsA)} fill="none" stroke={colorA} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={toPolyline(ptsB)} fill="none" stroke={colorB} strokeWidth={1.5} strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round" />
      {ptsA.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r={2.5} fill={colorA} stroke={C.card} strokeWidth={1} />
      ))}
      {ptsB.map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r={2.5} fill={colorB} stroke={C.card} strokeWidth={1} />
      ))}
    </svg>
  )
}

// ─── BarChart ─────────────────────────────────────────────────────────────────
function BarChart({
  data,
  color = '#a78bfa',
  height = 80,
  maxVal,
}: {
  data: number[]
  color?: string
  height?: number
  maxVal?: number
}) {
  if (data.length === 0) return <div style={{ height }} />
  const mx = maxVal ?? Math.max(...data, 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height, gap: 2 }}>
      {data.map((v, i) => {
        const pct = Math.min(v / mx, 1) * 100
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(pct, 2)}%`,
              backgroundColor: color,
              borderRadius: '3px 3px 0 0',
              opacity: 0.8,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WhoopTab() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)
  const [history, setHistory] = useState<WhoopSnapshot[]>([])
  const [workouts, setWorkouts] = useState<WhoopWorkout[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  function load() {
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
      .limit(30)
      .then(({ data }) => { if (data) setHistory([...(data as WhoopSnapshot[])].reverse()) })

    supabase
      .from('whoop_workouts')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setWorkouts(data as WhoopWorkout[]) })
  }

  useEffect(() => { load() }, [])

  async function syncNow() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/whoop-sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSyncMsg(`synced · recovery ${data.recovery_score}% · ${data.workouts_synced ?? 0} workouts`)
        load()
      } else {
        setSyncMsg(data.error ?? 'sync failed')
      }
    } catch {
      setSyncMsg('network error')
    } finally {
      setSyncing(false)
    }
  }

  const recovery = snap?.recovery_score ?? 0
  const recoveryColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'

  const tokenAge = snap?.recorded_at
    ? Math.floor((Date.now() - new Date(snap.recorded_at).getTime()) / 60000)
    : null
  const tokenExpired = tokenAge != null && tokenAge > 55

  const hasHistory = history.length > 1

  // Derived history arrays
  const recoveryHistory = history.map(h => h.recovery_score ?? 0)
  const hrvHistory = history.map(h => Number(h.hrv_rmssd ?? 0))
  const rhrHistory = history.map(h => Number(h.rhr ?? 0))
  const strainHistory = history.map(h => Number(h.strain ?? 0))
  const sleepPerfHistory = history.map(h => h.sleep_score ?? 0)

  // Axis labels from history
  function axisDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const axisFirst = history.length > 0 ? axisDate(history[0].recorded_at) : ''
  const axisLast = history.length > 0 ? axisDate(history[history.length - 1].recorded_at) : ''

  // AT A GLANCE values
  const kcal = snap?.kilojoule != null ? String(Math.round(snap.kilojoule / 4.184)) : '—'

  // Sleep stages for stacked bar
  const sleepStages = [
    { name: 'rem', color: '#6366f1', pct: snap?.sleep_rem_pct ?? 0 },
    { name: 'deep', color: '#0ea5e9', pct: snap?.sleep_deep_pct ?? 0 },
    { name: 'light', color: '#5a8a8a', pct: snap?.sleep_light_pct ?? 0 },
    { name: 'awake', color: '#555', pct: snap?.sleep_awake_pct ?? 0 },
  ]

  function stageHours(pct: number | null): string {
    if (!pct || !snap?.sleep_duration_ms) return '0h 0m'
    const ms = snap.sleep_duration_ms * (pct / 100)
    const totalMin = Math.round(ms / 60000)
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
  }

  const hasSleepStages = sleepStages.some(s => s.pct > 0)

  // Most recent workout HR zones
  const latestWorkout = workouts[0] ?? null
  const hrZones = latestWorkout
    ? [
        latestWorkout.zone0_min, latestWorkout.zone1_min, latestWorkout.zone2_min,
        latestWorkout.zone3_min, latestWorkout.zone4_min, latestWorkout.zone5_min,
      ]
    : []

  return (
    <div className="px-4 pb-24 pt-2" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* 1. Header */}
      <h1 style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Whoop</h1>

      {/* 2. Connect / Sync card */}
      <Card className="p-4">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 4 }}>Whoop</div>
            {syncMsg && (
              <div style={{ fontFamily: mono, fontSize: 11, color: C.faint, marginTop: 2 }}>{syncMsg}</div>
            )}
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            style={{
              fontFamily: mono, fontSize: 12, background: C.border, color: C.text,
              border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', opacity: syncing ? 0.4 : 1,
            }}
          >
            {syncing ? 'syncing...' : 'sync now'}
          </button>
        </div>
        {tokenExpired && (
          <a
            href={typeof window !== 'undefined' ? whoopAuthUrl(window.location.origin) : '#'}
            style={{
              display: 'block', textAlign: 'center', background: C.accent, color: C.bg,
              fontFamily: mono, fontSize: 12, fontWeight: 700, borderRadius: 8,
              padding: '8px 0', marginTop: 10, textDecoration: 'none',
            }}
          >
            reconnect whoop →
          </a>
        )}
      </Card>

      {/* 3. AT A GLANCE */}
      <SectionLabel>At a Glance</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <MiniStat label="Recovery" value={snap?.recovery_score != null ? `${snap.recovery_score}` : '—'} unit="%" color={recoveryColor} />
        <MiniStat label="HRV" value={snap?.hrv_rmssd?.toFixed(1) ?? '—'} unit="ms" color="#3b82f6" />
        <MiniStat label="RHR" value={snap?.rhr != null ? String(snap.rhr) : '—'} unit="bpm" color="#f97316" />
        <MiniStat label="Strain" value={snap?.strain?.toFixed(1) ?? '—'} color="#a78bfa" />
        <MiniStat label="Sleep" value={snap?.sleep_score != null ? `${snap.sleep_score}` : '—'} unit="%" color="#06b6d4" />
        <MiniStat label="kcal" value={kcal} color="#f43f5e" />
      </div>

      {/* 4–6. RECOVERY section */}
      <SectionLabel>Recovery</SectionLabel>

      {hasHistory ? (
        <>
          {/* Recovery sparkline */}
          <Card className="p-4">
            <ChartTitle title="Recovery Score" />
            <BigSpark data={recoveryHistory} colorByValue height={80} />
            <AxisRow first={axisFirst} last={axisLast} />
          </Card>

          {/* HRV & RHR dual-line */}
          <Card className="p-4">
            <ChartTitle title="HRV & RHR" />
            <DualSpark dataA={hrvHistory} dataB={rhrHistory} colorA="#3b82f6" colorB="#f97316" height={80} />
            <AxisRow first={axisFirst} last={axisLast} />
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 2, background: '#3b82f6', borderRadius: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>HRV ms</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 0, border: '1px dashed #f97316', borderRadius: 1 }} />
                <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>RHR bpm</span>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <div style={{ fontFamily: mono, fontSize: 11, color: C.faint, padding: '8px 0' }}>
          sync at least 2 days to see charts
        </div>
      )}

      {/* 7–9. SLEEP section */}
      <SectionLabel>Sleep</SectionLabel>

      {/* Last-night sleep stages */}
      <Card className="p-4">
        <ChartTitle
          title="Last Night"
          right={<span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.text }}>{sleepHM(snap?.sleep_duration_ms ?? null)}</span>}
        />
        {hasSleepStages ? (
          <>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
              {sleepStages.map(s => (
                <div key={s.name} style={{ flex: s.pct, background: s.color, minWidth: s.pct > 0 ? 2 : 0 }} />
              ))}
            </div>
            {/* 4-col grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
              {sleepStages.map(s => (
                <div key={s.name} style={{ textAlign: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, margin: '0 auto 4px' }} />
                  <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>{s.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: C.text, marginTop: 2 }}>{stageHours(s.pct)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>sleep stages not available</div>
        )}
      </Card>

      {/* Sleep performance sparkline */}
      {hasHistory && (
        <Card className="p-4">
          <ChartTitle title="Sleep Performance" />
          <BigSpark data={sleepPerfHistory} color="#06b6d4" height={80} />
          <AxisRow first={axisFirst} last={axisLast} />
        </Card>
      )}

      {/* 10–13. STRAIN & ACTIVITY section */}
      <SectionLabel>Strain & Activity</SectionLabel>

      {/* Strain bar chart */}
      {hasHistory && (
        <Card className="p-4">
          <ChartTitle title="Daily Strain" />
          <BarChart data={strainHistory} color="#a78bfa" height={80} maxVal={21} />
          <AxisRow first={axisFirst} last={axisLast} />
        </Card>
      )}

      {/* Recent workouts list */}
      {workouts.length > 0 && (
        <Card className="p-4">
          <ChartTitle title="Recent Workouts" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workouts.slice(0, 5).map(w => {
              const date = new Date(w.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const sc = sportColor(w.sport_name)
              const strainPct = w.strain != null ? Math.min(w.strain / 21, 1) * 100 : 0
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.faint, width: 48, flexShrink: 0 }}>{date}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.text, flex: 1, textTransform: 'capitalize' }}>
                    {w.sport_name ?? 'workout'}
                  </span>
                  {/* Mini strain bar */}
                  <div style={{ width: 60, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${strainPct}%`, height: '100%', background: sc, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 10, color: sc, width: 28, textAlign: 'right' }}>
                    {w.strain != null ? w.strain.toFixed(1) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* HR zones for most recent workout */}
      {latestWorkout && hrZones.some(z => (z ?? 0) > 0) && (
        <Card className="p-4">
          <ChartTitle
            title="HR Zones (latest)"
            right={
              <span style={{ fontFamily: mono, fontSize: 10, color: C.faint, textTransform: 'capitalize' }}>
                {latestWorkout.sport_name ?? 'workout'} · {new Date(latestWorkout.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hrZones.map((z, i) => {
              const val = z ?? 0
              const barPct = Math.min(val / 60, 1) * 100
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: mono, fontSize: 9, color: ZONE_COLORS[i] === '#1e293b' ? C.faint : ZONE_COLORS[i], width: 18 }}>
                    {ZONE_LABELS[i]}
                  </span>
                  <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${barPct}%`, height: '100%',
                        background: ZONE_COLORS[i] === '#1e293b' ? C.borderHi : ZONE_COLORS[i],
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 9, color: C.faint, width: 32, textAlign: 'right' }}>
                    {val > 0 ? `${val.toFixed(0)}m` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* 14–15. PROFILE section */}
      <SectionLabel>Profile</SectionLabel>

      <Card className="p-4">
        <ChartTitle title="Body Stats" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { label: 'Height', value: '180', unit: 'cm' },
            { label: 'Weight', value: '71.3', unit: 'kg' },
            { label: 'Max HR', value: '187', unit: 'bpm' },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{stat.label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: C.text }}>{stat.value}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: C.faint }}>{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}

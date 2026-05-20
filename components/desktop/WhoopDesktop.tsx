'use client'

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { useWhoopData } from '@/lib/whoop-data'
import { sportColor, avg, shortDate } from '@/lib/whoop-utils'

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
)

const C = {
  bg: '#0e0e0e', card: '#1a1a1a', border: '#2a2a2a', borderHi: '#3a3a3a',
  text: '#ededed', dim: '#888', faint: '#555', accent: '#00d26a',
}
const mono = 'var(--font-jetbrains-mono, monospace)'
const sans = 'var(--font-inter-tight, sans-serif)'

ChartJS.defaults.color = C.dim
ChartJS.defaults.borderColor = C.border
ChartJS.defaults.font.family = mono
ChartJS.defaults.font.size = 10

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1a1a',
  borderColor: '#2a2a2a',
  borderWidth: 1,
  titleColor: '#ededed',
  bodyColor: '#888',
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
}

const SCALE_DEFAULTS = {
  grid: { color: 'rgba(255,255,255,0.04)' },
  ticks: { color: C.faint, font: { family: mono, size: 9 } },
}

function lineOpts(overrides: Partial<ChartOptions<'line'>> = {}): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
    scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS } },
    ...overrides,
  } as ChartOptions<'line'>
}

function barOpts(overrides: Partial<ChartOptions<'bar'>> = {}): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
    scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS } },
    ...overrides,
  } as ChartOptions<'bar'>
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{unit}</span>}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: mono, fontSize: 9, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.12em',
      color: C.faint, borderBottom: `1px solid ${C.border}`,
      paddingBottom: 6, marginBottom: 12, marginTop: 4,
    }}>
      {children}
    </div>
  )
}

function ChartCard({ title, children, height = 200, right }: { title: string; children: React.ReactNode; height?: number; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        {right}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 9, color: C.dim }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WhoopDesktop() {
  const { snap, history, workouts, syncing, syncMsg, needsReconnect, loadError, syncNow } = useWhoopData()

  const hasData = history.length > 0
  const workoutsChron = [...workouts].reverse()

  const snapLabels = history.map(h => shortDate(h.recorded_at))
  const workoutLabels = workoutsChron.map(w => `${shortDate(w.started_at)} · ${w.sport_name ?? 'workout'}`)

  const recovery = snap?.recovery_score ?? 0
  const recoveryColor = recovery >= 67 ? '#00d26a' : recovery >= 34 ? '#f59e0b' : '#ef4444'
  const avgRecovery = avg(history.map(h => h.recovery_score))
  const avgHrv = avg(history.map(h => h.hrv_rmssd), 1)
  const avgRhr = avg(history.map(h => h.rhr))
  const avgStrain = avg(history.map(h => h.strain), 1)
  const avgSleep = avg(history.map(h => h.sleep_score))
  const avgKcal = avg(history.map(h => h.kilojoule != null ? Math.round(h.kilojoule / 4.184) : null))

  const sportCounts: Record<string, number> = {}
  workouts.forEach(w => {
    const k = w.sport_name ?? 'unknown'
    sportCounts[k] = (sportCounts[k] ?? 0) + 1
  })
  const sortedSports = Object.entries(sportCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="px-5 pb-6 pt-3" style={{ fontFamily: sans, display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Whoop</h1>
          {hasData && (
            <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>
              {shortDate(history[0].recorded_at)} – {shortDate(history[history.length - 1].recorded_at)} · {history.length} days
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncMsg && (
            <span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>{syncMsg}</span>
          )}
          {needsReconnect ? (
            <a
              href="/api/whoop-auth"
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid #f59e0b`, background: 'rgba(245,158,11,0.08)', color: '#f59e0b', fontFamily: mono, fontSize: 11, textDecoration: 'none' }}
            >
              reconnect whoop →
            </a>
          ) : (
            <button
              onClick={syncNow}
              disabled={syncing}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.borderHi}`, background: 'transparent', color: C.dim, fontFamily: mono, fontSize: 11, cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.5 : 1 }}
            >
              {syncing ? 'syncing…' : 'sync now'}
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{ fontFamily: mono, fontSize: 11, color: '#ef4444', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', marginBottom: 12 }}>
          db error · {loadError}
        </div>
      )}

      {!hasData ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.faint, fontFamily: mono, fontSize: 12 }}>
          No Whoop data yet — connect your Whoop to get started.
          <br />
          <a
            href="/api/whoop-auth"
            style={{ marginTop: 16, display: 'inline-block', padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.accent}`, color: C.accent, fontFamily: mono, fontSize: 11, textDecoration: 'none' }}
          >
            connect whoop →
          </a>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatCard label="Avg Recovery" value={avgRecovery} unit="%" color={recoveryColor} />
            <StatCard label="Avg HRV" value={avgHrv} unit="ms" color="#3b82f6" />
            <StatCard label="Avg RHR" value={avgRhr} unit="bpm" color="#f97316" />
            <StatCard label="Avg Strain" value={avgStrain} color="#a78bfa" />
            <StatCard label="Avg Sleep Perf" value={avgSleep} unit="%" color="#06b6d4" />
            <StatCard label="Avg Daily Calories" value={avgKcal} unit="kcal" color="#f43f5e" />
          </div>

          {/* Recovery */}
          <SectionLabel>Recovery</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

            <ChartCard title="Recovery Score">
              <Line
                data={{
                  labels: snapLabels,
                  datasets: [{
                    label: 'Recovery %',
                    data: history.map(h => h.recovery_score),
                    borderColor: C.dim,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: history.map(h => {
                      const v = h.recovery_score ?? 0
                      return v >= 67 ? '#00d26a' : v >= 34 ? '#f59e0b' : '#ef4444'
                    }),
                    pointBorderColor: C.card,
                    pointBorderWidth: 1,
                    segment: {
                      borderColor: (ctx: { p1DataIndex: number }) => {
                        const v = history[ctx.p1DataIndex]?.recovery_score ?? 0
                        return v >= 67 ? '#00d26a' : v >= 34 ? '#f59e0b' : '#ef4444'
                      },
                    },
                  }],
                }}
                options={lineOpts({
                  scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS, min: 0, max: 100 } },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...TOOLTIP_STYLE,
                      callbacks: {
                        labelColor: (ctx) => {
                          const v = (ctx.parsed.y as number) ?? 0
                          const c = v >= 67 ? '#00d26a' : v >= 34 ? '#f59e0b' : '#ef4444'
                          return { borderColor: c, backgroundColor: c, borderRadius: 4 }
                        },
                      },
                    },
                  },
                })}
              />
            </ChartCard>

            <ChartCard
              title="HRV & Resting Heart Rate"
              right={<div style={{ display: 'flex', gap: 10 }}><LegendDot color="#3b82f6" label="HRV ms" /><LegendDot color="#f97316" label="RHR bpm" /></div>}
            >
              <Line
                data={{
                  labels: snapLabels,
                  datasets: [
                    {
                      label: 'HRV (ms)',
                      data: history.map(h => h.hrv_rmssd),
                      borderColor: '#3b82f6',
                      backgroundColor: 'rgba(59,130,246,0.08)',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 3,
                      pointBackgroundColor: '#3b82f6',
                      pointBorderColor: C.card,
                      pointBorderWidth: 1,
                      yAxisID: 'y',
                    },
                    {
                      label: 'RHR (bpm)',
                      data: history.map(h => h.rhr),
                      borderColor: '#f97316',
                      tension: 0.4,
                      pointRadius: 3,
                      pointBackgroundColor: '#f97316',
                      pointBorderColor: C.card,
                      pointBorderWidth: 1,
                      yAxisID: 'y2',
                    },
                  ],
                }}
                options={lineOpts({
                  plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
                  scales: {
                    x: { ...SCALE_DEFAULTS },
                    y: { ...SCALE_DEFAULTS, position: 'left' },
                    y2: { ...SCALE_DEFAULTS, position: 'right', grid: { drawOnChartArea: false } },
                  },
                })}
              />
            </ChartCard>
          </div>

          {/* Sleep */}
          <SectionLabel>Sleep</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

            <ChartCard title="Sleep Performance">
              <Line
                data={{
                  labels: snapLabels,
                  datasets: [{
                    label: 'Sleep Perf %',
                    data: history.map(h => h.sleep_score),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6,182,212,0.08)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#06b6d4',
                    pointBorderColor: C.card,
                    pointBorderWidth: 1,
                  }],
                }}
                options={lineOpts({ scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS, min: 0, max: 100 } } })}
              />
            </ChartCard>

            <ChartCard
              title="Sleep Consistency & Respiratory Rate"
              right={<div style={{ display: 'flex', gap: 10 }}><LegendDot color="#a78bfa" label="Consistency %" /><LegendDot color="#34d399" label="Resp Rate" /></div>}
            >
              <Line
                data={{
                  labels: snapLabels,
                  datasets: [
                    {
                      label: 'Consistency %',
                      data: history.map(h => h.sleep_consistency_pct),
                      borderColor: '#a78bfa',
                      backgroundColor: 'rgba(167,139,250,0.08)',
                      fill: true,
                      tension: 0.4,
                      pointRadius: 3,
                      pointBackgroundColor: '#a78bfa',
                      pointBorderColor: C.card,
                      pointBorderWidth: 1,
                      yAxisID: 'y',
                    },
                    {
                      label: 'Resp. Rate (brpm)',
                      data: history.map(h => h.respiratory_rate),
                      borderColor: '#34d399',
                      tension: 0.4,
                      pointRadius: 3,
                      pointBackgroundColor: '#34d399',
                      pointBorderColor: C.card,
                      pointBorderWidth: 1,
                      yAxisID: 'y2',
                    },
                  ],
                }}
                options={lineOpts({
                  plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
                  scales: {
                    x: { ...SCALE_DEFAULTS },
                    y: { ...SCALE_DEFAULTS, position: 'left', min: 0, max: 100 },
                    y2: { ...SCALE_DEFAULTS, position: 'right', grid: { drawOnChartArea: false } },
                  },
                })}
              />
            </ChartCard>
          </div>

          <ChartCard
            title="Sleep Stages (hours per night)"
            height={220}
            right={
              <div style={{ display: 'flex', gap: 10 }}>
                <LegendDot color="#6366f1" label="REM" />
                <LegendDot color="#0ea5e9" label="Deep (SWS)" />
                <LegendDot color="#334155" label="Light" />
                <LegendDot color="#374151" label="Awake" />
              </div>
            }
          >
            <Bar
              data={{
                labels: snapLabels,
                datasets: [
                  {
                    label: 'REM',
                    data: history.map(h => h.sleep_duration_ms && h.sleep_rem_pct ? +(h.sleep_duration_ms * h.sleep_rem_pct / 100 / 3600000).toFixed(2) : null),
                    backgroundColor: '#6366f1',
                  },
                  {
                    label: 'Deep (SWS)',
                    data: history.map(h => h.sleep_duration_ms && h.sleep_deep_pct ? +(h.sleep_duration_ms * h.sleep_deep_pct / 100 / 3600000).toFixed(2) : null),
                    backgroundColor: '#0ea5e9',
                  },
                  {
                    label: 'Light',
                    data: history.map(h => h.sleep_duration_ms && h.sleep_light_pct ? +(h.sleep_duration_ms * h.sleep_light_pct / 100 / 3600000).toFixed(2) : null),
                    backgroundColor: '#334155',
                  },
                  {
                    label: 'Awake',
                    data: history.map(h => h.sleep_duration_ms && h.sleep_awake_pct ? +(h.sleep_duration_ms * h.sleep_awake_pct / 100 / 3600000).toFixed(2) : null),
                    backgroundColor: '#374151',
                  },
                ],
              }}
              options={barOpts({
                plugins: {
                  legend: { display: false },
                  tooltip: { ...TOOLTIP_STYLE, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}h` } },
                },
                scales: {
                  x: { ...SCALE_DEFAULTS, stacked: true },
                  y: { ...SCALE_DEFAULTS, stacked: true, title: { display: true, text: 'hours', color: C.faint } },
                },
              })}
            />
          </ChartCard>

          {/* Strain & Activity */}
          <SectionLabel>Strain &amp; Activity</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

            <ChartCard title="Daily Strain">
              <Bar
                data={{
                  labels: snapLabels,
                  datasets: [{
                    label: 'Strain',
                    data: history.map(h => h.strain),
                    backgroundColor: 'rgba(167,139,250,0.7)',
                    borderColor: '#a78bfa',
                    borderWidth: 1,
                    borderRadius: 4,
                  }],
                }}
                options={barOpts({ scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS, min: 0, max: 21 } } })}
              />
            </ChartCard>

            <ChartCard title="Daily Calories Burned (kcal)">
              <Bar
                data={{
                  labels: snapLabels,
                  datasets: [{
                    label: 'kcal',
                    data: history.map(h => h.kilojoule != null ? Math.round(h.kilojoule / 4.184) : null),
                    backgroundColor: 'rgba(244,63,94,0.7)',
                    borderColor: '#f43f5e',
                    borderWidth: 1,
                    borderRadius: 4,
                  }],
                }}
                options={barOpts()}
              />
            </ChartCard>
          </div>

          {workoutsChron.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

                <ChartCard title="Workout Strain by Session">
                  <Bar
                    data={{
                      labels: workoutLabels,
                      datasets: [{
                        label: 'Strain',
                        data: workoutsChron.map(w => w.strain),
                        backgroundColor: workoutsChron.map(w => sportColor(w.sport_name)),
                        borderRadius: 4,
                      }],
                    }}
                    options={barOpts({
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          ...TOOLTIP_STYLE,
                          callbacks: { title: ctx => ctx[0].label.split(' · ')[0], label: ctx => ` strain: ${ctx.parsed.y?.toFixed(1)}` },
                        },
                      },
                    })}
                  />
                </ChartCard>

                <ChartCard
                  title="Avg & Max Heart Rate per Workout"
                  right={<div style={{ display: 'flex', gap: 10 }}><LegendDot color="#fb7185" label="Avg HR" /><LegendDot color="#f43f5e" label="Max HR" /></div>}
                >
                  <Bar
                    data={{
                      labels: workoutLabels,
                      datasets: [
                        {
                          label: 'Avg HR (bpm)',
                          data: workoutsChron.map(w => w.avg_hr),
                          backgroundColor: 'rgba(251,113,133,0.7)',
                          borderColor: '#fb7185',
                          borderWidth: 1,
                          borderRadius: 4,
                        },
                        {
                          label: 'Max HR (bpm)',
                          data: workoutsChron.map(w => w.max_hr),
                          backgroundColor: 'rgba(244,63,94,0.4)',
                          borderColor: '#f43f5e',
                          borderWidth: 1,
                          borderRadius: 4,
                        },
                      ],
                    }}
                    options={barOpts({
                      plugins: {
                        legend: { display: false },
                        tooltip: { ...TOOLTIP_STYLE, callbacks: { title: ctx => ctx[0].label.split(' · ')[0] } },
                      },
                      scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS, min: 40 } },
                    })}
                  />
                </ChartCard>
              </div>

              <ChartCard
                title="Heart Rate Zones per Workout (minutes)"
                height={220}
                right={
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Z0 rest','Z1 warm-up','Z2 easy','Z3 aerobic','Z4 threshold','Z5 max'].map((l, i) => (
                      <LegendDot key={l} color={['#1e293b','#3b82f6','#22c55e','#f59e0b','#f97316','#ef4444'][i]} label={l} />
                    ))}
                  </div>
                }
              >
                <Bar
                  data={{
                    labels: workoutLabels,
                    datasets: [
                      { label: 'Z0 rest',      data: workoutsChron.map(w => w.zone0_min), backgroundColor: '#1e293b' },
                      { label: 'Z1 warm-up',   data: workoutsChron.map(w => w.zone1_min), backgroundColor: '#3b82f6' },
                      { label: 'Z2 easy',      data: workoutsChron.map(w => w.zone2_min), backgroundColor: '#22c55e' },
                      { label: 'Z3 aerobic',   data: workoutsChron.map(w => w.zone3_min), backgroundColor: '#f59e0b' },
                      { label: 'Z4 threshold', data: workoutsChron.map(w => w.zone4_min), backgroundColor: '#f97316' },
                      { label: 'Z5 max',       data: workoutsChron.map(w => w.zone5_min), backgroundColor: '#ef4444' },
                    ],
                  }}
                  options={barOpts({
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        ...TOOLTIP_STYLE,
                        callbacks: {
                          title: ctx => ctx[0].label.split(' · ')[0],
                          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(0)} min`,
                        },
                      },
                    },
                    scales: {
                      x: { ...SCALE_DEFAULTS, stacked: true },
                      y: { ...SCALE_DEFAULTS, stacked: true, title: { display: true, text: 'minutes', color: C.faint } },
                    },
                  })}
                />
              </ChartCard>
            </>
          )}

          {/* Profile */}
          {sortedSports.length > 0 && (
            <>
              <SectionLabel>Profile</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Workouts by Activity
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {sortedSports.map(([sport, count]) => (
                      <li key={sport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontFamily: sans, fontSize: 13 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'capitalize' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sportColor(sport), display: 'inline-block', flexShrink: 0 }} />
                          {sport}
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{count} session{count !== 1 ? 's' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Latest Snapshot
                  </div>
                  {[
                    { label: 'Recovery', value: snap?.recovery_score != null ? `${snap.recovery_score}%` : '—', color: recoveryColor },
                    { label: 'HRV', value: snap?.hrv_rmssd != null ? `${Number(snap.hrv_rmssd).toFixed(1)} ms` : '—', color: '#3b82f6' },
                    { label: 'RHR', value: snap?.rhr != null ? `${snap.rhr} bpm` : '—', color: '#f97316' },
                    { label: 'Sleep', value: snap?.sleep_score != null ? `${snap.sleep_score}%` : '—', color: '#06b6d4' },
                    { label: 'Strain', value: snap?.strain != null ? Number(snap.strain).toFixed(1) : '—', color: '#a78bfa' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{row.label}</span>
                      <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

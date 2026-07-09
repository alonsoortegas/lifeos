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
import { useEffect, useState } from 'react'
import { Line, Bar, Chart as MixedChart } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'
import { useTrends, type TrendsRange } from '@/lib/useTrends'
import { shortDate } from '@/lib/whoop-utils'
import { useThemeColors } from '@/lib/theme-colors'
import type { Chip, Verdict } from '@/lib/trends'
import type { PhaseKind } from '@/lib/types'

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
)

// DOM-context tokens — CSS variables are fine here (helper components below).
// Chart.js paints to <canvas>, where var() does NOT resolve: every color that
// reaches a chart option must be a literal, supplied per-render by
// useThemeColors() inside the component (shadowed C, TOOLTIP_STYLE, opts).
const C = {
  bg: 'var(--bg)', card: 'var(--surface)', border: 'var(--border)', borderHi: 'var(--border-hi)',
  text: 'var(--text)', dim: 'var(--text-dim)', faint: 'var(--text-faint)', accent: '#00d26a',
}
const mono = 'var(--font-jetbrains-mono, monospace)'
const sans = 'var(--font-inter-tight, sans-serif)'

const MINT = '#00d26a', CYAN = '#38bdf8', VIOLET = '#a78bfa', CORAL = '#fb7185', AMBER = '#fbbf24'

const RANGES: TrendsRange[] = ['4w', '12w', '6m', 'all']
const PHASES: PhaseKind[] = ['bulk', 'cut', 'maintenance']

const CHIP_GLYPH: Record<Chip, string> = { up: '↑', flat: '→', down: '↓' }
const CHIP_COLOR: Record<Chip, string> = { up: MINT, flat: AMBER, down: CORAL }
const VERDICT_LABEL: Record<Verdict, string> = { on_track: 'on track', fast: 'too fast', slow: 'too slow' }
const VERDICT_COLOR: Record<Verdict, string> = { on_track: MINT, fast: AMBER, slow: CORAL }

// ─── Primitives (WhoopDesktop conventions) ────────────────────────────────────
function StatCard({ label, value, unit, color, sub }: { label: string; value: string; unit?: string; color: string; sub?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: mono, fontSize: 9, color: C.faint, marginTop: 5 }}>{sub}</div>}
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

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 9, color: C.dim }}>
      {dashed
        ? <span style={{ width: 12, height: 0, borderTop: `2px dashed ${color}`, display: 'inline-block' }} />
        : <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      {label}
    </span>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 11, color: C.faint }}>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrendsDesktop() {
  const { loading, error, range, setRange, metrics, currentPhase, phases, setPhase } = useTrends()
  const theme = useThemeColors()

  const [editorOpen, setEditorOpen] = useState(false)
  const [draftPhase, setDraftPhase] = useState<PhaseKind>('bulk')
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftRate, setDraftRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Canvas-safe chart styling: literal resolved colors for all chart options.
  const C = {
    bg: theme.bg, card: theme.surface, border: theme.border, borderHi: theme.borderHi,
    text: theme.text, dim: theme.dim, faint: theme.faint, accent: '#00d26a',
  }
  const TOOLTIP_STYLE = {
    backgroundColor: theme.surface,
    borderColor: theme.borderHi,
    borderWidth: 1,
    titleColor: theme.text,
    bodyColor: theme.dim,
    titleFont: { family: theme.fontMono, size: 11 },
    bodyFont: { family: theme.fontMono, size: 10 },
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
  }
  const SCALE_DEFAULTS = {
    grid: { color: theme.grid },
    ticks: { color: theme.dim, font: { family: theme.fontMono, size: 9 } },
  }
  const lineOpts = (overrides: Partial<ChartOptions<'line'>> = {}): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
    scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS } },
    ...overrides,
  } as ChartOptions<'line'>)
  const barOpts = (overrides: Partial<ChartOptions<'bar'>> = {}): ChartOptions<'bar'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { ...TOOLTIP_STYLE } },
    scales: { x: { ...SCALE_DEFAULTS }, y: { ...SCALE_DEFAULTS } },
    ...overrides,
  } as ChartOptions<'bar'>)

  useEffect(() => {
    ChartJS.defaults.color = theme.dim
    ChartJS.defaults.borderColor = theme.border
    ChartJS.defaults.font.family = theme.fontMono
    ChartJS.defaults.font.size = 10
  }, [theme])

  async function savePhase() {
    setSaving(true)
    setSaveError(null)
    try {
      const rate = draftRate.trim() === '' ? null : Number(draftRate)
      await setPhase(draftPhase, draftDate, Number.isFinite(rate as number) ? rate : null)
      setEditorOpen(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const body = metrics?.body
  const strength = metrics?.strength
  const engine = metrics?.engine
  const load = metrics?.load

  const phaseWeeks = currentPhase
    ? Math.max(1, Math.round((Date.now() - Date.parse(currentPhase.started_on)) / (7 * 86400000)))
    : null
  const latestWeight = body?.weights.length ? body.weights[body.weights.length - 1].value : null

  // Target trajectory launches at the phase start (first rolling point on/after it),
  // sampled per weigh-in date — nulls before the anchor keep the dashed line from
  // extending into pre-phase history.
  const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000)
  const anchorIdx = body && currentPhase
    ? body.rolling7.findIndex((p) => p.date >= currentPhase.started_on)
    : 0
  const anchor = body?.rolling7[anchorIdx === -1 ? 0 : Math.max(anchorIdx, 0)] ?? body?.rolling7[0] ?? null
  const targetSeries = body && body.targetRate != null && anchor
    ? body.weights.map((p) =>
        day(p.date) < day(anchor.date)
          ? null
          : anchor.value + (body.targetRate! / 7) * (day(p.date) - day(anchor.date)))
    : null

  // Complete-weeks average training minutes for the stat row.
  const avgTrainMin = load && load.weeks.length > 0
    ? Math.round(load.weeks.reduce((s, w) => s + w.trainingMin, 0) / load.weeks.length)
    : null

  return (
    <div className="px-5 pb-6 pt-3" style={{ fontFamily: sans, display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: sans, fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Trends</h1>
          {body && body.weights.length > 0 && (
            <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>
              {shortDate(body.weights[0].date)} – {shortDate(body.weights[body.weights.length - 1].date)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontFamily: mono, fontSize: 11, textTransform: 'uppercase',
                  border: `1px solid ${range === r ? '#00d26a' : C.borderHi}`,
                  background: range === r ? 'rgba(0,210,106,0.08)' : 'transparent',
                  color: range === r ? '#00d26a' : C.dim,
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setDraftPhase(currentPhase?.phase ?? 'bulk'); setEditorOpen((v) => !v) }}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.borderHi}`, background: 'transparent', color: C.dim, fontFamily: mono, fontSize: 11, cursor: 'pointer' }}
          >
            {currentPhase ? 'change phase' : 'set phase'}
          </button>
        </div>
      </div>

      {/* Phase editor */}
      {editorOpen && (
        <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => setDraftPhase(p)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontFamily: mono, fontSize: 11, textTransform: 'uppercase',
                  border: `1px solid ${draftPhase === p ? '#00d26a' : C.borderHi}`,
                  background: draftPhase === p ? 'rgba(0,210,106,0.08)' : 'transparent',
                  color: draftPhase === p ? '#00d26a' : C.dim,
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <label style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: 4 }}>
            start date
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              style={{ fontFamily: mono, fontSize: 12, color: C.text, background: 'transparent', border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: '6px 10px' }}
            />
          </label>
          <label style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: 4 }}>
            target kg/week (blank = default)
            <input
              type="number"
              step="0.05"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              placeholder={draftPhase === 'bulk' ? '+0.25' : draftPhase === 'cut' ? '-0.50' : '±0.15'}
              style={{ fontFamily: mono, fontSize: 12, color: C.text, background: 'transparent', border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: '6px 10px', width: 130 }}
            />
          </label>
          <button
            onClick={() => void savePhase()}
            disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #00d26a', background: 'rgba(0,210,106,0.08)', color: '#00d26a', fontFamily: mono, fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'saving…' : 'save phase'}
          </button>
          {saveError && <span style={{ fontFamily: mono, fontSize: 10, color: CORAL }}>{saveError}</span>}
        </div>
      )}

      {error && (
        <div style={{ fontFamily: mono, fontSize: 11, color: '#ef4444', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', marginBottom: 12 }}>
          db error · {error}
        </div>
      )}

      {!metrics ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.faint, fontFamily: mono, fontSize: 12 }}>
          {loading ? 'loading trends…' : 'no trend data yet'}
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatCard
              label="Phase"
              value={currentPhase ? currentPhase.phase.toUpperCase() : '—'}
              color={currentPhase ? '#00d26a' : C.faint}
              sub={phaseWeeks != null
                ? `week ${phaseWeeks}${body?.sinceStart ? ` · ${body.sinceStart.totalKg >= 0 ? '+' : ''}${body.sinceStart.totalKg} kg since start` : ''}`
                : 'not set'}
            />
            <StatCard
              label="Weight"
              value={latestWeight != null ? latestWeight.toFixed(1) : '—'}
              unit={latestWeight != null ? 'kg' : undefined}
              color="#2dd4bf"
              sub={body!.rolling7.length ? `7d avg ${body!.rolling7[body!.rolling7.length - 1].value.toFixed(1)} kg` : undefined}
            />
            <StatCard
              label="Rate · 21d"
              value={body!.ratePerWeek != null ? `${body!.ratePerWeek >= 0 ? '+' : ''}${body!.ratePerWeek}` : '—'}
              unit={body!.ratePerWeek != null ? 'kg/wk' : undefined}
              color={body!.verdict ? VERDICT_COLOR[body!.verdict] : C.dim}
              sub={body!.verdict
                ? `${VERDICT_LABEL[body!.verdict]}${body!.targetRate != null ? ` · target ${body!.targetRate >= 0 ? '+' : ''}${body!.targetRate}` : ''}${body!.sinceStart?.avgPerWeek != null ? ` · avg ${body!.sinceStart.avgPerWeek >= 0 ? '+' : ''}${body!.sinceStart.avgPerWeek}/wk` : ''}`
                : 'needs ≥5 weigh-ins/21d'}
            />
            <StatCard
              label="Strength"
              value={strength!.strengthChip ? CHIP_GLYPH[strength!.strengthChip] : '—'}
              color={strength!.strengthChip ? CHIP_COLOR[strength!.strengthChip] : C.faint}
              sub="median e1RM slope"
            />
            <StatCard
              label="Volume"
              value={strength!.volumeChip ? CHIP_GLYPH[strength!.volumeChip] : '—'}
              color={strength!.volumeChip ? CHIP_COLOR[strength!.volumeChip] : C.faint}
              sub="3wk tonnage vs prior"
            />
            <StatCard
              label="Training"
              value={avgTrainMin != null ? String(avgTrainMin) : '—'}
              unit={avgTrainMin != null ? 'min/wk' : undefined}
              color={VIOLET}
              sub={load ? `${load.totalTrainingMin} min total` : undefined}
            />
          </div>

          {/* Body */}
          <SectionLabel>Body</SectionLabel>
          <div style={{ marginBottom: 20 }}>
            <ChartCard
              title="Weight"
              height={240}
              right={
                <div style={{ display: 'flex', gap: 10 }}>
                  <LegendDot color={MINT} label="7d avg" />
                  <LegendDot color={theme.faint} label="daily" />
                  {targetSeries && <LegendDot color={AMBER} label="target" dashed />}
                </div>
              }
            >
              {body!.weights.length >= 2 ? (
                <Line
                  data={{
                    labels: body!.weights.map((p) => shortDate(p.date)),
                    datasets: [
                      {
                        label: '7d avg (kg)',
                        data: body!.rolling7.map((p) => p.value),
                        borderColor: MINT,
                        backgroundColor: 'rgba(0,210,106,0.07)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 0,
                        pointHitRadius: 8,
                        borderWidth: 2,
                      },
                      {
                        label: 'daily (kg)',
                        data: body!.weights.map((p) => p.value),
                        borderColor: 'transparent',
                        showLine: false,
                        pointRadius: 3,
                        pointBackgroundColor: theme.faint,
                        pointBorderColor: theme.surface,
                        pointBorderWidth: 1,
                      },
                      ...(targetSeries
                        ? [{
                            label: 'target (kg)',
                            data: targetSeries,
                            borderColor: AMBER,
                            borderDash: [6, 5] as number[],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            pointHitRadius: 0,
                            fill: false,
                          }]
                        : []),
                    ],
                  }}
                  options={lineOpts()}
                />
              ) : <EmptyNote>collecting weigh-ins</EmptyNote>}
            </ChartCard>
          </div>

          {/* Fuel */}
          <SectionLabel>Fuel</SectionLabel>
          {(() => {
            const fuel = metrics.fuel
            const loggedFuel = fuel.days.filter((d) => d.logged)
            if (loggedFuel.length < 2) {
              return (
                <div style={{ marginBottom: 20 }}>
                  <ChartCard title="Fuel" height={100}><EmptyNote>log meals on 2+ days to see fuel trends</EmptyNote></ChartCard>
                </div>
              )
            }
            const eb = fuel.energyBalance
            const labels = loggedFuel.map((d) => shortDate(d.date))
            // Mixed bar+line: Chart.js accepts heterogeneous datasets; the react
            // wrapper's ChartData generic doesn't, hence the cast.
            const kcalData = {
              labels,
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'kcal',
                  data: loggedFuel.map((d) => d.kcal),
                  backgroundColor: loggedFuel.map((d) =>
                    d.kcalTarget && Math.abs(d.kcal - d.kcalTarget) <= 0.1 * d.kcalTarget
                      ? 'rgba(0,210,106,0.55)'
                      : 'rgba(251,191,36,0.55)'),
                  borderRadius: 4,
                  maxBarThickness: 28,
                },
                {
                  type: 'line' as const,
                  label: 'target',
                  data: loggedFuel.map((d) => d.kcalTarget),
                  borderColor: AMBER,
                  borderDash: [6, 5],
                  borderWidth: 1.5,
                  pointRadius: 0,
                  pointHitRadius: 0,
                  fill: false,
                },
              ],
            } as unknown as ChartData<'bar'>
            const proteinData = {
              labels,
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'protein (g)',
                  data: loggedFuel.map((d) => d.protein),
                  backgroundColor: loggedFuel.map((d) =>
                    d.proteinTarget && d.protein >= d.proteinTarget
                      ? 'rgba(0,210,106,0.55)'
                      : 'rgba(251,113,133,0.55)'),
                  borderRadius: 4,
                  maxBarThickness: 28,
                },
                {
                  type: 'line' as const,
                  label: 'target',
                  data: loggedFuel.map((d) => d.proteinTarget),
                  borderColor: AMBER,
                  borderDash: [6, 5],
                  borderWidth: 1.5,
                  pointRadius: 0,
                  pointHitRadius: 0,
                  fill: false,
                },
              ],
            } as unknown as ChartData<'bar'>
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <ChartCard
                    title="Calories vs Target"
                    right={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <LegendDot color={MINT} label="±10%" />
                      <LegendDot color={AMBER} label="off" />
                      <LegendDot color={AMBER} label="target" dashed />
                    </div>}
                  >
                    <MixedChart type="bar" data={kcalData} options={barOpts()} />
                  </ChartCard>
                  <ChartCard
                    title="Protein"
                    right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>
                      {fuel.proteinPerKg != null ? `${fuel.proteinPerKg} g/kg` : ''}
                      {fuel.adherence.proteinHitPct != null ? ` · hit ${fuel.adherence.proteinHitPct}%` : ''}
                    </span>}
                  >
                    <MixedChart type="bar" data={proteinData} options={barOpts()} />
                  </ChartCard>
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', gap: 28, alignItems: 'baseline', fontFamily: mono, fontSize: 11, color: C.dim, flexWrap: 'wrap' }}>
                  <span>
                    21d intake Δ vs target{' '}
                    <span style={{ color: C.text, fontWeight: 700 }}>
                      {eb.avgDeltaVsTarget21d != null ? `${eb.avgDeltaVsTarget21d >= 0 ? '+' : ''}${eb.avgDeltaVsTarget21d} kcal/d` : '—'}
                    </span>
                  </span>
                  <span>
                    scale implies{' '}
                    <span style={{ color: C.text, fontWeight: 700 }}>
                      {eb.scaleImpliedKcalPerDay != null ? `${eb.scaleImpliedKcalPerDay >= 0 ? '+' : ''}${eb.scaleImpliedKcalPerDay} kcal/d` : '—'}
                    </span>{' '}surplus
                  </span>
                  <span style={{ color: C.faint }}>
                    logged {fuel.adherence.loggedDays}/{fuel.adherence.totalDays} days
                    {fuel.adherence.loggedPct != null && ` (${fuel.adherence.loggedPct}%)`}
                    {fuel.adherence.kcalWithin10Pct != null && ` · kcal on target ${fuel.adherence.kcalWithin10Pct}%`}
                  </span>
                </div>
              </>
            )
          })()}

          {/* Strength */}
          <SectionLabel>Strength</SectionLabel>
          {strength!.exercises.length === 0 ? (
            <div style={{ marginBottom: 20 }}>
              <ChartCard title="e1RM" height={120}><EmptyNote>no logged sets in range</EmptyNote></ChartCard>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                {strength!.exercises.map((ex) => {
                  const latest = ex.points[ex.points.length - 1]
                  return (
                    <ChartCard key={ex.exercise} title={ex.exercise} height={140}>
                      {ex.points.length >= 2 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ flex: 1, minHeight: 0 }}>
                            <Line
                              data={{
                                labels: ex.points.map((p) => shortDate(p.date)),
                                datasets: [{
                                  label: 'e1RM (kg)',
                                  data: ex.points.map((p) => p.value),
                                  borderColor: CYAN,
                                  backgroundColor: 'rgba(56,189,248,0.07)',
                                  fill: true,
                                  tension: 0.35,
                                  pointRadius: 3,
                                  pointBackgroundColor: CYAN,
                                  pointBorderColor: theme.surface,
                                  pointBorderWidth: 1,
                                  borderWidth: 2,
                                }],
                              }}
                              options={lineOpts()}
                            />
                          </div>
                          {/* Numbers below the x-axis — keeps the plot area clean */}
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8, borderTop: `1px solid ${theme.grid}`, paddingTop: 7 }}>
                            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                              {latest.value}<span style={{ fontSize: 9, fontWeight: 400, color: C.dim, marginLeft: 4 }}>kg e1RM</span>
                            </span>
                            <span style={{ fontFamily: mono, fontSize: 10, color: ex.slopePctPerWeek != null ? (ex.slopePctPerWeek >= 0 ? MINT : CORAL) : C.faint }}>
                              {ex.slopePctPerWeek != null
                                ? `${ex.slopePctPerWeek >= 0 ? '+' : ''}${ex.slopePctPerWeek}%/wk`
                                : `${ex.points.length}/3 sessions`}
                            </span>
                          </div>
                        </div>
                      ) : <EmptyNote>1 session logged</EmptyNote>}
                    </ChartCard>
                  )
                })}
              </div>
              <div style={{ marginBottom: 20 }}>
                <ChartCard title="Weekly Tonnage" height={180} right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>kg lifted per week</span>}>
                  {strength!.weeklyTonnage.length > 0 ? (
                    <Bar
                      data={{
                        labels: strength!.weeklyTonnage.map((w) => shortDate(w.week)),
                        datasets: [{
                          label: 'tonnage (kg)',
                          data: strength!.weeklyTonnage.map((w) => w.kg),
                          backgroundColor: 'rgba(56,189,248,0.55)',
                          borderColor: CYAN,
                          borderWidth: { top: 2, left: 0, right: 0, bottom: 0 },
                          borderRadius: 4,
                          maxBarThickness: 48,
                        }],
                      }}
                      options={barOpts()}
                    />
                  ) : <EmptyNote>no tonnage in range</EmptyNote>}
                </ChartCard>
              </div>
            </>
          )}

          {/* Engine */}
          <SectionLabel>Engine</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <ChartCard
              title="Run Efficiency"
              right={engine!.efficiencySlopePctPerWeek != null
                ? <span style={{ fontFamily: mono, fontSize: 10, color: engine!.efficiencySlopePctPerWeek >= 0 ? MINT : CORAL }}>
                    {engine!.efficiencySlopePctPerWeek >= 0 ? '+' : ''}{engine!.efficiencySlopePctPerWeek}%/wk
                  </span>
                : <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>{engine!.runs.length}/3 runs</span>}
            >
              {engine!.runs.length >= 2 ? (
                <Line
                  data={{
                    labels: engine!.runs.map((r) => shortDate(r.date)),
                    datasets: [{
                      label: 'm/min per bpm',
                      data: engine!.runs.map((r) => r.efficiency),
                      borderColor: CYAN,
                      backgroundColor: 'rgba(56,189,248,0.07)',
                      fill: true,
                      tension: 0.35,
                      pointRadius: 4,
                      pointBackgroundColor: CYAN,
                      pointBorderColor: theme.surface,
                      pointBorderWidth: 1,
                      borderWidth: 2,
                    }],
                  }}
                  options={lineOpts({
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        ...TOOLTIP_STYLE,
                        callbacks: {
                          label: (ctx) => {
                            const r = engine!.runs[ctx.dataIndex]
                            return ` ${r.efficiency} m/min/bpm · ${r.paceMinPerKm} min/km @ ${r.avgHr} bpm${r.elevationGainM != null ? ` · +${Math.round(r.elevationGainM)}m` : ''}`
                          },
                        },
                      },
                    },
                  })}
                />
              ) : (
                <EmptyNote>
                  {engine!.runs.length === 1
                    ? `1 run: ${engine!.runs[0].paceMinPerKm} min/km @ ${engine!.runs[0].avgHr} bpm — trend appears after 3 runs`
                    : 'no runs with GPS in range'}
                </EmptyNote>
              )}
            </ChartCard>

            <ChartCard title="Run Pace" right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>min/km · lower = faster</span>}>
              {engine!.runs.length >= 2 ? (
                <Line
                  data={{
                    labels: engine!.runs.map((r) => shortDate(r.date)),
                    datasets: [{
                      label: 'pace (min/km)',
                      data: engine!.runs.map((r) => r.paceMinPerKm),
                      borderColor: VIOLET,
                      backgroundColor: 'rgba(167,139,250,0.07)',
                      fill: true,
                      tension: 0.35,
                      pointRadius: 4,
                      pointBackgroundColor: VIOLET,
                      pointBorderColor: theme.surface,
                      pointBorderWidth: 1,
                      borderWidth: 2,
                    }],
                  }}
                  options={lineOpts({
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        ...TOOLTIP_STYLE,
                        callbacks: {
                          label: (ctx) => {
                            const r = engine!.runs[ctx.dataIndex]
                            return ` ${r.paceMinPerKm} min/km @ ${r.avgHr} bpm${r.elevationGainM != null ? ` · +${Math.round(r.elevationGainM)}m` : ''}`
                          },
                        },
                      },
                    },
                  })}
                />
              ) : <EmptyNote>needs 2+ runs with GPS</EmptyNote>}
            </ChartCard>
          </div>

          {/* Load */}
          <SectionLabel>Load</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <ChartCard
              title="Weekly Minutes"
              right={
                <div style={{ display: 'flex', gap: 10 }}>
                  <LegendDot color={MINT} label="training" />
                  <LegendDot color={theme.faint} label="lifestyle" />
                </div>
              }
            >
              {load!.weeks.length > 0 ? (
                <Bar
                  data={{
                    labels: load!.weeks.map((w) => shortDate(w.week)),
                    datasets: [
                      {
                        label: 'training (min)',
                        data: load!.weeks.map((w) => w.trainingMin),
                        backgroundColor: 'rgba(0,210,106,0.55)',
                        borderRadius: 4,
                        maxBarThickness: 40,
                        stack: 'mins',
                      },
                      {
                        label: 'lifestyle (min)',
                        data: load!.weeks.map((w) => w.lifestyleMin),
                        backgroundColor: theme.faint + '66',
                        borderRadius: 4,
                        maxBarThickness: 40,
                        stack: 'mins',
                      },
                    ],
                  }}
                  options={barOpts({
                    scales: {
                      x: { ...SCALE_DEFAULTS, stacked: true },
                      y: { ...SCALE_DEFAULTS, stacked: true },
                    },
                  })}
                />
              ) : <EmptyNote>no workouts in range</EmptyNote>}
            </ChartCard>

            <ChartCard title="Weekly Strain">
              {load!.weeks.length > 0 ? (
                <Bar
                  data={{
                    labels: load!.weeks.map((w) => shortDate(w.week)),
                    datasets: [{
                      label: 'strain',
                      data: load!.weeks.map((w) => w.strain),
                      backgroundColor: 'rgba(167,139,250,0.55)',
                      borderColor: VIOLET,
                      borderWidth: { top: 2, left: 0, right: 0, bottom: 0 },
                      borderRadius: 4,
                      maxBarThickness: 40,
                    }],
                  }}
                  options={barOpts()}
                />
              ) : <EmptyNote>no strain data in range</EmptyNote>}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

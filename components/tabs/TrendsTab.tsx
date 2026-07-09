'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import { ChartTitle, AxisRow, BigSpark, BarChart } from '@/components/ui/charts'
import { useTrends, type TrendsRange } from '@/lib/useTrends'
import type { Chip, DatedValue, Verdict } from '@/lib/trends'
import type { PhaseKind } from '@/lib/types'

const C = {
  card: 'var(--surface)', border: 'var(--border)', text: 'var(--text)',
  dim: 'var(--text-dim)', faint: 'var(--text-faint)',
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

// WhoopTab's section idiom — the page column supplies the vertical rhythm (gap 10).
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.faint, borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginTop: 8 }}>
      {children}
    </div>
  )
}

function StatChip({ label, chip }: { label: string; chip: Chip | null }) {
  const color = chip ? CHIP_COLOR[chip] : C.faint
  return (
    <span style={{ fontFamily: mono, fontSize: 10, color, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 10px' }}>
      {label} {chip ? CHIP_GLYPH[chip] : '·'}
    </span>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: mono, fontSize: 11, color: C.faint, padding: '8px 0' }}>{children}</div>
}

// ─── WeightChart ──────────────────────────────────────────────────────────────
// Daily weigh-in dots + 7d rolling line, a dashed target trajectory anchored at
// the first rolling point, and vertical markers at phase-change dates.
function WeightChart({
  weights, rolling, targetRate, targetAnchorDate, phaseMarkers, height = 80,
}: {
  weights: DatedValue[]
  rolling: DatedValue[]
  targetRate: number | null
  /** Phase start — the dashed target line launches here (falls back to the range start). */
  targetAnchorDate?: string | null
  phaseMarkers: string[]
  height?: number
}) {
  if (weights.length < 2) return <div style={{ height }} />

  const W = 320
  const H = height
  const pad = { t: 10, r: 8, b: 8, l: 8 }
  const iW = W - pad.l - pad.r
  const iH = H - pad.t - pad.b

  const day = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000)
  const d0 = day(weights[0].date)
  const d1 = day(weights[weights.length - 1].date)
  const dSpan = Math.max(d1 - d0, 1)

  // Target trajectory: launches at the phase start (first rolling point on/after
  // it), slope targetRate kg/week — the path you committed to when setting the phase.
  const anchorIdx = targetAnchorDate ? rolling.findIndex((p) => p.date >= targetAnchorDate) : 0
  const anchor = rolling[anchorIdx === -1 ? 0 : Math.max(anchorIdx, 0)] ?? rolling[0]
  const target = targetRate != null && anchor
    ? {
        from: { d: day(anchor.date), v: anchor.value },
        to: { d: d1, v: anchor.value + (targetRate / 7) * (d1 - day(anchor.date)) },
      }
    : null

  const allValues = [
    ...weights.map((p) => p.value),
    ...rolling.map((p) => p.value),
    ...(target ? [target.from.v, target.to.v] : []),
  ]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1

  const x = (d: number) => pad.l + ((d - d0) / dSpan) * iW
  const y = (v: number) => pad.t + (1 - (v - min) / range) * iH
  const line = (pts: DatedValue[]) => pts.map((p) => `${x(day(p.date))},${y(p.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
      {phaseMarkers.map((d) => {
        const dn = day(d)
        if (dn < d0 || dn > d1) return null
        return <line key={d} x1={x(dn)} y1={pad.t} x2={x(dn)} y2={pad.t + iH} style={{ stroke: 'var(--border-hi)' }} strokeWidth={1} strokeDasharray="2 3" />
      })}
      {target && (
        <line
          x1={x(target.from.d)} y1={y(target.from.v)} x2={x(target.to.d)} y2={y(target.to.v)}
          stroke={AMBER} strokeWidth={1} strokeDasharray="5 4" opacity={0.7}
        />
      )}
      {weights.map((p) => (
        <circle key={p.date} cx={x(day(p.date))} cy={y(p.value)} r={2.5} style={{ fill: 'var(--text-faint)' }} opacity={0.6} />
      ))}
      <polyline points={line(rolling)} fill="none" stroke={MINT} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ChartKey({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {item.dashed
            ? <div style={{ width: 20, height: 0, border: `1px dashed ${item.color}`, borderRadius: 1 }} />
            : <div style={{ width: 20, height: 2, background: item.color, borderRadius: 1 }} />}
          <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function TrendsTab() {
  const { loading, error, range, setRange, metrics, currentPhase, phases, setPhase } = useTrends()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftPhase, setDraftPhase] = useState<PhaseKind>('bulk')
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftRate, setDraftRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function savePhase() {
    setSaving(true)
    setSaveError(null)
    try {
      const rate = draftRate.trim() === '' ? null : Number(draftRate)
      await setPhase(draftPhase, draftDate, Number.isFinite(rate as number) ? rate : null)
      setSheetOpen(false)
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

  const periodLabel = body && body.weights.length > 0
    ? `${body.weights[0].date} – ${body.weights[body.weights.length - 1].date}`
    : null
  const axisFirst = body?.weights[0]?.date ?? ''
  const axisLast = body?.weights[body.weights.length - 1]?.date ?? ''

  return (
    <div className="px-4 pb-32 pt-2" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* DB error */}
      {error && (
        <div style={{ fontFamily: mono, fontSize: 11, color: '#ef4444', padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
          db error · {error}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: sans, fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Trends</h1>
        {periodLabel && (
          <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>{periodLabel}</span>
        )}
      </div>

      {/* Range selector */}
      <div style={{ display: 'flex', gap: 6 }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="active:scale-[0.95]"
            style={{
              flex: 1, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
              padding: '7px 0', borderRadius: 999,
              border: `1px solid ${range === r ? MINT : C.border}`,
              color: range === r ? MINT : C.dim,
              background: range === r ? 'rgba(0,210,106,0.08)' : 'transparent',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Phase header */}
      <Card className="p-4">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 17, fontWeight: 700, color: C.text, textTransform: 'uppercase' }}>
              {currentPhase ? currentPhase.phase : 'no phase set'}
              {phaseWeeks != null && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginLeft: 8 }}>week {phaseWeeks}</span>}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
              {body?.ratePerWeek != null
                ? <>
                    {body.ratePerWeek >= 0 ? '+' : ''}{body.ratePerWeek} kg/wk <span style={{ color: C.faint }}>(21d)</span>
                    {body.targetRate != null && <span style={{ color: C.faint }}> · target {body.targetRate >= 0 ? '+' : ''}{body.targetRate}</span>}
                    {body.verdict && <span style={{ color: VERDICT_COLOR[body.verdict], marginLeft: 6 }}>{VERDICT_LABEL[body.verdict]}</span>}
                  </>
                : 'need more weigh-ins for a rate'}
            </div>
            {body?.sinceStart && (
              <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, marginTop: 3 }}>
                {body.sinceStart.totalKg >= 0 ? '+' : ''}{body.sinceStart.totalKg} kg since start
                {body.sinceStart.avgPerWeek != null && ` · avg ${body.sinceStart.avgPerWeek >= 0 ? '+' : ''}${body.sinceStart.avgPerWeek}/wk`}
              </div>
            )}
          </div>
          <button
            onClick={() => { setDraftPhase(currentPhase?.phase ?? 'bulk'); setSheetOpen(true) }}
            className="active:scale-[0.95]"
            style={{ fontFamily: mono, fontSize: 10, color: CYAN, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 12px' }}
          >
            {currentPhase ? 'change' : 'set phase'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <StatChip label="strength" chip={strength?.strengthChip ?? null} />
          <StatChip label="volume" chip={strength?.volumeChip ?? null} />
        </div>
      </Card>

      {loading && !metrics && <EmptyNote>loading trends…</EmptyNote>}

      {metrics && (
        <>
          {/* Body */}
          <SectionLabel>Body</SectionLabel>
          <Card className="p-4">
            <ChartTitle
              title="Weight · 7d avg"
              right={body!.weights.length > 0
                ? <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.text }}>{body!.weights[body!.weights.length - 1].value.toFixed(1)} kg</span>
                : undefined}
            />
            {body!.weights.length >= 2 ? (
              <>
                <WeightChart
                  weights={body!.weights}
                  rolling={body!.rolling7}
                  targetRate={body!.targetRate}
                  targetAnchorDate={currentPhase?.started_on ?? null}
                  phaseMarkers={phases.map((p) => p.started_on)}
                  height={80}
                />
                <AxisRow first={axisFirst} last={axisLast} />
                <ChartKey items={[
                  { label: '7d avg', color: MINT },
                  { label: 'daily', color: 'var(--text-faint)' },
                  ...(body!.targetRate != null ? [{ label: 'target', color: AMBER, dashed: true }] : []),
                ]} />
              </>
            ) : <EmptyNote>collecting weigh-ins</EmptyNote>}
          </Card>

          {/* Fuel */}
          <SectionLabel>Fuel</SectionLabel>
          {(() => {
            const fuel = metrics.fuel
            const loggedFuel = fuel.days.filter((d) => d.logged)
            if (loggedFuel.length < 2) {
              return <EmptyNote>log meals on 2+ days to see fuel trends</EmptyNote>
            }
            const eb = fuel.energyBalance
            return (
              <>
                <Card className="p-4">
                  <ChartTitle
                    title="Calories vs Target"
                    right={eb.avgKcal21d != null
                      ? <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>21d avg {eb.avgKcal21d} kcal</span>
                      : undefined}
                  />
                  <BarChart
                    data={loggedFuel.map((d) => d.kcal)}
                    colors={loggedFuel.map((d) =>
                      d.kcalTarget && Math.abs(d.kcal - d.kcalTarget) <= 0.1 * d.kcalTarget ? MINT : AMBER)}
                    height={80}
                  />
                  <AxisRow first={loggedFuel[0].date} last={loggedFuel[loggedFuel.length - 1].date} />
                  <ChartKey items={[{ label: 'within ±10%', color: MINT }, { label: 'off target', color: AMBER }]} />
                </Card>
                <Card className="p-4">
                  <ChartTitle
                    title="Protein"
                    right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>
                      {fuel.proteinPerKg != null ? `${fuel.proteinPerKg} g/kg · ` : ''}
                      {fuel.adherence.proteinHitPct != null ? `hit ${fuel.adherence.proteinHitPct}%` : ''}
                    </span>}
                  />
                  <BarChart
                    data={loggedFuel.map((d) => d.protein)}
                    colors={loggedFuel.map((d) =>
                      d.proteinTarget && d.protein >= d.proteinTarget ? MINT : CORAL)}
                    height={80}
                  />
                  <AxisRow first={loggedFuel[0].date} last={loggedFuel[loggedFuel.length - 1].date} />
                  <ChartKey items={[{ label: 'target hit', color: MINT }, { label: 'under', color: CORAL }]} />
                </Card>
                <Card className="p-4">
                  <ChartTitle title="Energy Balance · 21d" />
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div>
                      intake Δ vs target{' '}
                      <span style={{ color: C.text, fontWeight: 700 }}>
                        {eb.avgDeltaVsTarget21d != null ? `${eb.avgDeltaVsTarget21d >= 0 ? '+' : ''}${eb.avgDeltaVsTarget21d} kcal/d` : '—'}
                      </span>
                    </div>
                    <div>
                      scale implies{' '}
                      <span style={{ color: C.text, fontWeight: 700 }}>
                        {eb.scaleImpliedKcalPerDay != null ? `${eb.scaleImpliedKcalPerDay >= 0 ? '+' : ''}${eb.scaleImpliedKcalPerDay} kcal/d` : '—'}
                      </span>
                      <span style={{ color: C.faint }}> surplus</span>
                    </div>
                    <div style={{ color: C.faint, fontSize: 10 }}>
                      logged {fuel.adherence.loggedDays}/{fuel.adherence.totalDays} days
                      {fuel.adherence.loggedPct != null && ` (${fuel.adherence.loggedPct}%)`}
                      {fuel.adherence.kcalWithin10Pct != null && ` · kcal on target ${fuel.adherence.kcalWithin10Pct}%`}
                    </div>
                  </div>
                </Card>
              </>
            )
          })()}

          {/* Strength */}
          <SectionLabel>Strength</SectionLabel>
          {strength!.exercises.length === 0 ? (
            <EmptyNote>no logged sets in range</EmptyNote>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {strength!.exercises.map((ex) => {
                  const up = (ex.slopePctPerWeek ?? 0) >= 0
                  const color = ex.slopePctPerWeek == null ? CYAN : up ? MINT : CORAL
                  const latest = ex.points[ex.points.length - 1]
                  return (
                    <Card key={ex.exercise} className="p-3">
                      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ex.exercise}
                      </div>
                      {ex.points.length >= 2
                        ? <BigSpark data={ex.points.map((p) => p.value)} color={color} height={40} />
                        : <div style={{ height: 40 }} />}
                      {/* Numbers live below the chart — keeps the plot area clean */}
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6, borderTop: `1px solid var(--ink-06)`, paddingTop: 6 }}>
                        <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                          {latest.value}<span style={{ fontSize: 8, fontWeight: 400, color: C.dim, marginLeft: 3 }}>kg e1RM</span>
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 9, color: ex.slopePctPerWeek != null ? color : C.faint }}>
                          {ex.slopePctPerWeek != null
                            ? `${ex.slopePctPerWeek >= 0 ? '+' : ''}${ex.slopePctPerWeek}%/wk`
                            : `${ex.points.length}/3`}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
              <Card className="p-4">
                <ChartTitle
                  title="Weekly Tonnage"
                  right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>kg lifted</span>}
                />
                {strength!.weeklyTonnage.length > 0 ? (
                  <>
                    <BarChart data={strength!.weeklyTonnage.map((w) => w.kg)} color={CYAN} height={80} />
                    <AxisRow first={strength!.weeklyTonnage[0].week} last={strength!.weeklyTonnage[strength!.weeklyTonnage.length - 1].week} />
                  </>
                ) : <EmptyNote>no tonnage in range</EmptyNote>}
              </Card>
            </>
          )}

          {/* Engine */}
          <SectionLabel>Engine</SectionLabel>
          <Card className="p-4">
            <ChartTitle
              title="Run Efficiency"
              right={engine!.efficiencySlopePctPerWeek != null
                ? <span style={{ fontFamily: mono, fontSize: 10, color: engine!.efficiencySlopePctPerWeek >= 0 ? MINT : CORAL }}>
                    {engine!.efficiencySlopePctPerWeek >= 0 ? '+' : ''}{engine!.efficiencySlopePctPerWeek}%/wk
                  </span>
                : <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>{engine!.runs.length}/3 runs</span>}
            />
            {engine!.runs.length >= 2 ? (
              <>
                <BigSpark data={engine!.runs.map((r) => r.efficiency)} color={CYAN} height={80} />
                <AxisRow first={engine!.runs[0].date} last={engine!.runs[engine!.runs.length - 1].date} />
              </>
            ) : engine!.runs.length === 1 ? (
              <EmptyNote>
                1 run: {engine!.runs[0].paceMinPerKm} min/km @ {engine!.runs[0].avgHr} bpm
                {engine!.runs[0].elevationGainM != null && ` · +${Math.round(engine!.runs[0].elevationGainM)}m`}
                {' — trend appears after 3 runs'}
              </EmptyNote>
            ) : <EmptyNote>no runs with GPS in range</EmptyNote>}
          </Card>
          <Card className="p-4">
            <ChartTitle
              title="Run Pace"
              right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>min/km · lower = faster</span>}
            />
            {engine!.runs.length >= 2 ? (
              <>
                <BigSpark data={engine!.runs.map((r) => r.paceMinPerKm)} color={VIOLET} height={80} />
                <AxisRow first={engine!.runs[0].date} last={engine!.runs[engine!.runs.length - 1].date} />
              </>
            ) : <EmptyNote>needs 2+ runs with GPS</EmptyNote>}
          </Card>

          {/* Load */}
          <SectionLabel>Load</SectionLabel>
          <Card className="p-4">
            <ChartTitle
              title="Weekly Training Minutes"
              right={<span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>
                {load!.totalTrainingMin} train · {load!.totalLifestyleMin} life
              </span>}
            />
            {load!.weeks.length > 0 ? (
              <>
                <BarChart data={load!.weeks.map((w) => w.trainingMin)} color={MINT} height={80} />
                <AxisRow first={load!.weeks[0].week} last={load!.weeks[load!.weeks.length - 1].week} />
              </>
            ) : <EmptyNote>no workouts in range</EmptyNote>}
          </Card>
          <Card className="p-4">
            <ChartTitle title="Weekly Strain" />
            {load!.weeks.length > 0 ? (
              <>
                <BarChart data={load!.weeks.map((w) => w.strain)} color={VIOLET} height={80} />
                <AxisRow first={load!.weeks[0].week} last={load!.weeks[load!.weeks.length - 1].week} />
              </>
            ) : <EmptyNote>no strain data in range</EmptyNote>}
          </Card>
        </>
      )}

      {/* Phase sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: 'var(--scrim)' }}
          onClick={() => !saving && setSheetOpen(false)}
        >
          <div
            className="sheet glass-thick fixed bottom-0 left-0 right-0 rounded-t-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Set training phase</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraftPhase(p)}
                  className="active:scale-[0.95]"
                  style={{
                    flex: 1, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
                    padding: '9px 0', borderRadius: 12,
                    border: `1px solid ${draftPhase === p ? MINT : C.border}`,
                    color: draftPhase === p ? MINT : C.dim,
                    background: draftPhase === p ? 'rgba(0,210,106,0.08)' : 'transparent',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              start date
            </label>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              style={{ width: '100%', fontFamily: mono, fontSize: 13, color: C.text, background: 'var(--surface-2)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 12px', marginBottom: 12 }}
            />
            <label style={{ display: 'block', fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              target kg/week (blank = default)
            </label>
            <input
              type="number"
              step="0.05"
              inputMode="decimal"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              placeholder={draftPhase === 'bulk' ? '+0.25' : draftPhase === 'cut' ? '-0.50' : '±0.15 band'}
              style={{ width: '100%', fontFamily: mono, fontSize: 13, color: C.text, background: 'var(--surface-2)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 12px', marginBottom: 14 }}
            />
            {saveError && <div style={{ fontFamily: mono, fontSize: 10, color: CORAL, marginBottom: 10 }}>{saveError}</div>}
            <button
              onClick={() => void savePhase()}
              disabled={saving}
              className="active:scale-[0.97]"
              style={{ width: '100%', fontFamily: mono, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#08130c', background: MINT, borderRadius: 14, padding: '12px 0', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'saving…' : 'save phase'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

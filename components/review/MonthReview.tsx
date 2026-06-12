'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCurrentGoalDate } from '@/lib/goal-dates'
import type { ChannelState, DayScore, MonthSummary } from '@/lib/review/month'

const CHANNELS: Array<{ key: 'goals' | 'training' | 'fuel'; label: string; color: string }> = [
  { key: 'goals', label: 'Goals', color: '#00d26a' },
  { key: 'training', label: 'Training', color: '#a78bfa' },
  { key: 'fuel', label: 'Fuel', color: '#38bdf8' },
]

const STATE_OPACITY: Record<ChannelState, number> = { on: 1, partial: 0.45, off: 0.18, none: 0 }
const OFF_COLOR = '#fb7185'

const READINESS_COLOR: Record<string, string> = {
  green: '#00d26a',
  controlled: '#fbbf24',
  recover: '#fb7185',
  hardNo: '#fb7185',
}

interface MonthPayload {
  month: string
  today: string
  days: DayScore[]
  summary: MonthSummary
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function shiftMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T12:00:00`)
  date.setMonth(date.getMonth() + delta)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function channelBar(state: ChannelState, color: string) {
  const off = state === 'off'
  return (
    <div
      className="h-[3px] w-full rounded-full"
      style={{
        background: off ? OFF_COLOR : color,
        opacity: off ? 0.55 : STATE_OPACITY[state],
      }}
    />
  )
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-faint)]">{label} </span>
      <span className="font-mono text-[11px] font-bold text-[var(--text)]">{value}</span>
    </div>
  )
}

function DaySheet({ day, onClose }: { day: DayScore; onClose: () => void }) {
  const date = new Date(`${day.date}T12:00:00`)
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'var(--scrim)' }} />
      <div
        className="panel relative z-10 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="display text-[16px] font-bold text-[var(--text)]">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-dim)]">
            Close
          </button>
        </div>

        {day.detail.briefHeadline && (
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--ink-02)] p-3">
            <div className="text-[12px] font-medium text-[var(--text)]">{day.detail.briefHeadline}</div>
            {day.detail.trainingVerdict && (
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                verdict: {day.detail.trainingVerdict}
                {day.detail.adherence ? ` · actual: ${day.detail.adherence}` : ''}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: CHANNELS[0].color }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">Goals</span>
            </div>
            {day.detail.todos.length ? (
              <ul className="space-y-1">
                {day.detail.todos.map((todo, i) => (
                  <li key={i} className={`text-[12px] ${todo.done ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text)]'}`}>
                    {todo.done ? '✓ ' : '· '}{todo.text}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[11px] text-[var(--text-faint)]">No goals set</div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: CHANNELS[1].color }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">Training</span>
            </div>
            <div className="font-mono text-[12px] text-[var(--text)]">
              {day.detail.setsLogged > 0
                ? `${day.detail.setsLogged} sets logged${day.detail.avgRpe != null ? ` · avg RPE ${day.detail.avgRpe}` : ''}`
                : 'No sets logged'}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: CHANNELS[2].color }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">Fuel</span>
            </div>
            {day.detail.consumed && day.detail.targets ? (
              <div className="font-mono text-[12px] text-[var(--text)]">
                {Math.round(day.detail.consumed.calories)} / {day.detail.targets.calories} kcal
                {' · '}
                {Math.round(day.detail.consumed.protein_g)} / {day.detail.targets.protein_g} g protein
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-faint)]">No nutrition logged</div>
            )}
          </div>

          {day.recovery != null && (
            <div className="font-mono text-[11px] text-[var(--text-faint)]">
              Recovery {day.recovery}%{day.readiness_state ? ` · readiness ${day.readiness_state}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MonthReview({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState(() => getCurrentGoalDate().slice(0, 7))
  const [data, setData] = useState<MonthPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedDay, setSelectedDay] = useState<DayScore | null>(null)

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch(`/api/review/month?month=${target}`)
      if (!response.ok) throw new Error('failed')
      setData(await response.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred: avoids a synchronous setState inside the effect.
    const id = window.setTimeout(() => { void load(month) }, 0)
    return () => window.clearTimeout(id)
  }, [month, load])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setMonth(m => shiftMonth(m, -1))
      if (e.key === 'ArrowRight') setMonth(m => shiftMonth(m, 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Monday-first column offset for the 1st of the month.
  const firstDow = data ? new Date(`${data.month}-01T12:00:00`).getDay() : 1
  const leadingBlanks = (firstDow + 6) % 7
  const summary = data?.summary

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--scrim)', backdropFilter: 'blur(8px)' }}>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-16">
        <div className="boot space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="display text-[22px] font-bold tracking-tight text-[var(--text)]">Monthly review</div>
            <button type="button" onClick={onClose} aria-label="Close monthly review" className="rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-dim)]">
              Close
            </button>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month" className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-dim)]">
              ‹
            </button>
            <div className="display text-[15px] font-semibold text-[var(--text)]">{monthLabel(month)}</div>
            <button type="button" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Next month" className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-dim)]">
              ›
            </button>
          </div>

          {/* Summary chips */}
          {summary && (
            <div className="flex flex-wrap gap-2">
              {summary.goalsOnPct != null && <SummaryChip label="goals" value={`${summary.goalsOnPct}%`} />}
              {summary.trainingOnPct != null && <SummaryChip label="training" value={`${summary.trainingOnPct}%`} />}
              {summary.fuelOnPct != null && <SummaryChip label="fuel" value={`${summary.fuelOnPct}%`} />}
              <SummaryChip label="streak" value={`${summary.currentStreak}d · best ${summary.bestStreak}d`} />
              {summary.avgRecovery != null && (
                <SummaryChip
                  label="recovery"
                  value={`${summary.avgRecovery}%${summary.prevAvgRecovery != null ? ` (${summary.avgRecovery - summary.prevAvgRecovery >= 0 ? '+' : ''}${summary.avgRecovery - summary.prevAvgRecovery} vs prev)` : ''}`}
                />
              )}
            </div>
          )}

          {/* Grid */}
          <div className="panel rounded-2xl p-4">
            {loading && <div className="py-10 text-center text-[12px] text-[var(--text-faint)]">Loading month…</div>}
            {error && (
              <div className="py-10 text-center text-[12px] text-[var(--text-dim)]">
                Could not load this month.{' '}
                <button type="button" onClick={() => void load(month)} className="font-bold text-[#00d26a]">Retry</button>
              </div>
            )}
            {!loading && !error && data && (
              <>
                <div className="mb-2 grid grid-cols-7 gap-1.5">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-center font-mono text-[9px] uppercase text-[var(--text-faint)]">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
                  {data.days.map(day => {
                    const isToday = day.date === data.today
                    const future = day.date > data.today
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => !future && setSelectedDay(day)}
                        aria-label={`Details for ${day.date}`}
                        disabled={future}
                        className="flex flex-col gap-1 rounded-lg border p-1.5 transition-transform active:scale-95 disabled:opacity-30"
                        style={{
                          borderColor: isToday ? '#00d26a' : 'var(--border)',
                          background: 'var(--ink-02)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-[var(--text-faint)]">{Number(day.date.slice(8, 10))}</span>
                          {day.readiness_state && (
                            <span
                              className="h-1 w-1 rounded-full"
                              style={{ background: READINESS_COLOR[day.readiness_state] ?? 'var(--text-faint)' }}
                            />
                          )}
                        </div>
                        <div className="space-y-[3px]">
                          {CHANNELS.map(channel => (
                            <div key={channel.key}>{channelBar(day[channel.key], channel.color)}</div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {CHANNELS.map(channel => (
                    <span key={channel.key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                      <span className="h-[3px] w-3 rounded-full" style={{ background: channel.color }} />
                      {channel.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                    <span className="h-[3px] w-3 rounded-full" style={{ background: OFF_COLOR, opacity: 0.55 }} />
                    Slipped
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedDay && <DaySheet day={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  )
}

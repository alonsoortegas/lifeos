'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCurrentGoalDate } from '@/lib/goal-dates'
import type { ChannelState, DayScore, MonthSummary } from '@/lib/review/month'

const CHANNELS: Array<{ key: 'goals' | 'training' | 'fuel'; label: string; color: string }> = [
  { key: 'goals', label: 'Goals', color: '#00d26a' },
  { key: 'training', label: 'Training', color: '#a78bfa' },
  { key: 'fuel', label: 'Fuel', color: '#38bdf8' },
]

const OFF_COLOR = '#fb7185'
const WEEKDAYS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
]

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

/** Channel state on a visible track — states are structural, not opacity-only:
 *  on = full bar · partial = half bar · off = coral bar · none = empty track. */
function ChannelBar({ state, color }: { state: ChannelState; color: string }) {
  const width = state === 'partial' ? '50%' : state === 'none' ? '0%' : '100%'
  const fill = state === 'off' ? OFF_COLOR : color
  return (
    <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--ink-06)]">
      <div
        className="h-full rounded-full"
        style={{ width, background: fill, opacity: state === 'off' ? 0.7 : 1 }}
      />
    </div>
  )
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-1">
      <span className="font-mono text-[13px] font-bold tabular-nums text-[var(--text)]">{value}</span>
      <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
        {label}{sub ? <span className="normal-case tracking-normal"> {sub}</span> : null}
      </span>
    </div>
  )
}

function DaySheet({ day, onClose }: { day: DayScore; onClose: () => void }) {
  const date = new Date(`${day.date}T12:00:00`)
  const channelState = { goals: day.goals, training: day.training, fuel: day.fuel }
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        className="absolute inset-0"
        style={{ background: 'var(--scrim)', backdropFilter: 'blur(12px) saturate(140%)', WebkitBackdropFilter: 'blur(12px) saturate(140%)' }}
      />
      <div
        className="glass-thick sheet relative z-10 max-h-[82vh] w-full max-w-md overflow-y-auto rounded-t-3xl px-5 pb-6 pt-2.5 sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Grabber */}
        <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-[var(--ink-08)] sm:hidden" aria-hidden="true" />

        <div className="mb-4 flex items-center justify-between">
          <div className="display text-[17px] font-bold tracking-tight text-[var(--text)]">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close day details"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink-06)] text-[13px] leading-none text-[var(--text-dim)] transition-transform active:scale-[0.92]"
          >
            ✕
          </button>
        </div>

        {day.detail.briefHeadline && (
          <div className="mb-4 rounded-2xl bg-[var(--ink-04)] p-3.5">
            <div className="text-[13px] font-medium leading-snug text-[var(--text)]">{day.detail.briefHeadline}</div>
            {day.detail.trainingVerdict && (
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                verdict: {day.detail.trainingVerdict}
                {day.detail.adherence ? ` · actual: ${day.detail.adherence}` : ''}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {CHANNELS.map((channel, index) => (
            <div key={channel.key} className={index > 0 ? 'border-t border-[var(--ink-06)] pt-4' : undefined}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">
                  {channel.label}
                </span>
                <div className="w-12">
                  <ChannelBar state={channelState[channel.key]} color={channel.color} />
                </div>
              </div>

              {channel.key === 'goals' && (
                day.detail.todos.length ? (
                  <ul className="space-y-1.5">
                    {day.detail.todos.map((todo, i) => (
                      <li key={i} className={`text-[13px] leading-snug ${todo.done ? 'text-[var(--text-dim)] line-through' : 'text-[var(--text)]'}`}>
                        {todo.done ? '✓ ' : '· '}{todo.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12px] text-[var(--text-faint)]">No goals set</div>
                )
              )}

              {channel.key === 'training' && (
                <div className="font-mono text-[13px] tabular-nums text-[var(--text)]">
                  {day.detail.setsLogged > 0
                    ? `${day.detail.setsLogged} sets logged${day.detail.avgRpe != null ? ` · avg RPE ${day.detail.avgRpe}` : ''}`
                    : <span className="text-[var(--text-faint)]">No sets logged</span>}
                </div>
              )}

              {channel.key === 'fuel' && (
                day.detail.consumed && day.detail.targets ? (
                  <div className="font-mono text-[13px] tabular-nums text-[var(--text)]">
                    {Math.round(day.detail.consumed.calories)} / {day.detail.targets.calories} kcal
                    {' · '}
                    {Math.round(day.detail.consumed.protein_g)} / {day.detail.targets.protein_g} g protein
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--text-faint)]">No nutrition logged</div>
                )
              )}
            </div>
          ))}

          {day.recovery != null && (
            <div className="flex items-center gap-2 border-t border-[var(--ink-06)] pt-4 font-mono text-[12px] tabular-nums text-[var(--text-dim)]">
              {day.readiness_state && (
                <span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{
                    background: READINESS_COLOR[day.readiness_state] ?? 'var(--text-faint)',
                    boxShadow: `0 0 6px ${READINESS_COLOR[day.readiness_state] ?? 'transparent'}`,
                  }}
                />
              )}
              Recovery {day.recovery}%{day.readiness_state ? ` · ${day.readiness_state}` : ''}
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
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)' }}
    >
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-16">
        <div className="boot space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="display text-[22px] font-bold tracking-tight text-[var(--text)]">Monthly review</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close monthly review"
              className="glass flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[13px] leading-none text-[var(--text-dim)] transition-transform active:scale-[0.92]"
            >
              ✕
            </button>
          </div>

          {/* Month nav — single segmented pill */}
          <div className="glass mx-auto flex w-fit items-center rounded-full border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              aria-label="Previous month"
              className="flex h-10 w-11 items-center justify-center rounded-full font-mono text-[15px] text-[var(--text-dim)] transition-transform active:scale-[0.92]"
            >
              ‹
            </button>
            <div className="display min-w-[148px] text-center text-[14px] font-semibold text-[var(--text)]">
              {monthLabel(month)}
            </div>
            <button
              type="button"
              onClick={() => setMonth(m => shiftMonth(m, 1))}
              aria-label="Next month"
              className="flex h-10 w-11 items-center justify-center rounded-full font-mono text-[15px] text-[var(--text-dim)] transition-transform active:scale-[0.92]"
            >
              ›
            </button>
          </div>

          {/* Summary strip */}
          {summary && (
            <div className="glass flex items-center justify-around rounded-2xl border border-[var(--border)] px-2 py-2.5">
              {summary.goalsOnPct != null && <SummaryStat label="goals" value={`${summary.goalsOnPct}%`} />}
              {summary.trainingOnPct != null && <SummaryStat label="training" value={`${summary.trainingOnPct}%`} />}
              {summary.fuelOnPct != null && <SummaryStat label="fuel" value={`${summary.fuelOnPct}%`} />}
              <SummaryStat label="streak" value={`${summary.currentStreak}d`} sub={`· best ${summary.bestStreak}d`} />
              {summary.avgRecovery != null && (
                <SummaryStat
                  label="recovery"
                  value={`${summary.avgRecovery}%`}
                  sub={summary.prevAvgRecovery != null
                    ? `${summary.avgRecovery - summary.prevAvgRecovery >= 0 ? '+' : ''}${summary.avgRecovery - summary.prevAvgRecovery} vs prev`
                    : undefined}
                />
              )}
            </div>
          )}

          {/* Grid */}
          <div className="glass-thick rounded-3xl border border-[var(--border)] p-4">
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
                  {WEEKDAYS.map(day => (
                    <div key={day.key} className="text-center font-mono text-[10px] uppercase text-[var(--text-faint)]">
                      {day.label}
                    </div>
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
                        className="flex min-h-[54px] flex-col justify-between gap-1.5 rounded-xl p-2 transition-transform duration-150 active:scale-[0.95] disabled:opacity-30"
                        style={{
                          background: isToday ? 'rgba(0, 210, 106, 0.08)' : 'var(--ink-02)',
                          boxShadow: isToday ? 'inset 0 0 0 1.5px rgba(0, 210, 106, 0.6)' : 'inset 0 0 0 1px var(--ink-06)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-mono text-[11px] tabular-nums leading-none ${
                              isToday ? 'font-semibold text-[#00d26a]' : 'text-[var(--text-dim)]'
                            }`}
                          >
                            {Number(day.date.slice(8, 10))}
                          </span>
                          {day.readiness_state && (
                            <span
                              className="h-[5px] w-[5px] rounded-full"
                              style={{
                                background: READINESS_COLOR[day.readiness_state] ?? 'var(--text-faint)',
                                boxShadow: `0 0 5px ${READINESS_COLOR[day.readiness_state] ?? 'transparent'}`,
                              }}
                            />
                          )}
                        </div>
                        <div className="space-y-[3px]">
                          {CHANNELS.map(channel => (
                            <ChannelBar key={channel.key} state={day[channel.key]} color={channel.color} />
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--ink-06)] pt-3">
                  {CHANNELS.map(channel => (
                    <span key={channel.key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                      <span className="h-[4px] w-4 rounded-full" style={{ background: channel.color }} />
                      {channel.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                    <span className="h-[4px] w-4 rounded-full" style={{ background: OFF_COLOR, opacity: 0.7 }} />
                    Slipped
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                    <span className="h-[4px] w-2 rounded-full" style={{ background: 'var(--text-faint)' }} />
                    Partial
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

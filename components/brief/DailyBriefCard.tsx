'use client'

import { useEffect, useState } from 'react'
import { stateColor, type ReadinessState } from '@/lib/readiness'
import type { StoredBrief, StoredProposal } from '@/lib/brief/types'

const READINESS_STATES: ReadinessState[] = ['green', 'controlled', 'recover', 'hardNo']

function briefStateColor(state: string) {
  return READINESS_STATES.includes(state as ReadinessState)
    ? stateColor(state as ReadinessState)
    : 'var(--text-dim)'
}

const DOMAIN_LABELS = {
  training: 'Training',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  focus: 'Focus',
} as const

type CheckInDraft = {
  soreness: number | null
  motivation: number | null
  energy: number | null
  mood: number | null
  symptoms: string
  note: string
}

const EMPTY_CHECK_IN: CheckInDraft = {
  soreness: null,
  motivation: null,
  energy: null,
  mood: null,
  symptoms: '',
  note: '',
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        {label}
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className="h-7 w-7 rounded-md border text-[10px] font-bold"
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              borderColor: value === score ? '#00d26a' : 'var(--border)',
              background: value === score ? '#00d26a' : 'var(--surface-2)',
              color: value === score ? 'var(--bg)' : 'var(--text-dim)',
            }}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DailyBriefCard() {
  const [brief, setBrief] = useState<StoredBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyProposal, setBusyProposal] = useState<number | null>(null)
  const [rating, setRating] = useState<'useful' | 'not_useful' | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkIn, setCheckIn] = useState<CheckInDraft>(EMPTY_CHECK_IN)
  const [savingCheckIn, setSavingCheckIn] = useState(false)

  async function load(method: 'GET' | 'POST' = 'GET') {
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/brief', { method })
      if (!response.ok) throw new Error('Brief unavailable')
      const data = await response.json()
      setBrief(data.brief)
      setRating(data.brief?.outcome?.user_rating ?? null)
    } catch {
      setError('Daily Brief is unavailable. Readiness remains active below.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
      void fetch('/api/check-in')
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          const row = data?.check_in
          if (!row) return
          setCheckIn({
            soreness: row.soreness ?? null,
            motivation: row.motivation ?? null,
            energy: row.energy ?? null,
            mood: row.mood ?? null,
            symptoms: row.symptoms ?? '',
            note: row.note ?? '',
          })
        })
        .catch(() => {})
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  async function resolveProposal(proposal: StoredProposal, action: 'accept' | 'reject') {
    if (proposal.id < 1) return
    setBusyProposal(proposal.id)
    try {
      const response = await fetch('/api/brief/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposal.id, action }),
      })
      if (!response.ok) throw new Error('Proposal update failed')
      const data = await response.json()
      setBrief((current) => current
        ? {
            ...current,
            proposals: current.proposals.map((item) =>
              item.id === proposal.id ? data.proposal : item
            ),
          }
        : current)
      if (action === 'accept') {
        window.dispatchEvent(new CustomEvent('goals-changed'))
        window.dispatchEvent(new CustomEvent('nutrition-changed'))
      }
    } catch {
      setError('The proposal could not be updated.')
    } finally {
      setBusyProposal(null)
    }
  }

  async function submitRating(nextRating: 'useful' | 'not_useful') {
    if (!brief || brief.id < 1) return
    setRating(nextRating)
    const response = await fetch('/api/brief/outcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief_id: brief.id, rating: nextRating }),
    })
    if (!response.ok) setRating(brief.outcome?.user_rating ?? null)
  }

  async function saveCheckIn() {
    setSavingCheckIn(true)
    setError(null)
    try {
      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkIn),
      })
      if (!response.ok) throw new Error('Check-in failed')
      setCheckInOpen(false)
      await load('POST')
    } catch {
      setError('The check-in could not be saved.')
    } finally {
      setSavingCheckIn(false)
    }
  }

  if (loading && !brief) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--text-faint)]">
        Generating Daily Brief…
      </div>
    )
  }

  if (!brief) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">Daily Brief</div>
        <div className="mt-2 text-sm text-[var(--text-dim)]">{error}</div>
        <button type="button" onClick={() => void load()} className="mt-3 text-xs font-bold text-[#00d26a]">
          Retry
        </button>
      </div>
    )
  }

  const output = brief.output_json
  const color = briefStateColor(brief.readiness_state)
  const topPriority = output.priorities[0]
  const pendingProposals = brief.proposals.filter((proposal) => proposal.status === 'pending')

  return (
    <section
      className="panel relative overflow-hidden rounded-2xl"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Readiness-state aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full"
        style={{ background: color, opacity: 0.1, filter: 'blur(28px)' }}
      />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-faint)]"
            style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
          >
            Daily Brief
          </span>
          <span
            className="rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]"
            style={{
              fontFamily: 'var(--font-jetbrains-mono, monospace)',
              borderColor: `${color}66`,
              color,
            }}
          >
            {output.overall_confidence} confidence
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold leading-tight text-[var(--text)]">
          {output.headline}
        </h2>
        {topPriority && (
          <div className="mt-2 text-[12px] leading-relaxed text-[var(--text-dim)]">
            <span className="mr-2 font-mono text-[10px] text-[var(--text-faint)]">01</span>
            {topPriority.text}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
            {brief.fallback_level === 2 ? 'Deterministic fallback' : brief.model}
          </span>
          <span className="text-xs text-[var(--text-dim)]">{expanded ? 'Collapse' : 'Evidence + actions'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {output.recommendations.map((recommendation) => (
              <div key={recommendation.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {DOMAIN_LABELS[recommendation.domain]}
                  </span>
                  <span className="font-mono text-[9px] text-[var(--text-faint)]">{recommendation.confidence}</span>
                </div>
                <div className="mt-1.5 text-[12px] font-medium leading-snug text-[var(--text)]">
                  {recommendation.action}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-dim)]">
                  {recommendation.rationale}
                </div>
                <div className="mt-2 space-y-1">
                  {recommendation.evidence.map((item, index) => (
                    <div key={`${item.source}-${item.metric}-${index}`} className="font-mono text-[9px] text-[var(--text-faint)]">
                      {item.metric}: {item.value}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {pendingProposals.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Confirm changes
              </div>
              <div className="space-y-2">
                {pendingProposals.map((proposal) => (
                  <div key={proposal.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                    <span className="flex-1 text-[11px] text-[var(--text)]">{proposal.summary}</span>
                    <button
                      type="button"
                      onClick={() => void resolveProposal(proposal, 'reject')}
                      disabled={busyProposal === proposal.id || proposal.id < 1}
                      className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-dim)] disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveProposal(proposal, 'accept')}
                      disabled={busyProposal === proposal.id || proposal.id < 1}
                      className="rounded-md bg-[#00d26a] px-2.5 py-1.5 text-[10px] font-bold text-[var(--bg)] disabled:opacity-40"
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {output.data_gaps.length > 0 && (
            <div className="rounded-lg border border-[#f59e0b44] bg-[#f59e0b0a] p-3">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#f59e0b]">
                Data gaps
              </div>
              {output.data_gaps.map((gap) => (
                <div key={`${gap.source}-${gap.impact}`} className="mt-1 text-[10px] text-[var(--text-dim)]">
                  {gap.source}: {gap.impact}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="mr-1 text-[10px] text-[var(--text-faint)]">Useful?</span>
            {(['useful', 'not_useful'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => void submitRating(value)}
                className="rounded-md border px-2.5 py-1.5 text-[10px] font-bold"
                style={{
                  borderColor: rating === value ? '#00d26a' : 'var(--border)',
                  color: rating === value ? '#00d26a' : 'var(--text-dim)',
                }}
              >
                {value === 'useful' ? 'Useful' : 'Not useful'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCheckInOpen((value) => !value)}
              className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-dim)]"
            >
              Check-in
            </button>
            <button
              type="button"
              onClick={() => void load('POST')}
              disabled={loading}
              title="Rebuilds the brief from current data. Pending proposals from this brief will expire."
              className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--text-dim)] disabled:opacity-40"
            >
              Regenerate
            </button>
          </div>

          {checkInOpen && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="grid grid-cols-2 gap-3">
                <ScoreInput label="Soreness" value={checkIn.soreness} onChange={(soreness) => setCheckIn((v) => ({ ...v, soreness }))} />
                <ScoreInput label="Energy" value={checkIn.energy} onChange={(energy) => setCheckIn((v) => ({ ...v, energy }))} />
                <ScoreInput label="Motivation" value={checkIn.motivation} onChange={(motivation) => setCheckIn((v) => ({ ...v, motivation }))} />
                <ScoreInput label="Mood" value={checkIn.mood} onChange={(mood) => setCheckIn((v) => ({ ...v, mood }))} />
              </div>
              <input
                value={checkIn.symptoms}
                onChange={(event) => setCheckIn((value) => ({ ...value, symptoms: event.target.value }))}
                placeholder="Symptoms or concerns, optional"
                className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[#00d26a]"
              />
              <input
                value={checkIn.note}
                onChange={(event) => setCheckIn((value) => ({ ...value, note: event.target.value }))}
                placeholder="Context note, optional"
                className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[#00d26a]"
              />
              <button
                type="button"
                onClick={() => void saveCheckIn()}
                disabled={savingCheckIn}
                className="h-9 w-full rounded-md bg-[#00d26a] text-[11px] font-bold text-[var(--bg)] disabled:opacity-50"
              >
                {savingCheckIn ? 'Saving…' : 'Save check-in and refresh brief'}
              </button>
            </div>
          )}

          {error && <div className="text-[10px] text-[#ef4444]">{error}</div>}
        </div>
      )}
    </section>
  )
}

'use client'

import { useState } from 'react'
import type { ExtractedMeal } from '@/lib/meal-extraction'

export default function MealTextLogger({ onApplied }: { onApplied: () => void | Promise<void> }) {
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<ExtractedMeal | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function parseMeal() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/nutrition/meal-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error('Could not parse meal')
      const data = await response.json()
      setProposal(data.meal)
      setModel(data.model)
    } catch {
      setError('Meal text could not be parsed.')
    } finally {
      setBusy(false)
    }
  }

  async function applyMeal() {
    if (!proposal || proposal.items.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/nutrition/meal-proposal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal),
      })
      if (!response.ok) throw new Error('Could not apply meal')
      setText('')
      setProposal(null)
      await onApplied()
    } catch {
      setError('The reviewed meal could not be logged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel rounded-2xl p-3">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">
        Quick meal text
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setProposal(null)
          }}
          placeholder="e.g. dinner: 2 eggs, banana, protein powder"
          className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-3 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[#00d26a]"
        />
        <button
          type="button"
          onClick={() => void parseMeal()}
          disabled={!text.trim() || busy}
          className="btn-accent rounded-xl px-3 text-[11px] font-bold"
        >
          Review
        </button>
      </div>

      {proposal && (
        <div className="mt-3 space-y-2 border-t border-[var(--ink-06)] pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase text-[var(--text-dim)]">{proposal.meal_name.replace('_', ' ')}</span>
            <span className="font-mono text-[8px] text-[var(--text-faint)]">{model}</span>
          </div>
          {proposal.items.map((item) => (
            <div key={`${item.food_item_id}-${item.label}`} className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text)]">{item.label}</span>
              <span className="font-mono text-[9px] text-[var(--text-faint)]">{item.confidence}</span>
            </div>
          ))}
          {proposal.unmatched.map((item) => (
            <div key={item} className="text-[10px] text-[#f59e0b]">Unmatched: {item}</div>
          ))}
          <button
            type="button"
            onClick={() => void applyMeal()}
            disabled={proposal.items.length === 0 || busy}
            className="glass h-9 w-full rounded-xl border border-[#00d26a] text-[11px] font-bold text-[#00d26a] transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            Confirm and log
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-[10px] text-[#ef4444]">{error}</div>}
    </div>
  )
}

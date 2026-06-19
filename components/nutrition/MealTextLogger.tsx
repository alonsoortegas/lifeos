'use client'

import { useState } from 'react'
import type { ExtractedMeal } from '@/lib/meal-extraction'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import SectionLabel from '@/components/ui/SectionLabel'

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
    <Card className="p-3">
      <SectionLabel>Quick meal text</SectionLabel>
      <div className="mt-2 flex gap-2">
        <Input
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setProposal(null)
          }}
          placeholder="e.g. dinner: 2 eggs, banana, protein powder"
          aria-label="Meal description"
          className="min-w-0 flex-1 text-xs"
        />
        <Button
          onClick={() => void parseMeal()}
          disabled={!text.trim() || busy}
          loading={busy && !proposal}
          size="sm"
        >
          Review
        </Button>
      </div>

      {proposal && (
        <div className="mt-3 space-y-2 border-t border-[var(--ink-06)] pt-3">
          <div className="flex items-center justify-between">
            <Badge>{proposal.meal_name.replace('_', ' ')}</Badge>
            <span className="font-mono text-[8px] text-[var(--text-faint)]">{model}</span>
          </div>
          {proposal.items.map((item) => (
            <div key={`${item.food_item_id}-${item.label}`} className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--text)]">{item.label}</span>
              <Badge tone={item.confidence === 'high' ? 'success' : item.confidence === 'medium' ? 'warning' : 'neutral'}>
                {item.confidence}
              </Badge>
            </div>
          ))}
          {proposal.unmatched.map((item) => (
            <div key={item} className="text-[10px] text-[#f59e0b]">Unmatched: {item}</div>
          ))}
          <Button
            variant="outline"
            size="sm"
            block
            onClick={() => void applyMeal()}
            disabled={proposal.items.length === 0 || busy}
            loading={busy}
          >
            Confirm and log
          </Button>
        </div>
      )}
      {error && <div className="mt-2 text-[10px] text-[#ef4444]">{error}</div>}
    </Card>
  )
}

'use client'

import { useState } from 'react'
import {
  type GenericFoodDraft,
  type ParsedGenericFood,
  parseGenericFoodDraft,
} from '@/lib/nutrition'

const emptyDraft: GenericFoodDraft = {
  name: '',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
}

export default function GenericFoodAdder({
  saving,
  compact = false,
  onSubmit,
}: {
  saving: boolean
  compact?: boolean
  onSubmit: (food: ParsedGenericFood) => Promise<boolean> | boolean
}) {
  const [draft, setDraft] = useState<GenericFoodDraft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  const parsed = parseGenericFoodDraft(draft)

  const updateDraft = (patch: Partial<GenericFoodDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setError(null)
  }

  async function submit() {
    const result = parseGenericFoodDraft(draft)
    if (!result.ok) {
      setError(result.error)
      return
    }

    const didSave = await onSubmit(result.value)
    if (didSave) {
      setDraft(emptyDraft)
      setError(null)
    }
  }

  const inputClass = compact
    ? 'rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-2 text-sm text-[var(--text)]'
    : 'min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text)]'

  return (
    <div className={compact ? 'rounded-xl border border-[var(--border)] bg-[var(--ink-02)] p-3' : undefined}>
      <div
        className={compact ? 'mb-2 text-[11px] uppercase tracking-widest text-[var(--text-faint)]' : 'mb-2 text-[10px] uppercase tracking-widest text-[var(--text-faint)]'}
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        add generic food
      </div>
      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-[1.5fr_repeat(4,minmax(54px,0.7fr))_auto] gap-2'}>
        <input
          aria-label="Food name"
          placeholder="slice of cheese"
          value={draft.name}
          onChange={(event) => updateDraft({ name: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Calories"
          placeholder="kcal"
          inputMode="decimal"
          type="number"
          min="0"
          value={draft.calories}
          onChange={(event) => updateDraft({ calories: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Protein grams"
          placeholder="protein"
          inputMode="decimal"
          type="number"
          min="0"
          step="0.1"
          value={draft.protein_g}
          onChange={(event) => updateDraft({ protein_g: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Carb grams"
          placeholder="carbs"
          inputMode="decimal"
          type="number"
          min="0"
          step="0.1"
          value={draft.carbs_g}
          onChange={(event) => updateDraft({ carbs_g: event.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Fat grams"
          placeholder="fat"
          inputMode="decimal"
          type="number"
          min="0"
          step="0.1"
          value={draft.fat_g}
          onChange={(event) => updateDraft({ fat_g: event.target.value })}
          className={inputClass}
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving || !parsed.ok}
          className="btn-accent rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest disabled:cursor-default disabled:opacity-50"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          add
        </button>
      </div>
      <div
        className="mt-2 min-h-[14px] text-[11px] text-[var(--text-faint)]"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        {parsed.ok
          ? `${parsed.value.calories}kcal · ${parsed.value.protein_g}p · ${parsed.value.carbs_g}c · ${parsed.value.fat_g}f`
          : error ?? 'enter macros for the portion you ate'}
      </div>
    </div>
  )
}

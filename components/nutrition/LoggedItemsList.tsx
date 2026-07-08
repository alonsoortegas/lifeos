'use client'

import Card from '@/components/ui/Card'
import { MEAL_LABELS, loggedMealItemLabel, type MacroTotals } from '@/lib/nutrition'
import type { MealLog } from '@/lib/types'

function macroValue(value: number): string {
  return `${Math.round(value)}`
}

export default function LoggedItemsList({
  mealLogs,
  totals,
  savingKey,
  onRemove,
}: {
  mealLogs: MealLog[]
  totals: MacroTotals
  savingKey: string | null
  onRemove: (itemId: number) => void
}) {
  const loggedItems = mealLogs.flatMap((log) =>
    (log.meal_log_item ?? []).map((item) => ({
      ...item,
      mealName: MEAL_LABELS[log.meal_name],
    }))
  )

  if (loggedItems.length === 0) return null

  return (
    <div className="space-y-2">
      <div
        className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase"
        style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
      >
        · consumed ·
      </div>
      <Card className="p-4">
        <div className="text-sm text-[var(--text)]">
          {macroValue(totals.calories)}kcal · {macroValue(totals.protein_g)}g protein · {macroValue(totals.carbs_g)}g carbs · {macroValue(totals.fat_g)}g fat
        </div>
        <div className="mt-3 space-y-1.5">
          {loggedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-faint)]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              <span className="min-w-0 flex-1 truncate">
                {item.mealName} · {loggedMealItemLabel(item)}
              </span>
              <span className="flex-shrink-0">{macroValue(Number(item.protein_g))}p/{macroValue(Number(item.carbs_g))}c</span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={savingKey === `remove:${item.id}`}
                className="flex-shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)] disabled:cursor-default disabled:opacity-50"
              >
                delete
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

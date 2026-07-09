# Nutrition Delete And Generic Food Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the nutrition tab delete any food already logged today and add an ad hoc food portion by entering the package macros directly.

**Architecture:** Keep logged nutrition in `meal_log_item`. Catalog foods continue to reference `food_item`; generic package portions become custom `meal_log_item` rows with nullable `food_item_id`, a `custom_food_name`, and explicit macro values. Add small shared nutrition helpers so mobile and desktop use the same label and generic-food validation.

**Tech Stack:** Next.js 16 App Router, React 19.2 client components, Supabase Postgres/Data API, TypeScript, Vitest.

## Global Constraints

- `AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- Supabase: before schema implementation, fetch `https://supabase.com/changelog.md` and check for relevant breaking changes; use `supabase migration new <name>` to create the migration file.
- Do not put ad hoc package foods into the permanent `food_item` catalog.
- Existing catalog logging and meal text proposal behavior must keep working.
- Deleting a logged item should work for template items, extra catalog portions, meal text proposal items, and custom generic foods.

---

## File Structure

- Modify `supabase/migrations/<generated>_allow_custom_meal_log_items.sql`: allow custom meal log rows without a catalog food.
- Modify `lib/types.ts`: make `MealLogItem.food_item_id` nullable and add custom fields.
- Modify `lib/nutrition.ts`: add shared label and generic macro validation helpers.
- Create `__tests__/nutrition-log-items.test.ts`: cover helper behavior for catalog and custom rows.
- Create `components/nutrition/GenericFoodAdder.tsx`: reusable ad hoc macro form.
- Create `components/nutrition/LoggedItemsList.tsx`: reusable consumed list with delete buttons.
- Modify `components/tabs/NutritionTab.tsx`: wire generic add and delete-from-summary on mobile.
- Modify `components/desktop/NutritionDesktop.tsx`: wire generic add and delete-from-summary on desktop.

### Task 1: Schema And Types

**Files:**
- Create via CLI: `supabase/migrations/<generated>_allow_custom_meal_log_items.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `MealLogItem.food_item_id: number | null`
- Produces: `MealLogItem.custom_food_name: string | null`
- Produces: `MealLogItem.source: 'catalog' | 'custom'`

- [ ] **Step 1: Check current Supabase guidance**

Run:

```bash
curl -fsSL https://supabase.com/changelog.md | rg -i "breaking|rls|postgrest|data api|migration" -n
```

Expected: no relevant breaking change that changes `alter table`, RLS, or PostgREST embedded relation behavior for this task.

- [ ] **Step 2: Create the migration file**

Run:

```bash
supabase migration new allow_custom_meal_log_items
```

Expected: Supabase prints a new file path under `supabase/migrations/`.

- [ ] **Step 3: Add the migration SQL**

Write this SQL into the generated migration file:

```sql
alter table public.meal_log_item
  alter column food_item_id drop not null;

alter table public.meal_log_item
  add column if not exists custom_food_name text,
  add column if not exists source text not null default 'catalog';

alter table public.meal_log_item
  drop constraint if exists meal_log_item_source_check,
  add constraint meal_log_item_source_check
  check (source in ('catalog', 'custom'));

alter table public.meal_log_item
  drop constraint if exists meal_log_item_catalog_or_custom_check,
  add constraint meal_log_item_catalog_or_custom_check
  check (
    (
      source = 'catalog'
      and food_item_id is not null
      and custom_food_name is null
    )
    or
    (
      source = 'custom'
      and food_item_id is null
      and nullif(btrim(custom_food_name), '') is not null
    )
  );

alter table public.meal_log_item
  drop constraint if exists meal_log_item_nonnegative_macros_check,
  add constraint meal_log_item_nonnegative_macros_check
  check (
    quantity > 0
    and calories >= 0
    and protein_g >= 0
    and carbs_g >= 0
    and fat_g >= 0
  );
```

- [ ] **Step 4: Update TypeScript types**

In `lib/types.ts`, replace `MealLogItem` with:

```ts
export interface MealLogItem {
  id: number
  meal_log_id: number
  food_item_id: number | null
  quantity: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  substitution_group: string | null
  custom_food_name?: string | null
  source?: 'catalog' | 'custom'
  food_item?: FoodItem | null
}
```

- [ ] **Step 5: Verify migration applies locally**

Run:

```bash
supabase db reset
```

Expected: local database resets without migration errors.

### Task 2: Shared Nutrition Helpers

**Files:**
- Modify: `lib/nutrition.ts`
- Create: `__tests__/nutrition-log-items.test.ts`

**Interfaces:**
- Produces: `GenericFoodDraft`
- Produces: `parseGenericFoodDraft(draft: GenericFoodDraft): GenericFoodParseResult`
- Produces: `loggedMealItemLabel(item: Pick<MealLogItem, ...>): string`

- [ ] **Step 1: Write failing helper tests**

Create `__tests__/nutrition-log-items.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  loggedMealItemLabel,
  parseGenericFoodDraft,
} from '@/lib/nutrition'

describe('loggedMealItemLabel', () => {
  it('labels catalog foods with quantity', () => {
    expect(loggedMealItemLabel({
      quantity: 2,
      custom_food_name: null,
      food_item: { name: 'Egg' },
    })).toBe('Egg x2')
  })

  it('labels custom foods without needing a catalog food', () => {
    expect(loggedMealItemLabel({
      quantity: 1,
      custom_food_name: 'slice of cheese',
      food_item: null,
    })).toBe('slice of cheese')
  })
})

describe('parseGenericFoodDraft', () => {
  it('accepts package macros for a single portion', () => {
    expect(parseGenericFoodDraft({
      name: 'slice of cheese',
      calories: '90',
      protein_g: '6',
      carbs_g: '1',
      fat_g: '7',
    })).toEqual({
      ok: true,
      value: {
        name: 'slice of cheese',
        calories: 90,
        protein_g: 6,
        carbs_g: 1,
        fat_g: 7,
      },
    })
  })

  it('computes calories when kcal is left blank', () => {
    expect(parseGenericFoodDraft({
      name: 'custom yogurt',
      calories: '',
      protein_g: '20',
      carbs_g: '10',
      fat_g: '2',
    })).toEqual({
      ok: true,
      value: {
        name: 'custom yogurt',
        calories: 138,
        protein_g: 20,
        carbs_g: 10,
        fat_g: 2,
      },
    })
  })

  it('rejects empty names and negative macros', () => {
    expect(parseGenericFoodDraft({
      name: '',
      calories: '100',
      protein_g: '5',
      carbs_g: '0',
      fat_g: '1',
    })).toEqual({ ok: false, error: 'name the food' })

    expect(parseGenericFoodDraft({
      name: 'bad food',
      calories: '100',
      protein_g: '-5',
      carbs_g: '0',
      fat_g: '1',
    })).toEqual({ ok: false, error: 'macros must be zero or higher' })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- __tests__/nutrition-log-items.test.ts
```

Expected: FAIL because the helpers are not exported yet.

- [ ] **Step 3: Add helper implementation**

Add to `lib/nutrition.ts`:

```ts
import type { MealLogItem } from '@/lib/types'
```

Then add:

```ts
export type GenericFoodDraft = {
  name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

export type ParsedGenericFood = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export type GenericFoodParseResult =
  | { ok: true; value: ParsedGenericFood }
  | { ok: false; error: string }

export function loggedMealItemLabel(
  item: Pick<MealLogItem, 'quantity' | 'custom_food_name' | 'food_item'>,
): string {
  const foodName = item.custom_food_name?.trim() || item.food_item?.name || 'food'
  const quantity = Number(item.quantity) || 0
  if (quantity <= 0 || quantity === 1) return foodName
  return `${foodName} x${Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '')}`
}

function parseNonnegativeNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 10) / 10
}

export function parseGenericFoodDraft(draft: GenericFoodDraft): GenericFoodParseResult {
  const name = draft.name.trim()
  if (!name) return { ok: false, error: 'name the food' }

  const protein = parseNonnegativeNumber(draft.protein_g)
  const carbs = parseNonnegativeNumber(draft.carbs_g)
  const fat = parseNonnegativeNumber(draft.fat_g)
  if (protein === null || carbs === null || fat === null) {
    return { ok: false, error: 'macros must be zero or higher' }
  }

  const calories = draft.calories.trim()
    ? parseNonnegativeNumber(draft.calories)
    : calculateMacroCalories({ protein_g: protein, carbs_g: carbs, fat_g: fat })
  if (calories === null) return { ok: false, error: 'calories must be zero or higher' }
  if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
    return { ok: false, error: 'enter at least one macro' }
  }

  return {
    ok: true,
    value: {
      name,
      calories: Math.round(calories),
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    },
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- __tests__/nutrition-log-items.test.ts
```

Expected: PASS.

### Task 3: Generic Food Form

**Files:**
- Create: `components/nutrition/GenericFoodAdder.tsx`

**Interfaces:**
- Consumes: `GenericFoodDraft`, `parseGenericFoodDraft`
- Produces: reusable form with `onSubmit(value: ParsedGenericFood): void`

- [ ] **Step 1: Create the component**

Create `components/nutrition/GenericFoodAdder.tsx`:

```tsx
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
    : undefined

  return (
    <div className={compact ? 'rounded-xl border border-[var(--border)] bg-[var(--ink-02)] p-3' : undefined}>
      <div className={compact ? 'mb-2 text-[11px] uppercase tracking-widest text-[var(--text-faint)]' : undefined}>
        add generic food
      </div>
      <div className={compact ? 'grid grid-cols-2 gap-2' : undefined}>
        <input aria-label="Food name" placeholder="slice of cheese" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} className={inputClass} />
        <input aria-label="Calories" placeholder="kcal" inputMode="decimal" type="number" min="0" value={draft.calories} onChange={(event) => setDraft((prev) => ({ ...prev, calories: event.target.value }))} className={inputClass} />
        <input aria-label="Protein grams" placeholder="protein" inputMode="decimal" type="number" min="0" step="0.1" value={draft.protein_g} onChange={(event) => setDraft((prev) => ({ ...prev, protein_g: event.target.value }))} className={inputClass} />
        <input aria-label="Carb grams" placeholder="carbs" inputMode="decimal" type="number" min="0" step="0.1" value={draft.carbs_g} onChange={(event) => setDraft((prev) => ({ ...prev, carbs_g: event.target.value }))} className={inputClass} />
        <input aria-label="Fat grams" placeholder="fat" inputMode="decimal" type="number" min="0" step="0.1" value={draft.fat_g} onChange={(event) => setDraft((prev) => ({ ...prev, fat_g: event.target.value }))} className={inputClass} />
        <button type="button" onClick={submit} disabled={saving || !parsed.ok} className="btn-accent rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest">
          add
        </button>
      </div>
      <div className="mt-2 text-[11px] text-[var(--text-faint)]">
        {parsed.ok ? `${parsed.value.calories}kcal · ${parsed.value.protein_g}p · ${parsed.value.carbs_g}c · ${parsed.value.fat_g}f` : error ?? 'enter macros for the portion you ate'}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck the component**

Run:

```bash
npm run lint -- components/nutrition/GenericFoodAdder.tsx
```

Expected: PASS.

### Task 4: Reusable Logged List With Delete

**Files:**
- Create: `components/nutrition/LoggedItemsList.tsx`

**Interfaces:**
- Consumes: `MealLog[]`, `MacroTotals`, `onRemove(itemId: number)`
- Produces: every logged row has an explicit remove button.

- [ ] **Step 1: Create `LoggedItemsList`**

Create `components/nutrition/LoggedItemsList.tsx`:

```tsx
'use client'

import Card from '@/components/ui/Card'
import { MEAL_LABELS, type MacroTotals, loggedMealItemLabel } from '@/lib/nutrition'
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
      <div className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        · consumed ·
      </div>
      <Card className="p-4">
        <div className="text-sm text-[var(--text)]">
          {macroValue(totals.calories)}kcal · {macroValue(totals.protein_g)}g protein · {macroValue(totals.carbs_g)}g carbs · {macroValue(totals.fat_g)}g fat
        </div>
        <div className="mt-3 space-y-1.5">
          {loggedItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              <span className="min-w-0 flex-1 truncate">
                {item.mealName} · {loggedMealItemLabel(item)}
              </span>
              <span className="flex-shrink-0">{macroValue(Number(item.protein_g))}p/{macroValue(Number(item.carbs_g))}c</span>
              <button type="button" onClick={() => onRemove(item.id)} disabled={savingKey === `remove:${item.id}`} className="flex-shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                delete
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck the component**

Run:

```bash
npm run lint -- components/nutrition/LoggedItemsList.tsx
```

Expected: PASS.

### Task 5: Mobile Nutrition Tab Wiring

**Files:**
- Modify: `components/tabs/NutritionTab.tsx`

**Interfaces:**
- Consumes: `GenericFoodAdder`, `LoggedItemsList`, `ParsedGenericFood`, `loggedMealItemLabel`
- Produces: `logGenericFood(mealName, food)` client mutation.

- [ ] **Step 1: Replace local label helper**

Remove the local `quantityValue` and `loggedFoodLabel` helpers. Import:

```ts
import GenericFoodAdder from '@/components/nutrition/GenericFoodAdder'
import LoggedItemsList from '@/components/nutrition/LoggedItemsList'
import {
  loggedMealItemLabel,
  type ParsedGenericFood,
} from '@/lib/nutrition'
```

Use `loggedMealItemLabel(item)` anywhere a logged item label is displayed.

- [ ] **Step 2: Add generic food mutation**

Add inside `NutritionTab`:

```ts
const logGenericFood = async (mealName: MealTemplateName, food: ParsedGenericFood): Promise<boolean> => {
  const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION))
  if (!day) return false

  const key = `generic:${mealName}`
  setSavingKey(key)

  let mealLog = mealLogs.find((log) => log.meal_name === mealName)
  if (!mealLog) {
    const { data, error } = await supabase
      .from('meal_log')
      .insert({ nutrition_day_id: day.id, meal_name: mealName })
      .select('*')
      .single()

    if (error) {
      console.error('meal log create failed:', error.message)
      showMutError('couldn\\'t create meal')
      setSavingKey(null)
      return false
    }
    mealLog = { ...(data as MealLog), meal_log_item: [] }
  }

  const { error } = await supabase.from('meal_log_item').insert({
    meal_log_id: mealLog.id,
    food_item_id: null,
    custom_food_name: food.name,
    source: 'custom',
    quantity: 1,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    substitution_group: 'custom',
  })

  if (error) {
    console.error('generic food insert failed:', error.message)
    showMutError('generic food didn\\'t save')
    setSavingKey(null)
    return false
  }

  await loadMealLogs(day.id)
  setSavingKey(null)
  return true
}
```

- [ ] **Step 3: Render generic form in each expanded meal**

Render below `PortionAdder`:

```tsx
<GenericFoodAdder
  compact
  saving={savingKey === `generic:${meal.name}`}
  onSubmit={(food) => logGenericFood(meal.name, food)}
/>
```

- [ ] **Step 4: Replace mobile consumed summary**

Replace:

```tsx
<LoggedSummary mealLogs={mealLogs} totals={consumed} />
```

with:

```tsx
<LoggedItemsList
  mealLogs={mealLogs}
  totals={consumed}
  savingKey={savingKey}
  onRemove={removeLoggedItem}
/>
```

Then delete the local `LoggedSummary` component.

- [ ] **Step 5: Run focused checks**

Run:

```bash
npm run lint -- components/tabs/NutritionTab.tsx components/nutrition/GenericFoodAdder.tsx components/nutrition/LoggedItemsList.tsx
```

Expected: PASS.

### Task 6: Desktop Nutrition Wiring

**Files:**
- Modify: `components/desktop/NutritionDesktop.tsx`

**Interfaces:**
- Same behavior as mobile, preserving existing desktop layout.

- [ ] **Step 1: Import shared components/helpers**

Add:

```ts
import GenericFoodAdder from '@/components/nutrition/GenericFoodAdder'
import { loggedMealItemLabel, type ParsedGenericFood } from '@/lib/nutrition'
```

Replace `loggedFoodLabel(item)` with `loggedMealItemLabel(item)`.

- [ ] **Step 2: Add desktop generic food mutation**

Add the same `logGenericFood(mealName, food)` function from Task 5, adjusted to omit `showMutError` because desktop currently logs mutation errors to console.

- [ ] **Step 3: Render generic form under desktop `PortionAdder`**

Render below `PortionAdder`:

```tsx
<GenericFoodAdder
  saving={savingKey === `generic:${meal.name}`}
  onSubmit={(food) => logGenericFood(meal.name, food)}
/>
```

If the raw component styles do not fit desktop, pass `compact` and keep the existing dense layout.

- [ ] **Step 4: Add delete buttons to the desktop consumed summary**

In the consumed summary map, change each row to include:

```tsx
<button
  type="button"
  onClick={() => removeLoggedItem(item.id)}
  disabled={savingKey === `remove:${item.id}`}
  style={{
    flexShrink: 0,
    fontFamily: mono,
    fontSize: 9,
    color: 'var(--text-dim)',
    border: '1px solid var(--border)',
    background: 'transparent',
    padding: '2px 7px',
    borderRadius: 999,
    cursor: 'pointer',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  }}
>
  delete
</button>
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
npm run lint -- components/desktop/NutritionDesktop.tsx components/nutrition/GenericFoodAdder.tsx
```

Expected: PASS.

### Task 7: End-To-End Verification

**Files:**
- No new files.

**Interfaces:**
- Verifies schema, tests, build, and manual nutrition flow.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test -- __tests__/nutrition-log-items.test.ts __tests__/meal-extraction.test.ts __tests__/nutrition-bulk.test.ts
```

Expected: PASS. Meal extraction proves catalog proposal logging was not broken.

- [ ] **Step 2: Run full static checks**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual browser verification**

Run:

```bash
npm run dev
```

Open the app and verify:

1. Nutrition tab loads today.
2. Add a catalog portion, then delete it from the consumed list.
3. Add a template food with `ate this`, then delete it by tapping `ate` and also by using the consumed-list delete button.
4. Add generic food: `slice of cheese`, `90 kcal`, `6 protein`, `1 carbs`, `7 fat`.
5. Confirm macro cards increase by exactly `90 kcal`, `6p`, `1c`, `7f`.
6. Delete the generic food and confirm the macro cards return to the previous totals.
7. Repeat the generic add/delete flow in desktop Nutrition.

### Self-Review

- Spec coverage: delete is covered for all logged rows in Tasks 4-6; generic macro portion logging is covered in Tasks 1-6.
- Placeholder scan: the only dynamic path is the Supabase migration generated by `supabase migration new`, required by the Supabase skill.
- Type consistency: `custom_food_name`, `source`, and nullable `food_item_id` are defined in Task 1 and consumed by Tasks 2, 5, and 6.

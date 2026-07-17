# Nutrition Saved Portions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user optionally save a manually entered food as one reusable portion while preserving the existing log-only action.

**Architecture:** Store reusable personal portions in a dedicated RLS-protected Supabase table and map catalog foods plus saved portions into one shared dropdown-option type. Continue writing saved-portion logs as custom macro snapshots so later edits to a saved portion never change historical meal logs. Reuse one generic-food form with two explicit callbacks for log-only and log-and-save behavior on mobile and desktop.

**Tech Stack:** Next.js 16.2 App Router, React 19.2 client components, TypeScript, Supabase Postgres/Data API, Vitest, React Testing Library, jsdom.

## Global Constraints

- Read the relevant Next.js guide in `node_modules/next/dist/docs/` before writing Next.js code; the applicable guides are `01-app/01-getting-started/05-server-and-client-components.md` and `01-app/02-guides/testing/vitest.md`.
- Follow the existing single-owner `is_owner()` RLS model.
- Explicitly grant Data API table and sequence privileges because Supabase no longer automatically exposes new public tables.
- Keep `food_item` as read-only plan catalog data.
- The existing **Add** action must remain log-only.
- **Add & save portion** must save or update one reusable portion and log it today.
- Historical meal logs must remain snapshots and must not change when a saved portion is updated.
- Editing, deleting, categorizing, reordering, and sharing saved portions are out of scope.

---

## File Structure

- Create the migration path printed by `supabase migration new save_nutrition_portions`: define the saved-portion table, integrity checks, RLS policies, Data API grants, and updated-at trigger.
- Modify `lib/types.ts`: define `SavedFoodPortion`.
- Create `lib/nutrition-portions.ts`: normalize names, create upsert payloads, combine catalog/saved options, and scale option macros.
- Create `__tests__/nutrition-saved-portions.test.ts`: verify the pure saved-portion data behavior.
- Create `__tests__/nutrition-saved-portions-migration.test.ts`: verify the migration contains the required security and integrity controls.
- Modify `components/nutrition/GenericFoodAdder.tsx`: expose separate log-only and log-and-save actions.
- Create `__tests__/GenericFoodAdder.test.tsx`: verify each button calls only its intended callback and form clearing follows callback success.
- Modify `vitest.config.ts`: include TSX test files.
- Modify `package.json` and `package-lock.json`: add React Testing Library and jsdom test dependencies.
- Modify `components/tabs/NutritionTab.tsx`: load, save, display, and log saved portions on mobile.
- Modify `components/desktop/NutritionDesktop.tsx`: load, save, display, and log saved portions on desktop.

### Task 1: Saved Portion Domain Helpers

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/nutrition-portions.ts`
- Create: `__tests__/nutrition-saved-portions.test.ts`

**Interfaces:**
- Produces: `SavedFoodPortion`
- Produces: `PortionOption`
- Produces: `normalizeSavedPortionName(name: string): string`
- Produces: `savedFoodPortionPayload(food: ParsedGenericFood): Omit<SavedFoodPortion, 'id' | 'created_at' | 'updated_at'>`
- Produces: `buildPortionOptions(foods: FoodItem[], saved: SavedFoodPortion[]): PortionOption[]`
- Produces: `scalePortionOption(option: PortionOption, quantity: number)`

- [ ] **Step 1: Write failing helper tests**

Create `__tests__/nutrition-saved-portions.test.ts` with tests that assert:

```ts
expect(normalizeSavedPortionName('  Greek   Yogurt  ')).toBe('greek yogurt')

expect(savedFoodPortionPayload({
  name: ' Greek Yogurt ', calories: 120, protein_g: 20, carbs_g: 8, fat_g: 1,
})).toEqual({
  normalized_name: 'greek yogurt',
  name: 'Greek Yogurt',
  calories: 120,
  protein_g: 20,
  carbs_g: 8,
  fat_g: 1,
})

expect(buildPortionOptions([catalogFood], [savedPortion])).toEqual([
  expect.objectContaining({ key: 'catalog:3', source: 'catalog', sourceId: 3, portionLabel: '1 egg' }),
  expect.objectContaining({ key: 'saved:9', source: 'saved', sourceId: 9, portionLabel: '1 saved portion' }),
])

expect(scalePortionOption(savedOption, 1.5)).toEqual({
  quantity: 1.5,
  calories: 180,
  protein_g: 30,
  carbs_g: 12,
  fat_g: 1.5,
})
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `npm test -- __tests__/nutrition-saved-portions.test.ts`

Expected: FAIL because `@/lib/nutrition-portions` and `SavedFoodPortion` do not exist.

- [ ] **Step 3: Add the saved portion type and minimal helper implementation**

Add to `lib/types.ts`:

```ts
export interface SavedFoodPortion {
  id: number
  normalized_name: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  created_at: string
  updated_at: string
}
```

Create `lib/nutrition-portions.ts` with `PortionOption` fields `key`, `source`, `sourceId`, `name`, `portionLabel`, and the four macro values. Normalize by trimming, lowercasing, and collapsing internal whitespace. Catalog keys use `catalog:<id>` and saved keys use `saved:<id>`. Saved rows use `1 saved portion` as their portion label. Scaling rounds calories to an integer and macro grams to one decimal place.

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `npm test -- __tests__/nutrition-saved-portions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the helper slice**

```bash
git add lib/types.ts lib/nutrition-portions.ts __tests__/nutrition-saved-portions.test.ts
git commit -m "feat: model reusable nutrition portions"
```

### Task 2: Saved Portion Database Migration

**Files:**
- Create: `__tests__/nutrition-saved-portions-migration.test.ts`
- Create via CLI: the exact path printed by `supabase migration new save_nutrition_portions`

**Interfaces:**
- Consumes: `SavedFoodPortion` fields from Task 1.
- Produces: Data API table `public.saved_food_portion` with owner-only select/insert/update access.

- [ ] **Step 1: Write a failing migration contract test**

The test locates the migration whose filename ends in `_save_nutrition_portions.sql` and asserts its SQL contains:

```ts
expect(sql).toMatch(/create table public\.saved_food_portion/i)
expect(sql).toMatch(/unique\s*\(normalized_name\)/i)
expect(sql).toMatch(/enable row level security/i)
expect(sql).toMatch(/for select to authenticated using \(is_owner\(\)\)/i)
expect(sql).toMatch(/for insert to authenticated with check \(is_owner\(\)\)/i)
expect(sql).toMatch(/for update to authenticated using \(is_owner\(\)\) with check \(is_owner\(\)\)/i)
expect(sql).toMatch(/grant select, insert, update on table public\.saved_food_portion to authenticated/i)
expect(sql).toMatch(/grant usage, select on sequence public\.saved_food_portion_id_seq to authenticated/i)
```

- [ ] **Step 2: Run the migration contract test and verify RED**

Run: `npm test -- __tests__/nutrition-saved-portions-migration.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the migration through the installed Supabase CLI**

Run `supabase --version` and `supabase migration new save_nutrition_portions`. Use the exact generated path printed by the CLI.

- [ ] **Step 4: Add the complete schema and access controls**

The migration creates numeric macro checks, a normalized-name consistency check using `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`, timestamps, the existing `set_updated_at()` trigger, RLS policies for the authenticated owner, explicit table grants for select/insert/update, and explicit identity-sequence usage/select grants. No anon privileges or delete policy are added.

- [ ] **Step 5: Run the migration contract test and verify GREEN**

Run: `npm test -- __tests__/nutrition-saved-portions-migration.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify the migration with the local database**

Run: `supabase db reset`

Expected: all migrations apply successfully. If Docker/local Supabase is unavailable, record that environmental limitation and still run the contract test.

- [ ] **Step 7: Commit the migration slice**

```bash
git add __tests__/nutrition-saved-portions-migration.test.ts supabase/migrations/*_save_nutrition_portions.sql
git commit -m "feat: persist reusable nutrition portions"
```

### Task 3: Generic Food Dual Actions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `components/nutrition/GenericFoodAdder.tsx`
- Create: `__tests__/GenericFoodAdder.test.tsx`

**Interfaces:**
- Consumes: `ParsedGenericFood` and existing `parseGenericFoodDraft`.
- Produces: `onSubmit(food)` for log-only and `onSaveAndSubmit(food)` for log-and-save.

- [ ] **Step 1: Install the component-test dependencies and enable TSX tests**

Run: `npm install --save-dev @testing-library/react @testing-library/dom jsdom`

Update Vitest's include list to `['**/*.test.ts', '**/*.test.tsx']`. Individual component tests use `// @vitest-environment jsdom`, leaving the existing Node default intact.

- [ ] **Step 2: Write failing interaction tests**

Render `GenericFoodAdder`, fill the five labeled fields, and assert:

```ts
fireEvent.click(screen.getByRole('button', { name: 'add' }))
await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expectedFood))
expect(onSaveAndSubmit).not.toHaveBeenCalled()

fireEvent.click(screen.getByRole('button', { name: 'add & save portion' }))
await waitFor(() => expect(onSaveAndSubmit).toHaveBeenCalledWith(expectedFood))
expect(onSubmit).not.toHaveBeenCalled()
```

Add one test where `onSaveAndSubmit` resolves `false` and confirm the food-name input remains populated, plus one success assertion confirming it clears after a `true` result.

- [ ] **Step 3: Run the component test and verify RED**

Run: `npm test -- __tests__/GenericFoodAdder.test.tsx`

Expected: FAIL because the component has no `onSaveAndSubmit` prop or second button.

- [ ] **Step 4: Implement the two explicit actions**

Add `onSaveAndSubmit: (food: ParsedGenericFood) => Promise<boolean> | boolean`. Route both buttons through one `submit(callback)` function that parses once and clears only when its callback returns true. Keep **Add** as the accent action and render **Add & save portion** as a bordered secondary action. Both buttons remain disabled while saving or while the draft is invalid.

- [ ] **Step 5: Run the component and nutrition tests and verify GREEN**

Run: `npm test -- __tests__/GenericFoodAdder.test.tsx __tests__/nutrition-log-items.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the reusable form slice**

```bash
git add package.json package-lock.json vitest.config.ts components/nutrition/GenericFoodAdder.tsx __tests__/GenericFoodAdder.test.tsx
git commit -m "feat: add optional save action to manual foods"
```

### Task 4: Mobile Nutrition Integration

**Files:**
- Modify: `components/tabs/NutritionTab.tsx`

**Interfaces:**
- Consumes: `SavedFoodPortion`, `PortionOption`, `buildPortionOptions`, `savedFoodPortionPayload`, and `scalePortionOption`.
- Produces: mobile save-on-log and combined-dropdown behavior.

- [ ] **Step 1: Extend state and initialization**

Add `savedPortions` state, a `loadSavedPortions` callback that selects `*` ordered by `name`, and a fourth initialization query for `saved_food_portion`. Build `portionOptions` with `useMemo(() => buildPortionOptions(foods, savedPortions), [foods, savedPortions])`.

- [ ] **Step 2: Replace numeric catalog-only drafts with string option keys**

Rename `PortionDraft.foodItemId` to `portionKey`. Update the mobile `PortionAdder` to receive `options: PortionOption[]`, select by exact key, show `option.name · option.portionLabel`, and scale through `scalePortionOption`.

- [ ] **Step 3: Log both catalog and saved dropdown options**

For catalog options insert `source: 'catalog'`, the catalog `food_item_id`, and no custom name. For saved options insert `source: 'custom'`, `food_item_id: null`, and `custom_food_name: option.name`. Both paths use the scaled macro snapshot and preserve the existing quantity validation and meal creation flow.

- [ ] **Step 4: Add optional save-on-log**

Extend `logGenericFood` with `saveAsPortion = false`. When true, upsert `savedFoodPortionPayload(food)` with `{ onConflict: 'normalized_name' }` before writing the custom meal log. Refresh saved portions after a successful upsert. Return false and keep the form populated on either failure; if the upsert succeeded but logging failed, keep the saved portion and refreshed dropdown.

- [ ] **Step 5: Wire the two form callbacks**

Keep `onSubmit={(food) => logGenericFood(meal.name, food)}` and add `onSaveAndSubmit={(food) => logGenericFood(meal.name, food, true)}`. Treat both generic saving keys as disabled state.

- [ ] **Step 6: Verify the mobile integration**

Run: `npm test -- __tests__/nutrition-saved-portions.test.ts __tests__/GenericFoodAdder.test.tsx && npm run lint -- components/tabs/NutritionTab.tsx components/nutrition/GenericFoodAdder.tsx lib/nutrition-portions.ts`

Expected: tests pass and ESLint reports no errors.

- [ ] **Step 7: Commit the mobile slice**

```bash
git add components/tabs/NutritionTab.tsx
git commit -m "feat: use saved portions in mobile nutrition"
```

### Task 5: Desktop Nutrition Integration

**Files:**
- Modify: `components/desktop/NutritionDesktop.tsx`

**Interfaces:**
- Consumes: the same shared types and helpers as Task 4.
- Produces: desktop save-on-log and combined-dropdown behavior matching mobile.

- [ ] **Step 1: Mirror saved-portion loading and option mapping**

Add saved state, loader, initialization query, and memoized combined options using the same query fields and helper as mobile.

- [ ] **Step 2: Mirror option-key drafts and snapshot logging**

Update the desktop draft and `PortionAdder` to use `portionKey`, then branch catalog versus saved inserts exactly as mobile does while retaining desktop styling.

- [ ] **Step 3: Mirror log-and-save behavior and form wiring**

Upsert with `onConflict: 'normalized_name'`, refresh saved portions after success, preserve the form after failure, and wire both `GenericFoodAdder` callbacks.

- [ ] **Step 4: Verify the desktop integration**

Run: `npm test -- __tests__/nutrition-saved-portions.test.ts __tests__/GenericFoodAdder.test.tsx && npm run lint -- components/desktop/NutritionDesktop.tsx`

Expected: tests pass and ESLint reports no errors.

- [ ] **Step 5: Commit the desktop slice**

```bash
git add components/desktop/NutritionDesktop.tsx
git commit -m "feat: use saved portions in desktop nutrition"
```

### Task 6: Full Verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a release-ready saved-portions feature.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- __tests__/nutrition-saved-portions.test.ts __tests__/nutrition-saved-portions-migration.test.ts __tests__/GenericFoodAdder.test.tsx __tests__/nutrition-log-items.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run static verification**

Run: `npm run lint && npx tsc --noEmit`

Expected: no lint or TypeScript errors.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git status --short && git log --oneline -8`

Expected: no whitespace errors; only intentional feature changes are present; implementation commits are visible.

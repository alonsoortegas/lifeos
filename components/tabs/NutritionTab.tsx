'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'
import GenericFoodAdder from '@/components/nutrition/GenericFoodAdder'
import LoggedItemsList from '@/components/nutrition/LoggedItemsList'
import { createClient } from '@/lib/supabase'
import {
  calculateConsumed,
  calculateRemaining,
  EMPTY_MACRO_TOTALS,
  generateDefaultMeals,
  getDefaultNutritionDayType,
  getSubstitutions,
  loadNutritionTargetPlan,
  normalizedNutritionKey,
  nutritionDayPayload,
  scaleFood,
  STATIC_WHOOP_ENERGY_CALIBRATION,
  targetMapFromRows,
  type DefaultMealItem,
  type MacroTotals,
  type ParsedGenericFood,
  type WhoopEnergyCalibration,
} from '@/lib/nutrition'
import type {
  FoodItem,
  FoodSubstitutionGroup,
  FoodSubstitutionGroupItem,
  MealLog,
  MealTemplateName,
  NutritionDay,
  NutritionDayType,
} from '@/lib/types'

const supabase = createClient()

interface SubstitutionRow extends FoodSubstitutionGroupItem {
  food_substitution_group?: FoodSubstitutionGroup
}

type PortionDraft = {
  foodItemId: string
  quantity: string
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function macroValue(value: number): string {
  return `${Math.round(value)}`
}

function foodKey(mealName: MealTemplateName, foodItemId: number, label: string): string {
  return `${mealName}:${foodItemId}:${label}`
}

function findLoggedItem(logs: MealLog[], mealName: MealTemplateName, foodItemId: number, loggedMarker: string) {
  const log = logs.find((candidate) => candidate.meal_name === mealName)
  return log?.meal_log_item?.find(
    (item) =>
      item.substitution_group === loggedMarker ||
      (item.food_item_id === foodItemId && (item.substitution_group ?? '') === loggedMarker)
  )
}

export default function NutritionTab() {
  const dayType = getDefaultNutritionDayType()
  const [nutritionDay, setNutritionDay] = useState<NutritionDay | null>(null)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [substitutionRows, setSubstitutionRows] = useState<SubstitutionRow[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [expandedMeal, setExpandedMeal] = useState<MealTemplateName>('breakfast')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [portionDrafts, setPortionDrafts] = useState<Partial<Record<MealTemplateName, PortionDraft>>>({})
  const [loading, setLoading] = useState(true)
  const [mutError, setMutError] = useState<string | null>(null)
  const [targetMap, setTargetMap] = useState<Partial<Record<NutritionDayType, MacroTotals>>>({})

  const showMutError = (msg: string) => {
    setMutError(msg)
    setTimeout(() => setMutError(null), 3500)
  }

  const targets = useMemo(
    () => targetMap[dayType] ?? (nutritionDay ? {
      calories: nutritionDay.calories_target,
      protein_g: nutritionDay.protein_target,
      carbs_g: nutritionDay.carbs_target,
      fat_g: nutritionDay.fat_target,
    } : EMPTY_MACRO_TOTALS),
    [dayType, nutritionDay, targetMap],
  )
  const defaultMeals = useMemo(() => generateDefaultMeals(dayType), [dayType])
  const consumed = useMemo(() => calculateConsumed(mealLogs), [mealLogs])
  const remaining = useMemo(() => calculateRemaining(targets, consumed), [targets, consumed])

  const foodsByName = useMemo(() => {
    const map = new Map<string, FoodItem>()
    for (const food of foods) map.set(food.name, food)
    return map
  }, [foods])

  const substitutionIndex = useMemo(
    () =>
      substitutionRows
        .map((row) => ({
          groupName: row.food_substitution_group?.name ?? '',
          foodItemId: row.food_item_id,
          quantity: Number(row.quantity),
          label: row.label,
        }))
        .filter((row) => row.groupName),
    [substitutionRows]
  )

  const loadMealLogs = useCallback(async (dayId: number) => {
    const { data, error } = await supabase
      .from('meal_log')
      .select('*, meal_log_item(*, food_item(*))')
      .eq('nutrition_day_id', dayId)
      .order('logged_at', { ascending: true })

    if (error) {
      console.error('nutrition meal log load failed:', error.message)
      return
    }

    setMealLogs((data ?? []) as MealLog[])
  }, [])

  const ensureDay = useCallback(async (
    nextDayType: NutritionDayType,
    targetsOverride?: Partial<Record<NutritionDayType, MacroTotals>>,
    calibrationOverride?: WhoopEnergyCalibration,
  ) => {
    let nextTargets = targetsOverride?.[nextDayType]
    if (!nextTargets) {
      const { data } = await supabase
        .from('nutrition_day_types')
        .select('key, kcal_target, protein_g, carbs_g, fat_g')
        .eq('key', normalizedNutritionKey(nextDayType))
        .maybeSingle()
      nextTargets = data ? targetMapFromRows([data])[nextDayType] : undefined
    }
    if (!nextTargets) {
      showMutError('nutrition targets are unavailable')
      return null
    }
    const payload = {
      date: todayISO(),
      ...nutritionDayPayload(
        nextDayType,
        nextTargets,
        calibrationOverride ?? STATIC_WHOOP_ENERGY_CALIBRATION,
      ),
    }

    const { data, error } = await supabase
      .from('nutrition_day')
      .upsert(payload, { onConflict: 'date' })
      .select('*')
      .single()

    if (error) {
      console.error('nutrition day upsert failed:', error.message)
      showMutError('couldn\'t save day settings')
      return null
    }

    const day = data as NutritionDay
    setNutritionDay(day)
    return day
  }, [])

  // Init effect — runs once on mount. Loads static data and detects the day type from
  // any meals already logged today, so re-opening the tab doesn't reset the selection.
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)

      const [foodResult, substitutionResult, targetPlan] = await Promise.all([
        supabase.from('food_item').select('*').order('category').order('name'),
        supabase.from('food_substitution_group_item').select('*, food_substitution_group(*)').order('label'),
        loadNutritionTargetPlan(supabase),
      ])

      if (cancelled) return

      if (foodResult.error) console.error('nutrition food load failed:', foodResult.error.message)
      if (substitutionResult.error) console.error('nutrition substitution load failed:', substitutionResult.error.message)

      setFoods((foodResult.data ?? []) as FoodItem[])
      setSubstitutionRows((substitutionResult.data ?? []) as SubstitutionRow[])
      const loadedTargets = targetPlan.targets
      setTargetMap(loadedTargets)

      const day = await ensureDay(
        getDefaultNutritionDayType(),
        loadedTargets,
        targetPlan.calibration,
      )

      if (day && !cancelled) await loadMealLogs(day.id)
      if (!cancelled) setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [ensureDay, loadMealLogs]) // stable refs, effectively runs once

  const updatePortionDraft = (mealName: MealTemplateName, patch: Partial<PortionDraft>) => {
    setPortionDrafts((prev) => ({
      ...prev,
      [mealName]: {
        foodItemId: prev[mealName]?.foodItemId ?? '',
        quantity: prev[mealName]?.quantity ?? '1',
        ...patch,
      },
    }))
  }

  const getPortionDraft = (mealName: MealTemplateName): PortionDraft => ({
    foodItemId: portionDrafts[mealName]?.foodItemId ?? '',
    quantity: portionDrafts[mealName]?.quantity ?? '1',
  })

  const logFoodPortion = async (mealName: MealTemplateName) => {
    const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION))
    if (!day) return

    const draft = getPortionDraft(mealName)
    const food = foods.find((candidate) => candidate.id === Number(draft.foodItemId))
    const quantity = Number(draft.quantity)

    if (!food || !Number.isFinite(quantity) || quantity <= 0) {
      showMutError('choose a food and portion amount')
      return
    }

    const key = `portion:${mealName}:${food.id}`
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
        showMutError('couldn\'t create meal')
        setSavingKey(null)
        return
      }
      mealLog = { ...(data as MealLog), meal_log_item: [] }
    }

    const scaled = scaleFood(food, quantity)
    const { error } = await supabase.from('meal_log_item').insert({
      meal_log_id: mealLog.id,
      food_item_id: food.id,
      quantity: scaled.quantity,
      calories: scaled.calories,
      protein_g: scaled.protein_g,
      carbs_g: scaled.carbs_g,
      fat_g: scaled.fat_g,
      substitution_group: `extra:${food.name}`,
    })

    if (error) {
      console.error('meal portion insert failed:', error.message)
      showMutError('portion didn\'t save')
    } else {
      updatePortionDraft(mealName, { quantity: '1' })
    }
    await loadMealLogs(day.id)
    setSavingKey(null)
  }

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
        showMutError('couldn\'t create meal')
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
      showMutError('generic food didn\'t save')
      setSavingKey(null)
      return false
    }

    await loadMealLogs(day.id)
    setSavingKey(null)
    return true
  }

  const logTemplateItem = async (
    mealName: MealTemplateName,
    item: DefaultMealItem,
    override?: {
      food: FoodItem
      quantity: number
      label: string
      groupName?: string
    }
  ) => {
    const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION))
    if (!day) return

    const food = override?.food ?? foodsByName.get(item.foodName)
    if (!food) return

    const label = override?.label ?? item.label
    const key = foodKey(mealName, food.id, label)
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
        showMutError('couldn\'t create meal')
        setSavingKey(null)
        return
      }
      mealLog = { ...(data as MealLog), meal_log_item: [] }
    }

    const scaled = scaleFood(food, override?.quantity ?? item.quantity)
    const { error } = await supabase.from('meal_log_item').insert({
      meal_log_id: mealLog.id,
      food_item_id: food.id,
      quantity: scaled.quantity,
      calories: scaled.calories,
      protein_g: scaled.protein_g,
      carbs_g: scaled.carbs_g,
      fat_g: scaled.fat_g,
      substitution_group: override?.groupName ?? item.substitutionGroup ?? label,
    })

    if (error) {
      console.error('meal item insert failed:', error.message)
      showMutError('meal didn\'t save')
    }
    await loadMealLogs(day.id)
    setSavingKey(null)
  }

  const removeLoggedItem = async (itemId: number) => {
    if (!nutritionDay) return
    setSavingKey(`remove:${itemId}`)
    const { error } = await supabase.from('meal_log_item').delete().eq('id', itemId)
    if (error) {
      console.error('meal item delete failed:', error.message)
      showMutError('couldn\'t remove item')
    }
    await loadMealLogs(nutritionDay.id)
    setSavingKey(null)
  }

  const macroCards: { label: string; consumed: number; remaining: number; target: number; unit: string; color: string }[] = [
    { label: 'Calories', consumed: consumed.calories, remaining: remaining.calories, target: targets.calories, unit: 'kcal', color: '#00d26a' },
    { label: 'Protein', consumed: consumed.protein_g, remaining: remaining.protein_g, target: targets.protein_g, unit: 'g', color: '#2dd4bf' },
    { label: 'Carbs', consumed: consumed.carbs_g, remaining: remaining.carbs_g, target: targets.carbs_g, unit: 'g', color: '#f59e0b' },
    { label: 'Fat', consumed: consumed.fat_g, remaining: remaining.fat_g, target: targets.fat_g, unit: 'g', color: '#a78bfa' },
  ]

  return (
    <div className="px-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-[22px] font-bold text-[var(--text)]">Nutrition</h1>
        <div className="text-[var(--text-faint)] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          DAILY FUEL · TEMPLATES · SWAPS
        </div>
      </div>

      {/*
      Bulk target summary hidden for now. Restore this block if the mobile target card is useful again.
      <Card className="p-4">
        <div className="text-[var(--text-dim)] uppercase text-[11px] tracking-widest">Bulk target</div>
        <div className="mt-1 text-[15px] font-semibold text-[var(--text)]">Daily flat target</div>
        <div className="mt-2 text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          2700 kcal · 160p · 335c · 80f
        </div>
      </Card>
      */}

      <div className="grid grid-cols-2 gap-3">
        {macroCards.map((macro) => (
          <Card key={macro.label} className="p-4 space-y-2">
            <div className="text-[var(--text-dim)] uppercase text-[11px] tracking-widest">{macro.label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-[24px] font-bold leading-none text-[var(--text)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {macroValue(macro.consumed)}
              </span>
              <span className="text-xs text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                /{macro.target}{macro.unit}
              </span>
            </div>
            <ProgressBar value={macro.consumed} max={macro.target} color={macro.color} />
            <div className="text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {macro.remaining >= 0 ? `${macroValue(macro.remaining)}${macro.unit} left` : `${macroValue(Math.abs(macro.remaining))}${macro.unit} over`}
            </div>
          </Card>
        ))}
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          loading fuel plan…
        </div>
      )}

      {mutError && (
        <p className="text-xs text-red-400 mt-1" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {mutError}
        </p>
      )}

      {!loading && (
        <div className="space-y-2">
          <div className="text-[var(--text-faint)] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            · meals ·
          </div>

          {defaultMeals.map((meal) => {
            const mealLog = mealLogs.find((log) => log.meal_name === meal.name)
            const mealTotals = calculateConsumed(mealLog ? [mealLog] : [])
            const isExpanded = expandedMeal === meal.name

            return (
              <Card key={meal.name} className="overflow-hidden">
                <button
                  onClick={() => setExpandedMeal(isExpanded ? 'snack' : meal.name)}
                  className="flex min-h-[58px] w-full items-center justify-between px-4 py-3.5"
                >
                  <div className="text-left">
                    <div className="text-sm font-medium text-[var(--text)]">{meal.label}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {meal.defaultTime} · {macroValue(mealTotals.calories)}kcal · {macroValue(mealTotals.protein_g)}p · {macroValue(mealTotals.carbs_g)}c
                    </div>
                  </div>
                  <span className="text-lg leading-none text-[var(--text-faint)]">{isExpanded ? '-' : '+'}</span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-[var(--border)] px-4 py-3">
                    <PortionAdder
                      mealName={meal.name}
                      foods={foods}
                      draft={getPortionDraft(meal.name)}
                      savingKey={savingKey}
                      onChange={updatePortionDraft}
                      onSubmit={logFoodPortion}
                    />

                    <GenericFoodAdder
                      compact
                      saving={savingKey === `generic:${meal.name}`}
                      onSubmit={(food) => logGenericFood(meal.name, food)}
                    />

                    {meal.items.length === 0 && (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-faint)]">
                        No default fuel here for this day type.
                      </div>
                    )}
                    {meal.items.map((item) => {
                      const food = foodsByName.get(item.foodName)
                      if (!food) return null

                      const logged = findLoggedItem(mealLogs, meal.name, food.id, item.substitutionGroup ?? item.label)
                      const scaled = scaleFood(food, item.quantity)
                      const substitutions = getSubstitutions(food.id, foods, substitutionIndex, item.substitutionGroup)
                      const key = foodKey(meal.name, food.id, item.label)

                      return (
                        <div key={`${meal.name}-${item.label}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-[var(--text)]">{item.label}</div>
                              <div className="mt-0.5 text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                                {scaled.calories}kcal · {scaled.protein_g}p · {scaled.carbs_g}c · {scaled.fat_g}f
                              </div>
                            </div>

                            {logged ? (
                              <button
                                onClick={() => removeLoggedItem(logged.id)}
                                className="rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[var(--text-dim)] transition-transform active:scale-[0.94]"
                                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                              >
                                ate
                              </button>
                            ) : (
                              <button
                                onClick={() => logTemplateItem(meal.name, item)}
                                disabled={savingKey === key}
                                className="btn-accent rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest"
                                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                              >
                                ate this
                              </button>
                            )}
                          </div>

                          {substitutions.length > 0 && !logged && (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                              {substitutions.slice(0, 5).map((sub) => {
                                const subFood = foods.find((candidate) => candidate.id === sub.foodItemId)
                                if (!subFood) return null
                                return (
                                  <button
                                    key={`${sub.groupName}-${sub.foodItemId}-${sub.label}`}
                                    onClick={() =>
                                      logTemplateItem(meal.name, item, {
                                        food: subFood,
                                        quantity: sub.quantity,
                                        label: sub.label,
                                        groupName: sub.groupName,
                                      })
                                    }
                                    className="flex-shrink-0 rounded-full border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-1.5 text-left text-[11px] text-[var(--text-dim)] transition-transform active:scale-[0.94]"
                                    style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                                  >
                                    swap: {sub.label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <LoggedItemsList
        mealLogs={mealLogs}
        totals={consumed}
        savingKey={savingKey}
        onRemove={removeLoggedItem}
      />
      <div className="h-4" />
    </div>
  )
}

function PortionAdder({
  mealName,
  foods,
  draft,
  savingKey,
  onChange,
  onSubmit,
}: {
  mealName: MealTemplateName
  foods: FoodItem[]
  draft: PortionDraft
  savingKey: string | null
  onChange: (mealName: MealTemplateName, patch: Partial<PortionDraft>) => void
  onSubmit: (mealName: MealTemplateName) => void
}) {
  const selectedFood = foods.find((food) => food.id === Number(draft.foodItemId))
  const quantity = Number(draft.quantity)
  const scaled = selectedFood && Number.isFinite(quantity) && quantity > 0 ? scaleFood(selectedFood, quantity) : null
  const isSaving = selectedFood ? savingKey === `portion:${mealName}:${selectedFood.id}` : false

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--ink-02)] p-3">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        add portion
      </div>
      <div className="grid grid-cols-[1fr_86px] gap-2">
        <select
          value={draft.foodItemId}
          onChange={(event) => onChange(mealName, { foodItemId: event.target.value })}
          className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-2 text-sm text-[var(--text)]"
        >
          <option value="">Choose food</option>
          {foods.map((food) => (
            <option key={food.id} value={food.id}>
              {food.name} · {food.portion_label}
            </option>
          ))}
        </select>
        <input
          value={draft.quantity}
          onChange={(event) => onChange(mealName, { quantity: event.target.value })}
          inputMode="decimal"
          type="number"
          min="0.25"
          step="0.25"
          className="rounded-xl border border-[var(--border)] bg-[var(--ink-04)] px-2.5 py-2 text-sm text-[var(--text)]"
          aria-label="Portions"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          {scaled ? `${scaled.calories}kcal · ${scaled.protein_g}p · ${scaled.carbs_g}c · ${scaled.fat_g}f` : 'select a food item'}
        </div>
        <button
          onClick={() => onSubmit(mealName)}
          disabled={!selectedFood || isSaving}
          className="btn-accent flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
        >
          add
        </button>
      </div>
    </div>
  )
}

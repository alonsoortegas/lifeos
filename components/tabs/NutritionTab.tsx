'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'
import { createClient } from '@/lib/supabase'
import {
  calculateConsumed,
  calculateRemaining,
  generateDefaultMeals,
  getDailyTargets,
  getSubstitutions,
  MEAL_LABELS,
  scaleFood,
  suggestNextFood,
  type DefaultMealItem,
  type MacroTotals,
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

const DAY_TYPES: { value: NutritionDayType; label: string }[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'rest', label: 'Rest' },
]

interface SubstitutionRow extends FoodSubstitutionGroupItem {
  food_substitution_group?: FoodSubstitutionGroup
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
  const [dayType, setDayType] = useState<NutritionDayType>('moderate')
  const [nutritionDay, setNutritionDay] = useState<NutritionDay | null>(null)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [substitutionRows, setSubstitutionRows] = useState<SubstitutionRow[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [expandedMeal, setExpandedMeal] = useState<MealTemplateName>('breakfast')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mutError, setMutError] = useState<string | null>(null)

  const showMutError = (msg: string) => {
    setMutError(msg)
    setTimeout(() => setMutError(null), 3500)
  }

  const targets = useMemo(() => getDailyTargets(dayType, 'cut'), [dayType])
  const defaultMeals = useMemo(() => generateDefaultMeals(dayType), [dayType])
  const consumed = useMemo(() => calculateConsumed(mealLogs), [mealLogs])
  const remaining = useMemo(() => calculateRemaining(targets, consumed), [targets, consumed])
  const suggestion = useMemo(() => suggestNextFood(remaining, dayType), [remaining, dayType])

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

  const ensureDay = useCallback(async (nextDayType: NutritionDayType) => {
    const nextTargets = getDailyTargets(nextDayType, 'cut')
    const payload = {
      date: todayISO(),
      day_type: nextDayType,
      goal: 'cut',
      calories_target: nextTargets.calories,
      protein_target: nextTargets.protein_g,
      carbs_target: nextTargets.carbs_g,
      fat_target: nextTargets.fat_g,
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

      const [foodResult, substitutionResult, existingDayResult] = await Promise.all([
        supabase.from('food_item').select('*').order('category').order('name'),
        supabase.from('food_substitution_group_item').select('*, food_substitution_group(*)').order('label'),
        supabase.from('nutrition_day').select('*').eq('date', todayISO()).maybeSingle(),
      ])

      if (cancelled) return

      if (foodResult.error) console.error('nutrition food load failed:', foodResult.error.message)
      if (substitutionResult.error) console.error('nutrition substitution load failed:', substitutionResult.error.message)

      setFoods((foodResult.data ?? []) as FoodItem[])
      setSubstitutionRows((substitutionResult.data ?? []) as SubstitutionRow[])

      let day: NutritionDay | null = (existingDayResult.data as NutritionDay) ?? null

      if (day) {
        // If any meals have been logged today, lock in the day type from the existing row.
        const { data: logCheck } = await supabase
          .from('meal_log')
          .select('id')
          .eq('nutrition_day_id', day.id)
          .limit(1)

        if (logCheck && logCheck.length > 0) {
          setDayType(day.day_type as NutritionDayType)
        }

        setNutritionDay(day)
      } else {
        // First open of the day — create the row with the current default.
        day = await ensureDay('moderate')
      }

      if (day && !cancelled) await loadMealLogs(day.id)
      if (!cancelled) setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [ensureDay, loadMealLogs]) // stable refs, effectively runs once

  const changeDayType = async (nextDayType: NutritionDayType) => {
    setDayType(nextDayType)
    setExpandedMeal(generateDefaultMeals(nextDayType)[0]?.name ?? 'breakfast')
    const day = await ensureDay(nextDayType)
    if (day) await loadMealLogs(day.id)
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
    const day = nutritionDay ?? (await ensureDay(dayType))
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
        <h1 className="text-[22px] font-bold text-[#ededed]">Nutrition</h1>
        <div className="text-[#555] text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          DAILY FUEL · TEMPLATES · SWAPS
        </div>
      </div>

      <div className="flex gap-2">
        {DAY_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => changeDayType(type.value)}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
              dayType === type.value
                ? 'border-[#00d26a] bg-[#00d26a] text-[#0e0e0e]'
                : 'border-[#2a2a2a] bg-[#1a1a1a] text-[#888]'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {macroCards.map((macro) => (
          <Card key={macro.label} className="p-4 space-y-2">
            <div className="text-[#888] uppercase text-[11px] tracking-widest">{macro.label}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-[24px] font-bold leading-none text-[#ededed]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                {macroValue(macro.consumed)}
              </span>
              <span className="text-xs text-[#555]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                /{macro.target}{macro.unit}
              </span>
            </div>
            <ProgressBar value={macro.consumed} max={macro.target} color={macro.color} />
            <div className="text-[11px] text-[#555]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              {macro.remaining >= 0 ? `${macroValue(macro.remaining)}${macro.unit} left` : `${macroValue(Math.abs(macro.remaining))}${macro.unit} over`}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="text-[#555] text-[11px] uppercase tracking-widest" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
          · next move ·
        </div>
        <div className="mt-1 text-sm text-[#ededed]">{suggestion}</div>
      </Card>

      {loading && (
        <div className="py-8 text-center text-sm text-[#555]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
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
          <div className="text-[#555] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
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
                    <div className="text-sm font-medium text-[#ededed]">{meal.label}</div>
                    <div className="mt-0.5 text-[11px] text-[#555]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                      {meal.defaultTime} · {macroValue(mealTotals.calories)}kcal · {macroValue(mealTotals.protein_g)}p · {macroValue(mealTotals.carbs_g)}c
                    </div>
                  </div>
                  <span className="text-lg leading-none text-[#555]">{isExpanded ? '-' : '+'}</span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-[#2a2a2a] px-4 py-3">
                    {meal.items.length === 0 && (
                      <div className="rounded-lg border border-[#2a2a2a] bg-[#151515] p-3 text-sm text-[#555]">
                        No default fuel here for this day type.
                      </div>
                    )}
                    {meal.items.map((item) => {
                      const food = foodsByName.get(item.foodName)
                      if (!food) return null

                      const logged = findLoggedItem(mealLogs, meal.name, food.id, item.substitutionGroup ?? item.label)
                      const scaled = scaleFood(food, item.quantity)
                      const substitutions = getSubstitutions(food.id, foods, substitutionIndex)
                      const key = foodKey(meal.name, food.id, item.label)

                      return (
                        <div key={`${meal.name}-${item.label}`} className="rounded-lg border border-[#2a2a2a] bg-[#151515] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-[#ededed]">{item.label}</div>
                              <div className="mt-0.5 text-[11px] text-[#555]" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
                                {scaled.calories}kcal · {scaled.protein_g}p · {scaled.carbs_g}c · {scaled.fat_g}f
                              </div>
                            </div>

                            {logged ? (
                              <button
                                onClick={() => removeLoggedItem(logged.id)}
                                className="rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#888]"
                                style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
                              >
                                ate
                              </button>
                            ) : (
                              <button
                                onClick={() => logTemplateItem(meal.name, item)}
                                disabled={savingKey === key}
                                className="rounded-md bg-[#00d26a] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#0e0e0e] disabled:opacity-50"
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
                                    className="flex-shrink-0 rounded-md border border-[#2a2a2a] px-2.5 py-1.5 text-left text-[11px] text-[#888]"
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

      <LoggedSummary mealLogs={mealLogs} totals={consumed} />
      <div className="h-4" />
    </div>
  )
}

function LoggedSummary({ mealLogs, totals }: { mealLogs: MealLog[]; totals: MacroTotals }) {
  const loggedItems = mealLogs.flatMap((log) =>
    (log.meal_log_item ?? []).map((item) => ({
      ...item,
      mealName: MEAL_LABELS[log.meal_name],
    }))
  )

  if (loggedItems.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-[#555] text-[11px] tracking-widest uppercase" style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
        · consumed ·
      </div>
      <Card className="p-4">
        <div className="text-sm text-[#ededed]">
          {macroValue(totals.calories)}kcal · {macroValue(totals.protein_g)}g protein · {macroValue(totals.carbs_g)}g carbs · {macroValue(totals.fat_g)}g fat
        </div>
        <div className="mt-3 space-y-1.5">
          {loggedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 text-[11px] text-[#555]"
              style={{ fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
            >
              <span className="truncate">
                {item.mealName} · {item.food_item?.name ?? 'food'}
              </span>
              <span className="flex-shrink-0">{macroValue(Number(item.protein_g))}p/{macroValue(Number(item.carbs_g))}c</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

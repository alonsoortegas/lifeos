'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import GenericFoodAdder from '@/components/nutrition/GenericFoodAdder'
import { createClient } from '@/lib/supabase'
import {
  calculateConsumed,
  calculateRemaining,
  EMPTY_MACRO_TOTALS,
  generateDefaultMeals,
  getDefaultNutritionDayType,
  getSubstitutions,
  loadNutritionTargetPlan,
  MEAL_LABELS,
  loggedMealItemLabel,
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
import {
  buildPortionOptions,
  portionMealLogItemPayload,
  savedFoodPortionPayload,
  scalePortionOption,
  type PortionOption,
} from '@/lib/nutrition-portions'
import type {
  FoodItem,
  FoodSubstitutionGroup,
  FoodSubstitutionGroupItem,
  MealLog,
  MealTemplateName,
  NutritionDay,
  NutritionDayType,
  SavedFoodPortion,
} from '@/lib/types'

const supabase = createClient()

const MACRO_META: { key: keyof MacroTotals; label: string; unit: string; color: string }[] = [
  { key: 'calories',  label: 'Calories', unit: 'kcal', color: '#00d26a'  },
  { key: 'protein_g', label: 'Protein',  unit: 'g',    color: '#2dd4bf'  },
  { key: 'carbs_g',   label: 'Carbs',    unit: 'g',    color: '#f59e0b'  },
  { key: 'fat_g',     label: 'Fat',      unit: 'g',    color: '#a78bfa'  },
]

interface SubstitutionRow extends FoodSubstitutionGroupItem {
  food_substitution_group?: FoodSubstitutionGroup
}

type PortionDraft = {
  portionKey: string
  quantity: string
}

function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function macroVal(v: number): string { return `${Math.round(v)}` }
function foodKey(mealName: MealTemplateName, foodItemId: number, label: string): string {
  return `${mealName}:${foodItemId}:${label}`
}
function findLoggedItem(logs: MealLog[], mealName: MealTemplateName, foodItemId: number, marker: string) {
  const log = logs.find(l => l.meal_name === mealName)
  return log?.meal_log_item?.find(i => i.substitution_group === marker || (i.food_item_id === foodItemId && (i.substitution_group ?? '') === marker))
}

const mono = 'var(--font-jetbrains-mono, monospace)'
const sans = 'var(--font-inter-tight, sans-serif)'

export default function NutritionDesktop({
  initialAction,
  onInitialActionConsumed,
}: {
  initialAction?: string
  onInitialActionConsumed?: () => void
}) {
  const dayType = getDefaultNutritionDayType()
  const [nutritionDay, setNutritionDay] = useState<NutritionDay | null>(null)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [savedPortions, setSavedPortions] = useState<SavedFoodPortion[]>([])
  const [substitutionRows, setSubstitutionRows] = useState<SubstitutionRow[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [expandedMeals, setExpandedMeals] = useState<Set<MealTemplateName>>(new Set(['breakfast']))
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [portionDrafts, setPortionDrafts] = useState<Partial<Record<MealTemplateName, PortionDraft>>>({})
  const [loading, setLoading] = useState(true)
  const [targetMap, setTargetMap] = useState<Partial<Record<NutritionDayType, MacroTotals>>>({})

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
  const portionOptions = useMemo(
    () => buildPortionOptions(foods, savedPortions),
    [foods, savedPortions],
  )

  const foodsByName = useMemo(() => {
    const map = new Map<string, FoodItem>()
    for (const food of foods) map.set(food.name, food)
    return map
  }, [foods])

  const substitutionIndex = useMemo(() =>
    substitutionRows.map(row => ({ groupName: row.food_substitution_group?.name ?? '', foodItemId: row.food_item_id, quantity: Number(row.quantity), label: row.label })).filter(r => r.groupName),
  [substitutionRows])

  const loadMealLogs = useCallback(async (dayId: number) => {
    const { data, error } = await supabase.from('meal_log').select('*, meal_log_item(*, food_item(*))').eq('nutrition_day_id', dayId).order('logged_at', { ascending: true })
    if (error) { console.error('nutrition meal log load failed:', error.message); return }
    setMealLogs((data ?? []) as MealLog[])
  }, [])

  const loadSavedPortions = useCallback(async () => {
    const { data, error } = await supabase.from('saved_food_portion').select('*').order('name')
    if (error) { console.error('saved nutrition portion load failed:', error.message); return }
    setSavedPortions((data ?? []) as SavedFoodPortion[])
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
    if (!nextTargets) return null
    const payload = {
      date: todayISO(),
      ...nutritionDayPayload(
        nextDayType,
        nextTargets,
        calibrationOverride ?? STATIC_WHOOP_ENERGY_CALIBRATION,
      ),
    }
    const { data, error } = await supabase.from('nutrition_day').upsert(payload, { onConflict: 'date' }).select('*').single()
    if (error) { console.error('nutrition day upsert failed:', error.message); return null }
    const day = data as NutritionDay; setNutritionDay(day); return day
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [foodResult, savedPortionResult, subResult, targetPlan] = await Promise.all([
        supabase.from('food_item').select('*').order('category').order('name'),
        supabase.from('saved_food_portion').select('*').order('name'),
        supabase.from('food_substitution_group_item').select('*, food_substitution_group(*)').order('label'),
        loadNutritionTargetPlan(supabase),
      ])
      if (cancelled) return
      const loadedTargets = targetPlan.targets
      setTargetMap(loadedTargets)
      const day = await ensureDay(dayType, loadedTargets, targetPlan.calibration)
      setFoods((foodResult.data ?? []) as FoodItem[])
      if (savedPortionResult.error) console.error('saved nutrition portion load failed:', savedPortionResult.error.message)
      setSavedPortions((savedPortionResult.data ?? []) as SavedFoodPortion[])
      setSubstitutionRows((subResult.data ?? []) as SubstitutionRow[])
      if (day) await loadMealLogs(day.id)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [dayType, ensureDay, loadMealLogs])

  // Expand all meals when launched via "Log a meal" command
  useEffect(() => {
    if (initialAction !== 'log-meal' || loading || defaultMeals.length === 0) return

    const id = window.setTimeout(() => {
      setExpandedMeals(new Set(defaultMeals.map(m => m.name as MealTemplateName)))
      onInitialActionConsumed?.()
    }, 0)

    return () => window.clearTimeout(id)
  }, [initialAction, loading, defaultMeals, onInitialActionConsumed])

  const logTemplateItem = async (mealName: MealTemplateName, item: DefaultMealItem, override?: { food: FoodItem; quantity: number; label: string; groupName?: string }) => {
    const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION)); if (!day) return
    const food = override?.food ?? foodsByName.get(item.foodName); if (!food) return
    const label = override?.label ?? item.label
    const key = foodKey(mealName, food.id, label)
    setSavingKey(key)
    let mealLog = mealLogs.find(log => log.meal_name === mealName)
    if (!mealLog) {
      const { data, error } = await supabase.from('meal_log').insert({ nutrition_day_id: day.id, meal_name: mealName }).select('*').single()
      if (error) { console.error('meal log create failed:', error.message); setSavingKey(null); return }
      mealLog = { ...(data as MealLog), meal_log_item: [] }
    }
    const scaled = scaleFood(food, override?.quantity ?? item.quantity)
    await supabase.from('meal_log_item').insert({ meal_log_id: mealLog.id, food_item_id: food.id, quantity: scaled.quantity, calories: scaled.calories, protein_g: scaled.protein_g, carbs_g: scaled.carbs_g, fat_g: scaled.fat_g, substitution_group: override?.groupName ?? item.substitutionGroup ?? label })
    await loadMealLogs(day.id); setSavingKey(null)
  }

  const updatePortionDraft = (mealName: MealTemplateName, patch: Partial<PortionDraft>) => {
    setPortionDrafts(prev => ({
      ...prev,
      [mealName]: {
        portionKey: prev[mealName]?.portionKey ?? '',
        quantity: prev[mealName]?.quantity ?? '1',
        ...patch,
      },
    }))
  }

  const getPortionDraft = (mealName: MealTemplateName): PortionDraft => ({
    portionKey: portionDrafts[mealName]?.portionKey ?? '',
    quantity: portionDrafts[mealName]?.quantity ?? '1',
  })

  const logFoodPortion = async (mealName: MealTemplateName) => {
    const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION)); if (!day) return
    const draft = getPortionDraft(mealName)
    const option = portionOptions.find(candidate => candidate.key === draft.portionKey)
    const quantity = Number(draft.quantity)
    if (!option || !Number.isFinite(quantity) || quantity <= 0) return

    const key = `portion:${mealName}:${option.key}`
    setSavingKey(key)

    let mealLog = mealLogs.find(log => log.meal_name === mealName)
    if (!mealLog) {
      const { data, error } = await supabase.from('meal_log').insert({ nutrition_day_id: day.id, meal_name: mealName }).select('*').single()
      if (error) { console.error('meal log create failed:', error.message); setSavingKey(null); return }
      mealLog = { ...(data as MealLog), meal_log_item: [] }
    }

    const { error } = await supabase.from('meal_log_item').insert({
      meal_log_id: mealLog.id,
      ...portionMealLogItemPayload(option, quantity),
    })
    if (error) console.error('meal portion insert failed:', error.message)
    else updatePortionDraft(mealName, { quantity: '1' })
    await loadMealLogs(day.id); setSavingKey(null)
  }

  const logGenericFood = async (
    mealName: MealTemplateName,
    food: ParsedGenericFood,
    saveAsPortion = false,
  ): Promise<boolean> => {
    const day = nutritionDay ?? (await ensureDay(dayType, targetMap, STATIC_WHOOP_ENERGY_CALIBRATION)); if (!day) return false
    const key = `${saveAsPortion ? 'generic-save' : 'generic'}:${mealName}`
    setSavingKey(key)

    if (saveAsPortion) {
      const { error } = await supabase
        .from('saved_food_portion')
        .upsert(savedFoodPortionPayload(food), { onConflict: 'normalized_name' })

      if (error) {
        console.error('saved nutrition portion upsert failed:', error.message)
        setSavingKey(null)
        return false
      }

      await loadSavedPortions()
    }

    let mealLog = mealLogs.find(log => log.meal_name === mealName)
    if (!mealLog) {
      const { data, error } = await supabase.from('meal_log').insert({ nutrition_day_id: day.id, meal_name: mealName }).select('*').single()
      if (error) { console.error('meal log create failed:', error.message); setSavingKey(null); return false }
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
    if (error) { console.error('generic food insert failed:', error.message); setSavingKey(null); return false }

    await loadMealLogs(day.id); setSavingKey(null); return true
  }

  const removeLoggedItem = async (itemId: number) => {
    if (!nutritionDay) return
    setSavingKey(`remove:${itemId}`)
    await supabase.from('meal_log_item').delete().eq('id', itemId)
    await loadMealLogs(nutritionDay.id); setSavingKey(null)
  }

  const toggleMeal = (name: MealTemplateName) => {
    setExpandedMeals(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  }

  const loggedMealsCount = mealLogs.filter(log => (log.meal_log_item?.length ?? 0) > 0).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 28px 24px', gap: 14, overflow: 'hidden', fontFamily: sans }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>DAILY FUEL · TEMPLATES · SWAPS</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '3px 0 0', letterSpacing: '-0.01em' }}>Nutrition</h1>
        </div>
        {/*
        Bulk target summary hidden for now. Restore this block if the header target badge is useful again.
        <div style={{ padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, minWidth: 190 }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Bulk target</div>
          <div style={{ marginTop: 3, fontFamily: mono, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            2700 kcal · 160p · 335c · 80f
          </div>
        </div>
        */}
      </div>

      {/* Two columns */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.85fr 1.3fr', gap: 18, minHeight: 0 }}>

        {/* LEFT — macros + consumed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
          {/* Macros label */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border)', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Macros · today</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-faint)' }}>{macroVal(consumed.calories)}/{targets.calories} kcal</span>
          </div>

          {/* Macro cards 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
            {MACRO_META.map(m => {
              const consumedVal = consumed[m.key]
              const targetVal = targets[m.key as keyof typeof targets] as number
              const remainingVal = remaining[m.key]
              const pct = Math.min(1, consumedVal / (targetVal || 1))
              const over = remainingVal < 0

              // Simple delta heuristic
              const deltaPct = targetVal > 0 ? (consumedVal / targetVal) * 100 : 0
              const deltaTone = deltaPct >= 85 ? 'good' : deltaPct >= 50 ? 'neutral' : 'warn'
              const deltaColor = deltaTone === 'good' ? '#00d26a' : deltaTone === 'warn' ? '#f59e0b' : 'var(--text-dim)'

              return (
                <div key={m.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{m.label}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>{Math.round(pct * 100)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em' }}>{macroVal(consumedVal)}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>/ {macroVal(targetVal)}{m.unit}</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: m.color, borderRadius: 2 }} />
                  </div>
                  {/* Delta row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: deltaColor, fontWeight: 700 }}>
                      {Math.round(pct * 100)}%
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>
                      {over ? `${macroVal(Math.abs(remainingVal))}${m.unit} over` : `${macroVal(remainingVal)}${m.unit} left`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Consumed summary */}
          {mealLogs.flatMap(l => l.meal_log_item ?? []).length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Consumed</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-faint)' }}>{mealLogs.flatMap(l => l.meal_log_item ?? []).length} items</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--text)', marginBottom: 10 }}>
                {macroVal(consumed.calories)} kcal · {macroVal(consumed.protein_g)}g protein · {macroVal(consumed.carbs_g)}g carbs · {macroVal(consumed.fat_g)}g fat
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {mealLogs.flatMap(log => (log.meal_log_item ?? []).map(item => ({
                  mealName: MEAL_LABELS[log.meal_name], item,
                }))).map(({ mealName, item }) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{mealName} · {loggedMealItemLabel(item)}</span>
                    <span style={{ flexShrink: 0 }}>{macroVal(Number(item.protein_g))}p/{macroVal(Number(item.carbs_g))}c</span>
                    <button
                      type="button"
                      onClick={() => removeLoggedItem(item.id)}
                      disabled={savingKey === `remove:${item.id}`}
                      style={{ flexShrink: 0, fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'transparent', padding: '2px 7px', borderRadius: 999, cursor: savingKey === `remove:${item.id}` ? 'default' : 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: savingKey === `remove:${item.id}` ? 0.55 : 1 }}
                    >
                      delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — meals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border)', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Meals</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-faint)' }}>{loggedMealsCount} of {defaultMeals.length} meals logged</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: mono, fontSize: 12, color: 'var(--text-faint)' }}>loading fuel plan…</div>
            ) : defaultMeals.map(meal => {
              const mealLog = mealLogs.find(log => log.meal_name === meal.name)
              const mealTotals = calculateConsumed(mealLog ? [mealLog] : [])
              const isExpanded = expandedMeals.has(meal.name)
              const isLogged = (mealLog?.meal_log_item?.length ?? 0) > 0

              return (
                <div key={meal.name} style={{ background: 'var(--surface)', border: `1px solid ${isLogged ? 'var(--border)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleMeal(meal.name)}
                    style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: isLogged ? 'var(--text-faint)' : 'var(--border)', border: isLogged ? 'none' : '1px solid var(--border-hi)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{meal.label}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)' }}>{meal.defaultTime}</span>
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: isLogged ? 'var(--text-dim)' : 'var(--text-faint)', marginTop: 2 }}>
                        {isLogged ? `${macroVal(mealTotals.calories)} kcal · ${macroVal(mealTotals.protein_g)}p · ${macroVal(mealTotals.carbs_g)}c` : `${meal.items.length} items`}
                      </div>
                    </div>
                    <span style={{ fontFamily: mono, color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}>{isExpanded ? '−' : '+'}</span>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <PortionAdder
                        mealName={meal.name}
                        options={portionOptions}
                        draft={getPortionDraft(meal.name)}
                        savingKey={savingKey}
                        onChange={updatePortionDraft}
                        onSubmit={logFoodPortion}
                      />

                      <GenericFoodAdder
                        compact
                        saving={
                          savingKey === `generic:${meal.name}` ||
                          savingKey === `generic-save:${meal.name}`
                        }
                        onSubmit={(food) => logGenericFood(meal.name, food)}
                        onSaveAndSubmit={(food) => logGenericFood(meal.name, food, true)}
                      />

                      {meal.items.length === 0 && (
                        <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-faint)' }}>No items for this day type.</div>
                      )}
                      {meal.items.map(item => {
                        const food = foodsByName.get(item.foodName); if (!food) return null
                        const logged = findLoggedItem(mealLogs, meal.name, food.id, item.substitutionGroup ?? item.label)
                        const scaled = scaleFood(food, item.quantity)
                        const substitutions = getSubstitutions(food.id, foods, substitutionIndex, item.substitutionGroup)
                        const key = foodKey(meal.name, food.id, item.label)

                        return (
                          <div key={`${meal.name}-${item.label}`} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 12.5, color: logged ? 'var(--text-faint)' : 'var(--text)', textDecoration: logged ? 'line-through' : 'none', opacity: logged ? 0.7 : 1 }}>{item.label}</div>
                                <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                                  {scaled.calories} kcal · {scaled.protein_g}p · {scaled.carbs_g}c · {scaled.fat_g}f
                                </div>
                              </div>
                              {logged ? (
                                <button onClick={() => removeLoggedItem(logged.id)} style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'transparent', padding: '3px 9px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>ate</button>
                              ) : (
                                <button onClick={() => logTemplateItem(meal.name, item)} disabled={savingKey === key} className="btn-accent" style={{ fontFamily: mono, fontSize: 10, border: 'none', padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>ate this</button>
                              )}
                            </div>
                            {substitutions.length > 0 && !logged && (
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                                {substitutions.slice(0, 4).map(sub => {
                                  const subFood = foods.find(f => f.id === sub.foodItemId); if (!subFood) return null
                                  return (
                                    <button key={`${sub.groupName}-${sub.foodItemId}-${sub.label}`} onClick={() => logTemplateItem(meal.name, item, { food: subFood, quantity: sub.quantity, label: sub.label, groupName: sub.groupName })} style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dim)', border: '1px solid var(--border)', background: 'transparent', padding: '2px 7px', borderRadius: 5, cursor: 'pointer' }}>
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
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PortionAdder({
  mealName,
  options,
  draft,
  savingKey,
  onChange,
  onSubmit,
}: {
  mealName: MealTemplateName
  options: PortionOption[]
  draft: PortionDraft
  savingKey: string | null
  onChange: (mealName: MealTemplateName, patch: Partial<PortionDraft>) => void
  onSubmit: (mealName: MealTemplateName) => void
}) {
  const selectedOption = options.find(option => option.key === draft.portionKey)
  const quantity = Number(draft.quantity)
  const scaled = selectedOption && Number.isFinite(quantity) && quantity > 0
    ? scalePortionOption(selectedOption, quantity)
    : null
  const isSaving = selectedOption
    ? savingKey === `portion:${mealName}:${selectedOption.key}`
    : false

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8, alignItems: 'center' }}>
      <select
        value={draft.portionKey}
        onChange={event => onChange(mealName, { portionKey: event.target.value })}
        style={{ minWidth: 0, height: 32, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', padding: '0 9px', fontSize: 12, fontFamily: sans }}
      >
        <option value="">Add portion</option>
        {options.map(option => (
          <option key={option.key} value={option.key}>{option.name} · {option.portionLabel}</option>
        ))}
      </select>
      <input
        value={draft.quantity}
        onChange={event => onChange(mealName, { quantity: event.target.value })}
        type="number"
        min="0.25"
        step="0.25"
        aria-label="Portions"
        style={{ height: 32, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', padding: '0 9px', fontSize: 12, fontFamily: mono }}
      />
      <button
        onClick={() => onSubmit(mealName)}
        disabled={!selectedOption || isSaving}
        className="btn-accent"
        style={{ height: 32, border: 'none', borderRadius: 999, padding: '0 12px', fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: selectedOption ? 'pointer' : 'default' }}
      >
        add
      </button>
      <div style={{ gridColumn: '1 / -1', fontFamily: mono, fontSize: 10, color: 'var(--text-faint)', minHeight: 13 }}>
        {scaled ? `${scaled.calories} kcal · ${scaled.protein_g}p · ${scaled.carbs_g}c · ${scaled.fat_g}f` : 'Select a food, then set how many standard portions you ate.'}
      </div>
    </div>
  )
}

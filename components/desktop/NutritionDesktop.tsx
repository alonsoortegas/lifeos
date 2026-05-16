'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

const DAY_TYPE_OPTIONS: { value: NutritionDayType; label: string }[] = [
  { value: 'hard',     label: 'HARD' },
  { value: 'moderate', label: 'MODERATE' },
  { value: 'rest',     label: 'REST' },
]

const MACRO_META: { key: keyof MacroTotals; label: string; unit: string; color: string }[] = [
  { key: 'calories',  label: 'Calories', unit: 'kcal', color: '#00d26a'  },
  { key: 'protein_g', label: 'Protein',  unit: 'g',    color: '#2dd4bf'  },
  { key: 'carbs_g',   label: 'Carbs',    unit: 'g',    color: '#f59e0b'  },
  { key: 'fat_g',     label: 'Fat',      unit: 'g',    color: '#a78bfa'  },
]

interface SubstitutionRow extends FoodSubstitutionGroupItem {
  food_substitution_group?: FoodSubstitutionGroup
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
  const [dayType, setDayType] = useState<NutritionDayType>('hard')
  const [nutritionDay, setNutritionDay] = useState<NutritionDay | null>(null)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [substitutionRows, setSubstitutionRows] = useState<SubstitutionRow[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [expandedMeals, setExpandedMeals] = useState<Set<MealTemplateName>>(new Set(['breakfast']))
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  const substitutionIndex = useMemo(() =>
    substitutionRows.map(row => ({ groupName: row.food_substitution_group?.name ?? '', foodItemId: row.food_item_id, quantity: Number(row.quantity), label: row.label })).filter(r => r.groupName),
  [substitutionRows])

  const loadMealLogs = useCallback(async (dayId: number) => {
    const { data, error } = await supabase.from('meal_log').select('*, meal_log_item(*, food_item(*))').eq('nutrition_day_id', dayId).order('logged_at', { ascending: true })
    if (error) { console.error('nutrition meal log load failed:', error.message); return }
    setMealLogs((data ?? []) as MealLog[])
  }, [])

  const ensureDay = useCallback(async (nextDayType: NutritionDayType) => {
    const nextTargets = getDailyTargets(nextDayType, 'cut')
    const payload = { date: todayISO(), day_type: nextDayType, goal: 'cut', calories_target: nextTargets.calories, protein_target: nextTargets.protein_g, carbs_target: nextTargets.carbs_g, fat_target: nextTargets.fat_g }
    const { data, error } = await supabase.from('nutrition_day').upsert(payload, { onConflict: 'date' }).select('*').single()
    if (error) { console.error('nutrition day upsert failed:', error.message); return null }
    const day = data as NutritionDay; setNutritionDay(day); return day
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [foodResult, subResult, day] = await Promise.all([
        supabase.from('food_item').select('*').order('category').order('name'),
        supabase.from('food_substitution_group_item').select('*, food_substitution_group(*)').order('label'),
        ensureDay(dayType),
      ])
      if (cancelled) return
      setFoods((foodResult.data ?? []) as FoodItem[])
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
    const day = nutritionDay ?? (await ensureDay(dayType)); if (!day) return
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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a', paddingBottom: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#555', letterSpacing: '0.16em', textTransform: 'uppercase' }}>DAILY FUEL · TEMPLATES · SWAPS</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ededed', margin: '3px 0 0', letterSpacing: '-0.01em' }}>Nutrition</h1>
        </div>
        {/* Day type toggle */}
        <div style={{ display: 'flex', gap: 3, padding: 3, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10 }}>
          {DAY_TYPE_OPTIONS.map(opt => {
            const optionTargets = getDailyTargets(opt.value, 'cut')
            return (
              <button
                key={opt.value}
                onClick={() => setDayType(opt.value)}
                style={{
                  padding: '6px 14px', borderRadius: 7, cursor: 'pointer', border: 'none',
                  background: dayType === opt.value ? '#00d26a' : 'transparent',
                  color: dayType === opt.value ? '#0e0e0e' : '#888',
                  display: 'flex', flexDirection: 'column', lineHeight: 1.2, alignItems: 'flex-start', minWidth: 100,
                }}
              >
                <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em' }}>{opt.label}</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: dayType === opt.value ? 'rgba(14,14,14,0.65)' : '#555', marginTop: 2 }}>
                  {optionTargets.calories} kcal · {optionTargets.protein_g}p
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Two columns */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.85fr 1.3fr', gap: 18, minHeight: 0 }}>

        {/* LEFT — macros + suggestion + consumed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto' }}>
          {/* Macros label */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #2a2a2a', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: '#555', textTransform: 'uppercase' }}>Macros · today</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: '#555' }}>{macroVal(consumed.calories)}/{targets.calories} kcal</span>
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
              const deltaColor = deltaTone === 'good' ? '#00d26a' : deltaTone === 'warn' ? '#f59e0b' : '#888'

              return (
                <div key={m.key} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: '#888', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{m.label}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>{Math.round(pct * 100)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 800, color: '#ededed', lineHeight: 1, letterSpacing: '-0.02em' }}>{macroVal(consumedVal)}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>/ {macroVal(targetVal)}{m.unit}</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: m.color, borderRadius: 2 }} />
                  </div>
                  {/* Delta row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: deltaColor, fontWeight: 700 }}>
                      {Math.round(pct * 100)}%
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>
                      {over ? `${macroVal(Math.abs(remainingVal))}${m.unit} over` : `${macroVal(remainingVal)}${m.unit} left`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Next move card */}
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: '#555', letterSpacing: '0.16em', textTransform: 'uppercase' }}>· NEXT MOVE ·</span>
              <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f59e0b', border: '1px solid #f59e0b44', background: '#f59e0b10', padding: '2px 7px', borderRadius: 999 }}>
                {dayType.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#ededed', lineHeight: 1.45 }}>{suggestion}</div>
          </div>

          {/* Consumed summary */}
          {mealLogs.flatMap(l => l.meal_log_item ?? []).length > 0 && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 14, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #2a2a2a', paddingBottom: 6, marginBottom: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: '#555', textTransform: 'uppercase' }}>Consumed</span>
                <span style={{ fontFamily: mono, fontSize: 9, color: '#555' }}>{mealLogs.flatMap(l => l.meal_log_item ?? []).length} items</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: 12, color: '#ededed', marginBottom: 10 }}>
                {macroVal(consumed.calories)} kcal · {macroVal(consumed.protein_g)}g protein · {macroVal(consumed.carbs_g)}g carbs · {macroVal(consumed.fat_g)}g fat
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {mealLogs.flatMap(log => (log.meal_log_item ?? []).map(item => ({
                  mealName: MEAL_LABELS[log.meal_name], item,
                }))).map(({ mealName, item }) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 10, color: '#555' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{mealName} · {item.food_item?.name ?? 'food'}</span>
                    <span style={{ flexShrink: 0 }}>{macroVal(Number(item.protein_g))}p/{macroVal(Number(item.carbs_g))}c</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — meals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #2a2a2a', paddingBottom: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: '#555', textTransform: 'uppercase' }}>Meals</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: '#555' }}>{loggedMealsCount} of {defaultMeals.length} meals logged</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: mono, fontSize: 12, color: '#555' }}>loading fuel plan…</div>
            ) : defaultMeals.map(meal => {
              const mealLog = mealLogs.find(log => log.meal_name === meal.name)
              const mealTotals = calculateConsumed(mealLog ? [mealLog] : [])
              const isExpanded = expandedMeals.has(meal.name)
              const isLogged = (mealLog?.meal_log_item?.length ?? 0) > 0

              return (
                <div key={meal.name} style={{ background: '#1a1a1a', border: `1px solid ${isLogged ? '#2a2a2a' : '#2a2a2a'}`, borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleMeal(meal.name)}
                    style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'transparent', border: 'none', textAlign: 'left' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: isLogged ? '#555' : '#2a2a2a', border: isLogged ? 'none' : '1px solid #3a3a3a', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#ededed' }}>{meal.label}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>{meal.defaultTime}</span>
                      </div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: isLogged ? '#888' : '#555', marginTop: 2 }}>
                        {isLogged ? `${macroVal(mealTotals.calories)} kcal · ${macroVal(mealTotals.protein_g)}p · ${macroVal(mealTotals.carbs_g)}c` : `${meal.items.length} items`}
                      </div>
                    </div>
                    <span style={{ fontFamily: mono, color: '#555', fontSize: 16, lineHeight: 1 }}>{isExpanded ? '−' : '+'}</span>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #2a2a2a', padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {meal.items.length === 0 && (
                        <div style={{ padding: '8px 0', fontSize: 12, color: '#555' }}>No items for this day type.</div>
                      )}
                      {meal.items.map(item => {
                        const food = foodsByName.get(item.foodName); if (!food) return null
                        const logged = findLoggedItem(mealLogs, meal.name, food.id, item.substitutionGroup ?? item.label)
                        const scaled = scaleFood(food, item.quantity)
                        const substitutions = getSubstitutions(food.id, foods, substitutionIndex)
                        const key = foodKey(meal.name, food.id, item.label)

                        return (
                          <div key={`${meal.name}-${item.label}`} style={{ background: '#151515', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 12.5, color: logged ? '#555' : '#ededed', textDecoration: logged ? 'line-through' : 'none', opacity: logged ? 0.7 : 1 }}>{item.label}</div>
                                <div style={{ fontFamily: mono, fontSize: 10, color: '#555', marginTop: 2 }}>
                                  {scaled.calories} kcal · {scaled.protein_g}p · {scaled.carbs_g}c · {scaled.fat_g}f
                                </div>
                              </div>
                              {logged ? (
                                <button onClick={() => removeLoggedItem(logged.id)} style={{ fontFamily: mono, fontSize: 10, color: '#888', border: '1px solid #2a2a2a', background: 'transparent', padding: '3px 9px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>ate</button>
                              ) : (
                                <button onClick={() => logTemplateItem(meal.name, item)} disabled={savingKey === key} style={{ fontFamily: mono, fontSize: 10, background: '#00d26a', color: '#0e0e0e', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0, opacity: savingKey === key ? 0.5 : 1 }}>ate this</button>
                              )}
                            </div>
                            {substitutions.length > 0 && !logged && (
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                                {substitutions.slice(0, 4).map(sub => {
                                  const subFood = foods.find(f => f.id === sub.foodItemId); if (!subFood) return null
                                  return (
                                    <button key={`${sub.groupName}-${sub.foodItemId}-${sub.label}`} onClick={() => logTemplateItem(meal.name, item, { food: subFood, quantity: sub.quantity, label: sub.label, groupName: sub.groupName })} style={{ fontFamily: mono, fontSize: 9, color: '#888', border: '1px solid #2a2a2a', background: 'transparent', padding: '2px 7px', borderRadius: 5, cursor: 'pointer' }}>
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

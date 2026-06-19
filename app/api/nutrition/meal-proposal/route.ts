import { NextRequest, NextResponse } from 'next/server'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import { extractMeal, ExtractedMealSchema } from '@/lib/meal-extraction'
import { createBriefServerClient } from '@/lib/supabase-server'
import {
  getDefaultNutritionDayType,
  loadNutritionTargetPlan,
  nutritionDayPayload,
} from '@/lib/nutrition'

const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'
const currentDate = () => getCurrentGoalDateInTimeZone(new Date(), LIFEOS_TIME_ZONE)

export async function POST(request: NextRequest) {
  let body: { text?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return NextResponse.json({ error: 'Meal text is required' }, { status: 400 })

  const supabase = await createBriefServerClient()
  const { data: foods, error } = await supabase
    .from('food_item')
    .select('id, name, portion_label')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(await extractMeal(text, foods ?? []))
}

export async function PUT(request: NextRequest) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = ExtractedMealSchema.safeParse(raw)
  if (!result.success || result.data.items.length === 0) {
    return NextResponse.json({ error: 'A valid meal proposal is required' }, { status: 400 })
  }

  const supabase = await createBriefServerClient()
  const ids = result.data.items.map((item) => item.food_item_id)
  const { data: foods, error: foodsError } = await supabase.from('food_item').select('*').in('id', ids)
  if (foodsError) return NextResponse.json({ error: foodsError.message }, { status: 500 })

  const foodMap = new Map((foods ?? []).map((food) => [Number(food.id), food]))
  if (result.data.items.some((item) => !foodMap.has(item.food_item_id))) {
    return NextResponse.json({ error: 'Proposal contains an unknown food' }, { status: 400 })
  }

  let { data: day } = await supabase
    .from('nutrition_day')
    .select('*')
    .eq('date', currentDate())
    .maybeSingle()

  if (!day) {
    const defaultDayType = getDefaultNutritionDayType(new Date(`${currentDate()}T12:00:00`))
    const targetPlan = await loadNutritionTargetPlan(supabase)
    const targets = targetPlan.targets[defaultDayType]
    if (!targets) {
      return NextResponse.json({ error: 'Nutrition targets are unavailable' }, { status: 500 })
    }
    const created = await supabase.from('nutrition_day').insert({
      date: currentDate(),
      ...nutritionDayPayload(defaultDayType, targets, targetPlan.calibration),
    }).select('*').single()
    if (created.error || !created.data) {
      return NextResponse.json({ error: created.error?.message ?? 'Could not create nutrition day' }, { status: 500 })
    }
    day = created.data
  }

  let { data: mealLog } = await supabase
    .from('meal_log')
    .select('*')
    .eq('nutrition_day_id', day.id)
    .eq('meal_name', result.data.meal_name)
    .order('logged_at')
    .limit(1)
    .maybeSingle()
  if (!mealLog) {
    const created = await supabase.from('meal_log').insert({
      nutrition_day_id: day.id,
      meal_name: result.data.meal_name,
      notes: 'Added from reviewed meal text proposal',
    }).select('*').single()
    if (created.error || !created.data) {
      return NextResponse.json({ error: created.error?.message ?? 'Could not create meal log' }, { status: 500 })
    }
    mealLog = created.data
  }

  const rows = result.data.items.map((item) => {
    const food = foodMap.get(item.food_item_id)!
    return {
      meal_log_id: mealLog.id,
      food_item_id: item.food_item_id,
      quantity: item.quantity,
      calories: Math.round(Number(food.calories) * item.quantity),
      protein_g: Number(food.protein_g) * item.quantity,
      carbs_g: Number(food.carbs_g) * item.quantity,
      fat_g: Number(food.fat_g) * item.quantity,
      // Provenance lives in meal_log.notes; substitution_group keeps its
      // substitution semantics.
      substitution_group: null,
    }
  })
  const { error: insertError } = await supabase.from('meal_log_item').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true, meal_log_id: mealLog.id })
}

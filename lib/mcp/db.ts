import { createBriefServerClient } from '@/lib/supabase-server'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import { getPlanStatus, getTodayKey, getDayMeta } from '@/lib/workout'

const TZ = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

export type Db = Awaited<ReturnType<typeof getDb>>

export async function getDb() {
  return createBriefServerClient({ admin: true })
}

export function getToday() {
  return getCurrentGoalDateInTimeZone(new Date(), TZ)
}

export async function fetchRecovery(db: Db, date: string) {
  const { data } = await db
    .from('whoop_snapshots')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .gte('recorded_at', `${date}T00:00:00`)
    .lt('recorded_at', `${date}T23:59:59`)
  return data ?? []
}

export async function fetchLatestRecovery(db: Db) {
  const { data } = await db
    .from('whoop_snapshots')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

export async function fetchRecoveryRange(db: Db, startDate: string, endDate: string) {
  const { data } = await db
    .from('whoop_snapshots')
    .select('id,recorded_at,recovery_score,hrv_rmssd,rhr,strain,sleep_score,sleep_duration_ms,sleep_deep_pct,sleep_rem_pct,kilojoule,respiratory_rate')
    .gte('recorded_at', startDate)
    .lte('recorded_at', `${endDate}T23:59:59`)
    .order('recorded_at', { ascending: true })
  return data ?? []
}

export async function fetchTodosForDate(db: Db, date: string) {
  const { data } = await db
    .from('todos')
    .select('*')
    .eq('day_date', date)
    .order('sort_order')
  return data ?? []
}

export async function fetchNutritionDay(db: Db, date: string) {
  const { data } = await db
    .from('nutrition_day')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  return data ?? null
}

export async function fetchMealsForNutritionDay(db: Db, nutritionDayId: number) {
  const { data } = await db
    .from('meal_log')
    .select('*, meal_log_item(*, food_item(*))')
    .eq('nutrition_day_id', nutritionDayId)
    .order('logged_at')
  return data ?? []
}

export function computeMacroTotals(meals: Awaited<ReturnType<typeof fetchMealsForNutritionDay>>) {
  let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0
  for (const meal of meals) {
    for (const item of (meal.meal_log_item ?? []) as Array<{ calories: number; protein_g: number; carbs_g: number; fat_g: number }>) {
      calories += item.calories ?? 0
      protein_g += item.protein_g ?? 0
      carbs_g += item.carbs_g ?? 0
      fat_g += item.fat_g ?? 0
    }
  }
  return { calories: Math.round(calories), protein_g: Math.round(protein_g), carbs_g: Math.round(carbs_g), fat_g: Math.round(fat_g) }
}

export async function fetchTodayWorkoutSession(db: Db) {
  const planStatus = getPlanStatus()
  const todayKey = getTodayKey()
  const dayMeta = getDayMeta(todayKey, planStatus.blockSlug)

  if (!planStatus.active || !dayMeta.dbKey) {
    return { planStatus, todayKey, dayMeta, session: null, exercises: [] }
  }

  const { data: sessions } = await db
    .from('workout_sessions')
    .select('*')
    .eq('block_slug', planStatus.blockSlug)
    .eq('week_number', planStatus.week)
    .eq('day_of_week', dayMeta.dbKey)
    .limit(1)

  const session = sessions?.[0] ?? null
  let exercises: unknown[] = []
  if (session) {
    const { data } = await db
      .from('workout_exercises')
      .select('*')
      .eq('session_id', session.id)
      .order('order_index')
    exercises = data ?? []
  }

  return { planStatus, todayKey, dayMeta, session, exercises }
}

export async function fetchWorkoutLogs(db: Db, date: string) {
  const { data } = await db
    .from('workout_logs')
    .select('*')
    .gte('logged_at', `${date}T00:00:00`)
    .lt('logged_at', `${date}T23:59:59`)
    .order('logged_at')
  return data ?? []
}

export async function fetchCheckin(db: Db, date: string) {
  const { data } = await db
    .from('daily_checkins')
    .select('*')
    .eq('check_date', date)
    .maybeSingle()
  return data ?? null
}

export async function fetchLatestBrief(db: Db, date: string) {
  const { data } = await db
    .from('ai_briefs')
    .select('*')
    .eq('brief_date', date)
    .order('generation', { ascending: false })
    .limit(1)
  const brief = data?.[0] ?? null

  let proposals: unknown[] = []
  if (brief) {
    const { data: p } = await db
      .from('ai_proposals')
      .select('*')
      .eq('brief_id', brief.id)
      .eq('status', 'pending')
    proposals = p ?? []
  }

  return { brief, proposals }
}

export async function fetchBodyTrend(db: Db, days = 90) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data } = await db
    .from('whoop_body_measurements')
    .select('measured_on,weight_kg,height_m,max_heart_rate')
    .gte('measured_on', since.toISOString().slice(0, 10))
    .order('measured_on', { ascending: true })
  return data ?? []
}

export async function fetchFinanceData(db: Db) {
  const [accounts, instruments, holdings, prices] = await Promise.all([
    db.from('fin_accounts').select('*').order('name'),
    db.from('fin_instruments').select('*').order('symbol'),
    db.from('fin_holdings').select('*'),
    db.from('fin_prices').select('instrument_id,price,as_of').order('as_of', { ascending: false }).limit(500),
  ])
  return {
    accounts: accounts.data ?? [],
    instruments: instruments.data ?? [],
    holdings: holdings.data ?? [],
    prices: prices.data ?? [],
  }
}

export async function ensureFinAccount(db: Db, name: string, kind: string) {
  const { data: existing } = await db.from('fin_accounts').select('*').eq('name', name).maybeSingle()
  if (existing) return existing
  const { data } = await db.from('fin_accounts').insert({ name, kind }).select('*').single()
  return data
}

export async function ensureFinInstrument(db: Db, symbol: string, assetClass: string, isin?: string | null, name?: string | null) {
  const { data: existing } = await db
    .from('fin_instruments')
    .select('*')
    .eq('symbol', symbol)
    .eq('asset_class', assetClass)
    .maybeSingle()
  if (existing) return existing
  const { data } = await db
    .from('fin_instruments')
    .upsert({ symbol, asset_class: assetClass, isin: isin ?? null, name: name ?? null }, { onConflict: 'symbol,asset_class' })
    .select('*')
    .single()
  return data
}

export async function fetchNutritionPlan(db: Db) {
  const [{ data: dayTypes }, { data: templates }, { data: rules }] = await Promise.all([
    db.from('nutrition_day_types').select('*').order('id'),
    db.from('nutrition_meal_templates').select('*').order('day_type_key,sort_order'),
    db.from('nutrition_rules').select('*').order('sort_order'),
  ])
  return { dayTypes: dayTypes ?? [], templates: templates ?? [], rules: rules ?? [] }
}

export async function ensureNutritionDay(db: Db, date: string) {
  const existing = await fetchNutritionDay(db, date)
  if (existing) return existing

  const { data } = await db
    .from('nutrition_day')
    .insert({ date, day_type: 'moderate', goal: 'maintenance', calories_target: 2300, protein_target: 180, carbs_target: 250, fat_g: 65 })
    .select()
    .single()
  return data
}

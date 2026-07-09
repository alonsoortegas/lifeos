import { createBriefServerClient } from '@/lib/supabase-server'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import { getPlanStatus, getTodayKey, getDayMeta } from '@/lib/workout'
import {
  shapeWorkout, berlinDateKey,
  computeBodyTrend, computeStrengthTrends, computeEngineTrends, computeLoadTrends,
  type WorkoutCategory, type RawWorkoutRow, type StrengthLogRow,
} from '@/lib/trends'
import type { TrainingPhase } from '@/lib/types'

export { classifyWorkout, type WorkoutCategory } from '@/lib/trends'

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

// WHOOP-detected workouts (whoop_workouts) are a separate stream from the manually
// logged strength sets (workout_logs). Commuting/walking are lifestyle movement, not
// training — we store everything but let callers filter. Classification and shaping
// live in lib/trends.ts so the Trends tab and this MCP layer share one implementation.

export async function fetchWorkouts(
  db: Db,
  startDate: string,
  endDate: string,
  category: WorkoutCategory | 'all' = 'all',
) {
  const { data } = await db
    .from('whoop_workouts')
    .select('workout_id,cycle_id,started_at,sport_name,strain,avg_hr,max_hr,zone0_min,zone1_min,zone2_min,zone3_min,zone4_min,zone5_min,raw_json')
    .gte('started_at', `${startDate}T00:00:00`)
    .lte('started_at', `${endDate}T23:59:59`)
    .order('started_at', { ascending: false })
  const shaped = ((data ?? []) as RawWorkoutRow[]).map(shapeWorkout)
  return category === 'all' ? shaped : shaped.filter((w) => w.category === category)
}

// Mirrors lib/useTrends.ts: same queries, same pure functions — one source of
// truth for metric definitions, exposed to both the dashboard and MCP clients.
export const TRENDS_RANGE_DAYS: Record<string, number | null> = { '4w': 28, '12w': 84, '6m': 183, all: null }

export async function fetchTrendsMetrics(db: Db, range: '4w' | '12w' | '6m' | 'all' = '12w') {
  const days = TRENDS_RANGE_DAYS[range]
  const startIso = days != null ? new Date(Date.now() - days * 86400000).toISOString() : null
  const startDate = startIso?.slice(0, 10) ?? null

  // Phases load first: the weight series must reach back to the current phase
  // start (since-start totals, target anchor) even when the range is shorter.
  const { data: phaseRows } = await db.from('training_phases').select('*').order('started_on', { ascending: false })
  const phases = (phaseRows ?? []) as TrainingPhase[]
  const currentPhase = phases[0] ?? null
  const weightStart = startDate && currentPhase && currentPhase.started_on < startDate
    ? currentPhase.started_on
    : startDate

  let snapQ = db.from('whoop_snapshots').select('recorded_at,recovery_score,hrv_rmssd,strain').order('recorded_at')
  if (startIso) snapQ = snapQ.gte('recorded_at', startIso)
  let wktQ = db.from('whoop_workouts')
    .select('workout_id,cycle_id,started_at,sport_name,strain,avg_hr,max_hr,zone0_min,zone1_min,zone2_min,zone3_min,zone4_min,zone5_min,raw_json')
    .order('started_at')
  if (startIso) wktQ = wktQ.gte('started_at', startIso)
  let logQ = db.from('workout_logs').select('logged_at,exercise_name,weight_lbs,weight_unit,reps').order('logged_at')
  if (startIso) logQ = logQ.gte('logged_at', startIso)
  let weightQ = db.from('whoop_body_measurements').select('measured_on,weight_kg').order('measured_on')
  if (weightStart) weightQ = weightQ.gte('measured_on', weightStart)

  const [snapRes, wktRes, logRes, weightRes] = await Promise.all([snapQ, wktQ, logQ, weightQ])

  const todayKey = berlinDateKey(new Date().toISOString())
  const shaped = ((wktRes.data ?? []) as RawWorkoutRow[]).map(shapeWorkout)
  const snapshots = (snapRes.data ?? []) as { recorded_at: string; recovery_score: number | null; hrv_rmssd: number | null; strain: number | null }[]

  return {
    range,
    currentPhase,
    phases,
    body: computeBodyTrend((weightRes.data ?? []) as { measured_on: string; weight_kg: number | null }[], currentPhase, todayKey),
    strength: computeStrengthTrends((logRes.data ?? []) as StrengthLogRow[], todayKey),
    engine: computeEngineTrends(shaped),
    load: computeLoadTrends(shaped, snapshots),
  }
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

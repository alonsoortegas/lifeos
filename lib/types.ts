export interface WhoopSnapshot {
  id: number
  cycle_id: number
  recorded_at: string
  cycle_start?: string | null
  cycle_end?: string | null
  cycle_timezone_offset?: string | null
  recovery_score: number | null
  rhr: number | null
  hrv_rmssd: number | null
  strain: number | null
  sleep_score: number | null
  sleep_duration_ms: number | null
  sleep_deep_pct: number | null
  sleep_rem_pct: number | null
  sleep_light_pct: number | null
  sleep_awake_pct: number | null
  sleep_consistency_pct: number | null
  respiratory_rate: number | null
  kilojoule: number | null
  raw_json: Record<string, unknown> | null
  created_at: string
}

export interface WhoopBodyMeasurement {
  id: number
  measured_on: string
  weight_kg: number | null
  height_m: number | null
  max_heart_rate: number | null
  created_at: string
}

export interface WhoopWorkout {
  id: number
  workout_id: number
  cycle_id: number | null
  started_at: string
  sport_name: string | null
  strain: number | null
  avg_hr: number | null
  max_hr: number | null
  zone0_min: number | null
  zone1_min: number | null
  zone2_min: number | null
  zone3_min: number | null
  zone4_min: number | null
  zone5_min: number | null
}

export interface WorkoutLog {
  id: number
  logged_at: string
  workout_session_id?: number | null
  workout_exercise_id?: number | null
  exercise_name: string
  set_number: number | null
  weight_lbs: number | null
  weight_unit: string
  reps: number | null
  rpe: number | null
  distance_m?: number | null
  duration_s?: number | null
  notes: string | null
}

export interface WorkoutSession {
  id: number
  block_slug: string
  week_number: number
  day_of_week: string
  title: string
  session_type: string
  notes: string | null
}

export type ExerciseModality = 'strength' | 'erg' | 'carry' | 'bodyweight'

export interface WorkoutExercise {
  id: number
  session_id: number
  order_index: number
  exercise_name: string
  prescribed_sets: number | null
  prescribed_reps: string | null
  prescribed_weight: number | null
  weight_unit: string
  target_rpe: string | null
  notes: string | null
  modality: ExerciseModality
}

export interface NutritionLog {
  id: number
  logged_at: string
  food_name: string
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  calories: number | null
  day_type: 'Hard' | 'Moderate' | 'Rest' | null
}

export type NutritionDayType = 'hard' | 'moderate' | 'rest'
export type NormalizedNutritionDayType = 'hard_training' | 'moderate_training' | 'rest_easy'
export type NutritionGoal = 'cut' | 'maintenance' | 'bulk' | 'race_week'
export type MealTemplateName = 'breakfast' | 'midday' | 'pre_workout' | 'post_workout' | 'dinner' | 'snack'
export type FoodCategory = 'protein' | 'carb' | 'fat' | 'mixed' | 'veg'
export type FoodTrackingUnit = 'piece' | 'cup' | 'grams' | 'scoop' | 'slice'

export interface NutritionDay {
  id: number
  date: string
  day_type: NutritionDayType
  goal: NutritionGoal
  calories_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
  base_calories_target?: number | null
  whoop_calories_baseline?: number | null
  whoop_calories_recent?: number | null
  whoop_calorie_adjustment?: number
  calorie_target_method?: 'static' | 'whoop_rolling_v1'
  created_at: string
  updated_at: string
}

export interface MealTemplate {
  id: number
  name: MealTemplateName
  day_type: NutritionDayType | 'all'
  default_time: string | null
  notes: string | null
}

export interface FoodItem {
  id: number
  name: string
  category: FoodCategory
  portion_label: string
  grams: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  tracking_unit: FoodTrackingUnit
  notes: string | null
}

export interface FoodSubstitutionGroup {
  id: number
  name: string
  macro_type: 'carb' | 'protein'
  target_macro_g: number
  notes: string | null
}

export interface FoodSubstitutionGroupItem {
  id: number
  substitution_group_id: number
  food_item_id: number
  quantity: number
  label: string
}

export interface MealLogItem {
  id: number
  meal_log_id: number
  food_item_id: number
  quantity: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  substitution_group: string | null
  food_item?: FoodItem
}

export interface MealLog {
  id: number
  nutrition_day_id: number
  meal_name: MealTemplateName
  logged_at: string
  notes: string | null
  meal_log_item?: MealLogItem[]
}

export interface NutritionDayTypeRow {
  id: number
  key: NormalizedNutritionDayType
  label: string
  description: string | null
  kcal_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
  examples: string[]
  notes: string[]
}

export interface NutritionFoodPortion {
  id: number
  food_key: string
  label: string
  portion_label: string
  raw_weight_g: number | null
  cooked_weight_g: number | null
  protein_g: number
  carbs_g: number
  fat_g: number
  notes: string | null
  equivalence_group: string
}

export interface NutritionMealTemplateItem {
  food_key?: string
  quantity?: number
  label: string
  alternatives?: string[]
  optional?: boolean
  freeform?: boolean
}

export interface NutritionMealTemplate {
  id: number
  day_type_key: NormalizedNutritionDayType
  meal_key: string
  meal_label: string
  sort_order: number
  default_items: NutritionMealTemplateItem[]
  notes: string[]
}

export interface NutritionRule {
  id: number
  sort_order: number
  rule_text: string
}

export interface NutritionEquivalenceGroup {
  id: number
  key: string
  label: string
  compare_macro: 'protein' | 'carbs' | 'fat'
  examples: string[]
  notes: string[]
}

export interface Todo {
  id: number
  text: string
  done: boolean
  created_at: string
  day_date: string
  sort_order: number
}

// ── Finances ─────────────────────────────────────────────────────────────────

export type AssetClass = 'etf' | 'stock' | 'crypto'
export type FinAccountKind = 'broker' | 'bank' | 'wallet' | 'manual'
export type FinTransactionType =
  | 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'fee' | 'transfer'
export type FinImportSource = 'manual' | 'csv_tr' | 'csv_revolut' | 'csv_crypto'

export interface FinAccount {
  id: number
  name: string
  kind: FinAccountKind
  currency: string
  created_at: string
}

export interface FinInstrument {
  id: number
  symbol: string
  isin: string | null
  name: string | null
  asset_class: AssetClass
  currency: string
  created_at: string
}

export interface FinHolding {
  id: number
  account_id: number
  instrument_id: number
  quantity: number
  avg_cost: number | null
  updated_at: string
}

export interface FinTransaction {
  id: number
  account_id: number | null
  instrument_id: number | null
  type: FinTransactionType
  quantity: number | null
  price: number | null
  fee: number
  amount: number | null
  currency: string
  traded_at: string
  source: string
  import_batch_id: string | null
  external_id: string | null
  notes: string | null
  created_at: string
}

export interface FinPrice {
  id: number
  instrument_id: number
  price: number
  currency: string
  as_of: string
  source: string | null
}

export type FinCashKind = 'cash' | 'fixed'

export interface FinCash {
  id: number
  account_id: number
  kind: FinCashKind
  label: string | null
  amount: number
  currency: string
  /** Annual rate as a fraction — 0.02 = 2% p.a. Zero for plain cash. */
  apy: number
  /** Accrual anchor (YYYY-MM-DD) — interest grows from this date. */
  started_at: string
  updated_at: string
}

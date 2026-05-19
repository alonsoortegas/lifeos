export interface WhoopSnapshot {
  id: number
  cycle_id: number
  recorded_at: string
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

export interface DailyRegister {
  id: number
  log_date: string
  sleep_hours: number
  previous_day_steps: number
  previous_day_calories: number
  on_period: boolean
  created_at: string
  updated_at: string
}

export type NutritionDayType = 'hard' | 'moderate' | 'rest'
export type NormalizedNutritionDayType = 'hard_training' | 'moderate_training' | 'rest_easy'
export type NutritionGoal = 'cut' | 'maintenance' | 'race_week'
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

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
  exercise_name: string
  set_number: number | null
  weight_lbs: number | null
  weight_unit: string
  reps: number | null
  rpe: number | null
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

export interface Todo {
  id: number
  text: string
  done: boolean
  created_at: string
  day_date: string
}

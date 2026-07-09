'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  berlinDateKey, shapeWorkout,
  computeBodyTrend, computeStrengthTrends, computeEngineTrends, computeLoadTrends, computeFuelTrends,
  type RawWorkoutRow, type StrengthLogRow, type FuelDayRow,
  type BodyTrend, type StrengthTrends, type EngineTrends, type LoadTrends, type FuelTrends,
} from '@/lib/trends'
import type { PhaseKind, TrainingPhase } from '@/lib/types'

export type TrendsRange = '4w' | '12w' | '6m' | 'all'
const RANGE_DAYS: Record<TrendsRange, number | null> = { '4w': 28, '12w': 84, '6m': 183, all: null }
const RANGE_STORAGE_KEY = 'lifeos-trends-range'

export interface TrendsMetrics {
  body: BodyTrend
  strength: StrengthTrends
  engine: EngineTrends
  load: LoadTrends
  fuel: FuelTrends
}

type SnapshotRow = { recorded_at: string; recovery_score: number | null; hrv_rmssd: number | null; strain: number | null }
type WeightRow = { measured_on: string; weight_kg: number | null }

function initialRange(): TrendsRange {
  if (typeof window === 'undefined') return '12w'
  const stored = window.localStorage.getItem(RANGE_STORAGE_KEY)
  return stored === '4w' || stored === '12w' || stored === '6m' || stored === 'all' ? stored : '12w'
}

export function useTrends() {
  const [range, setRangeState] = useState<TrendsRange>(initialRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [workouts, setWorkouts] = useState<RawWorkoutRow[]>([])
  const [logs, setLogs] = useState<StrengthLogRow[]>([])
  const [weights, setWeights] = useState<WeightRow[]>([])
  const [nutritionDays, setNutritionDays] = useState<FuelDayRow[]>([])
  const [phases, setPhases] = useState<TrainingPhase[]>([])
  const [loaded, setLoaded] = useState(false)

  const setRange = useCallback((r: TrendsRange) => {
    setRangeState(r)
    try { window.localStorage.setItem(RANGE_STORAGE_KEY, r) } catch { /* private mode */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const days = RANGE_DAYS[range]
    const startIso = days != null ? new Date(Date.now() - days * 86400000).toISOString() : null
    const startDate = startIso?.slice(0, 10) ?? null

    let snapQ = supabase.from('whoop_snapshots')
      .select('recorded_at,recovery_score,hrv_rmssd,strain').order('recorded_at')
    if (startIso) snapQ = snapQ.gte('recorded_at', startIso)

    let wktQ = supabase.from('whoop_workouts')
      .select('workout_id,cycle_id,started_at,sport_name,strain,avg_hr,max_hr,zone0_min,zone1_min,zone2_min,zone3_min,zone4_min,zone5_min,raw_json')
      .order('started_at')
    if (startIso) wktQ = wktQ.gte('started_at', startIso)

    let logQ = supabase.from('workout_logs')
      .select('logged_at,exercise_name,weight_lbs,weight_unit,reps').order('logged_at')
    if (startIso) logQ = logQ.gte('logged_at', startIso)

    // Phases load first: the weight series must reach back to the current
    // phase start (for since-start totals and the target anchor) even when
    // the selected range is shorter.
    const phaseRes = await supabase.from('training_phases').select('*').order('started_on', { ascending: false })
    const phaseStart = (phaseRes.data?.[0] as TrainingPhase | undefined)?.started_on ?? null
    const weightStart = startDate && phaseStart && phaseStart < startDate ? phaseStart : startDate

    let weightQ = supabase.from('whoop_body_measurements')
      .select('measured_on,weight_kg').order('measured_on')
    if (weightStart) weightQ = weightQ.gte('measured_on', weightStart)

    let fuelQ = supabase.from('nutrition_day')
      .select('date,calories_target,protein_target,meal_log(meal_log_item(calories,protein_g))')
      .order('date')
    if (startDate) fuelQ = fuelQ.gte('date', startDate)

    const [snapRes, wktRes, logRes, weightRes, fuelRes] = await Promise.all([snapQ, wktQ, logQ, weightQ, fuelQ])
    const firstError = snapRes.error ?? wktRes.error ?? logRes.error ?? weightRes.error ?? fuelRes.error ?? phaseRes.error
    if (firstError) {
      setError(firstError.message)
    } else {
      setSnapshots((snapRes.data ?? []) as SnapshotRow[])
      setWorkouts((wktRes.data ?? []) as RawWorkoutRow[])
      setLogs((logRes.data ?? []) as StrengthLogRow[])
      setWeights((weightRes.data ?? []) as WeightRow[])
      setNutritionDays((fuelRes.data ?? []) as FuelDayRow[])
      setPhases((phaseRes.data ?? []) as TrainingPhase[])
      setLoaded(true)
    }
    setLoading(false)
  }, [range])

  useEffect(() => { void load() }, [load])

  const currentPhase = phases[0] ?? null

  const metrics = useMemo<TrendsMetrics | null>(() => {
    if (!loaded) return null
    const todayKey = berlinDateKey(new Date().toISOString())
    const shaped = workouts.map(shapeWorkout)
    const body = computeBodyTrend(weights, currentPhase, todayKey)
    return {
      body,
      strength: computeStrengthTrends(logs, todayKey),
      engine: computeEngineTrends(shaped),
      load: computeLoadTrends(shaped, snapshots),
      fuel: computeFuelTrends(nutritionDays, todayKey, {
        actualRatePerWeek: body.ratePerWeek,
        latestWeightKg: body.rolling7.length ? body.rolling7[body.rolling7.length - 1].value : null,
      }),
    }
  }, [loaded, workouts, weights, logs, snapshots, nutritionDays, currentPhase])

  const setPhase = useCallback(async (phase: PhaseKind, startedOn: string, targetRate?: number | null) => {
    const supabase = createClient()
    const { error: insertError } = await supabase.from('training_phases').insert({
      phase, started_on: startedOn, target_rate_kg_per_week: targetRate ?? null,
    })
    if (insertError) throw new Error(insertError.message)
    await load()
  }, [load])

  return { loading, error, range, setRange, metrics, currentPhase, phases, setPhase }
}

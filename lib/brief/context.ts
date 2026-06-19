import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addDaysToDateKey,
  formatDateKeyInTimeZone,
  getZonedDayRange,
} from '@/lib/goal-dates'
import { computeReadiness } from '@/lib/readiness'
import { DAY_ORDER, getDayMeta, getPlanStatus } from '@/lib/workout'
import type { WhoopSnapshot } from '@/lib/types'
import { compactReadiness, type BriefContextPack, type NutritionDayTypeKey } from '@/lib/brief/types'

type DbClient = SupabaseClient
const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

function localNoon(date: string) {
  return new Date(`${date}T12:00:00`)
}

function dayKey(date: string) {
  const value = localNoon(date)
  return DAY_ORDER[value.getDay() === 0 ? 6 : value.getDay() - 1] ?? 'monday'
}

function hoursSince(value: string) {
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3_600_000)
}

export async function assembleContext(
  supabase: DbClient,
  date: string,
): Promise<BriefContextPack> {
  const previousDate = addDaysToDateKey(date, -1)
  const startRecent = getZonedDayRange(addDaysToDateKey(date, -14), LIFEOS_TIME_ZONE).startIso
  const endToday = getZonedDayRange(date, LIFEOS_TIME_ZONE).endIso

  const [
    snapshotsResult,
    todosResult,
    dayTypesResult,
    previousNutritionResult,
    recentLogsResult,
    checkInResult,
  ] = await Promise.all([
    supabase.from('whoop_snapshots').select('*').order('recorded_at', { ascending: false }).limit(30),
    supabase.from('todos').select('id, text, done').eq('day_date', date).eq('done', false).order('sort_order'),
    supabase.from('nutrition_day_types').select('key, label, kcal_target, protein_g, carbs_g, fat_g').order('id'),
    supabase
      .from('nutrition_day')
      .select('day_type, calories_target, protein_target, meal_log(meal_log_item(calories, protein_g))')
      .eq('date', previousDate)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('logged_at, rpe')
      .gte('logged_at', startRecent)
      .lt('logged_at', endToday)
      .order('logged_at', { ascending: false }),
    supabase.from('daily_checkins').select('*').eq('check_date', date).maybeSingle(),
  ])

  const snapshots = (snapshotsResult.data ?? []) as WhoopSnapshot[]
  const readiness = computeReadiness(snapshots)
  const latestSnapshot = snapshots[0]
  const latestAge = latestSnapshot ? hoursSince(latestSnapshot.recorded_at) : null

  // Status is derived from snapshots alone: whoop_tokens is service_role-only,
  // so reading it here both leaked a secret into server memory and made the
  // pack (and its hash) differ between cron and session generation.
  let whoopStatus: BriefContextPack['whoop']['status'] = 'disconnected'
  if (latestSnapshot && snapshots.length < 3) whoopStatus = 'insufficient'
  else if (latestSnapshot && latestAge != null && latestAge > 30) whoopStatus = 'stale'
  else if (latestSnapshot) whoopStatus = 'fresh'

  const planStatus = getPlanStatus(localNoon(date))
  const weekday = dayKey(date)
  const meta = getDayMeta(weekday, planStatus.blockSlug)
  let todaysSession: BriefContextPack['todays_session']

  if (!planStatus.active || planStatus.week == null) {
    todaysSession = {
      status: 'no_active_plan',
      label: 'No active training block',
      detail: planStatus.reason === 'expired'
        ? 'The previous six-week plan has ended.'
        : 'The seeded training plan has not started.',
    }
  } else if (!meta?.dbKey) {
    todaysSession = {
      status: 'rest',
      label: meta?.restLabel ?? 'No gym session',
      detail: meta?.restSub ?? 'No session scheduled.',
    }
  } else {
    const { data: session } = await supabase
      .from('workout_sessions')
      .select('id, title, session_type, workout_exercises(exercise_name, prescribed_sets, prescribed_reps, target_rpe, order_index)')
      .eq('block_slug', planStatus.blockSlug)
      .eq('week_number', planStatus.week)
      .eq('day_of_week', meta.dbKey)
      .maybeSingle()

    if (!session) {
      todaysSession = {
        status: 'rest',
        label: 'No scheduled session',
        detail: 'No workout session exists for this day.',
      }
    } else {
      const exercises = (
        session.workout_exercises as Array<{
          exercise_name: string
          prescribed_sets: number | null
          prescribed_reps: string | null
          target_rpe: string | null
          order_index: number
        }> ?? []
      ).sort((a, b) => a.order_index - b.order_index)

      todaysSession = {
        status: 'scheduled',
        id: Number(session.id),
        title: String(session.title),
        session_type: String(session.session_type),
        exercises: exercises.map((exercise) => ({
          name: exercise.exercise_name,
          sets: exercise.prescribed_sets,
          reps: exercise.prescribed_reps,
          target_rpe: exercise.target_rpe,
        })),
      }
    }
  }

  const logsByDate = new Map<string, number[]>()
  for (const log of recentLogsResult.data ?? []) {
    const dateKey = formatDateKeyInTimeZone(new Date(String(log.logged_at)), LIFEOS_TIME_ZONE)
    const rpes = logsByDate.get(dateKey) ?? []
    if (log.rpe != null) rpes.push(Number(log.rpe))
    logsByDate.set(dateKey, rpes)
  }
  const recentTraining = [...logsByDate.entries()].slice(0, 3).map(([logDate, rpes]) => ({
    date: logDate,
    completed_sets: rpes.length,
    average_rpe: rpes.length
      ? (rpes.reduce((sum, value) => sum + value, 0) / rpes.length).toFixed(1)
      : 'not recorded',
  }))

  const previousNutrition = previousNutritionResult.data as {
    day_type: string
    calories_target: number
    protein_target: number
    meal_log?: Array<{ meal_log_item?: Array<{ calories: number; protein_g: number }> }>
  } | null
  const previousItems = previousNutrition?.meal_log?.flatMap((log) => log.meal_log_item ?? []) ?? []
  const calories = previousItems.reduce((sum, item) => sum + Number(item.calories || 0), 0)
  const protein = previousItems.reduce((sum, item) => sum + Number(item.protein_g || 0), 0)

  const dataGaps: BriefContextPack['data_gaps'] = []
  if (!readiness) dataGaps.push({ source: 'readiness', impact: 'Fewer than three recovery snapshots are available.' })
  if (whoopStatus === 'stale') dataGaps.push({ source: 'whoop', impact: 'WHOOP data is more than 30 hours old.' })
  if (whoopStatus === 'disconnected') dataGaps.push({ source: 'whoop', impact: 'WHOOP is disconnected or has no synced data.' })
  if (!previousNutrition) dataGaps.push({ source: 'nutrition', impact: 'Yesterday has no nutrition day record.' })
  if (!planStatus.active) dataGaps.push({ source: 'workout_plan', impact: 'There is no active training block.' })

  const checkIn = checkInResult.data as Record<string, unknown> | null

  return {
    date,
    weekday,
    plan: {
      status: planStatus.reason,
      week: planStatus.week,
    },
    readiness: readiness ? compactReadiness(readiness) : null,
    whoop: {
      status: whoopStatus,
      ...(latestSnapshot?.recovery_score != null ? { recovery_score: `${latestSnapshot.recovery_score}%` } : {}),
      ...(latestSnapshot?.sleep_score != null ? { sleep_score: `${latestSnapshot.sleep_score}%` } : {}),
      ...(snapshots[1]?.strain != null ? { strain_yesterday: Number(snapshots[1].strain).toFixed(1) } : {}),
      ...(latestAge != null ? { last_synced_hours_ago: `${latestAge.toFixed(1)}h` } : {}),
    },
    todays_session: todaysSession,
    recent_training: recentTraining,
    nutrition: {
      yesterday: previousNutrition
        ? {
            day_type: previousNutrition.day_type,
            calories: `${Math.round(calories)} kcal`,
            protein: `${Math.round(protein)}g`,
            versus_target: previousNutrition.calories_target > 0
              ? `${Math.round((calories / previousNutrition.calories_target) * 100)}% of calorie target`
              : 'target unavailable',
          }
        : null,
      day_type_options: (dayTypesResult.data ?? []).flatMap((row) => {
        const key = String(row.key) as NutritionDayTypeKey
        if (!['hard_training', 'moderate_training', 'rest_easy'].includes(key)) return []
        return [{
          key,
          label: String(row.label),
          calories: `${row.kcal_target} kcal`,
          protein: `${row.protein_g}g`,
          carbs: `${row.carbs_g}g`,
          fat: `${row.fat_g}g`,
        }]
      }),
    },
    todos: (todosResult.data ?? []).map((todo) => ({
      id: Number(todo.id),
      text: String(todo.text),
      done: false as const,
    })),
    check_in: checkIn
      ? {
          ...(checkIn.soreness != null ? { soreness: `${checkIn.soreness}/5` } : {}),
          ...(checkIn.motivation != null ? { motivation: `${checkIn.motivation}/5` } : {}),
          ...(checkIn.energy != null ? { energy: `${checkIn.energy}/5` } : {}),
          ...(checkIn.mood != null ? { mood: `${checkIn.mood}/5` } : {}),
          ...(checkIn.symptoms ? { symptoms: String(checkIn.symptoms) } : {}),
          ...(checkIn.note ? { note: String(checkIn.note) } : {}),
        }
      : null,
    data_gaps: dataGaps,
  }
}

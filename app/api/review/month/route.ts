import { NextRequest, NextResponse } from 'next/server'
import {
  addDaysToDateKey,
  formatDateKeyInTimeZone,
  getCurrentGoalDateInTimeZone,
  getZonedDayRange,
} from '@/lib/goal-dates'
import { calculateConsumed, type MacroTotals } from '@/lib/nutrition'
import { DAY_ORDER, getDayMeta, getPlanStatus } from '@/lib/workout'
import {
  buildMonthSummary,
  scoreFuel,
  scoreGoals,
  scoreTraining,
  type DayScore,
} from '@/lib/review/month'
import { createBriefServerClient } from '@/lib/supabase-server'
import type { MealLog } from '@/lib/types'

const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

function weekdayOf(date: string): string {
  const noon = new Date(`${date}T12:00:00`)
  return DAY_ORDER[noon.getDay() === 0 ? 6 : noon.getDay() - 1] ?? 'monday'
}

function monthDates(month: string): string[] {
  const first = `${month}-01`
  const dates: string[] = []
  let cursor = first
  while (cursor.slice(0, 7) === month) {
    dates.push(cursor)
    cursor = addDaysToDateKey(cursor, 1)
  }
  return dates
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month') ?? ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  try {
    const supabase = await createBriefServerClient()
    const dates = monthDates(month)
    const first = dates[0]
    const last = dates[dates.length - 1]
    const windowStart = getZonedDayRange(first, LIFEOS_TIME_ZONE).startIso
    const windowEnd = getZonedDayRange(last, LIFEOS_TIME_ZONE).endIso
    const prevMonthFirst = addDaysToDateKey(first, -1).slice(0, 7) + '-01'
    const prevWindowStart = getZonedDayRange(prevMonthFirst, LIFEOS_TIME_ZONE).startIso

    const [todosResult, briefsResult, logsResult, nutritionResult, snapshotsResult] =
      await Promise.all([
        supabase.from('todos').select('day_date, text, done').gte('day_date', first).lte('day_date', last),
        supabase
          .from('ai_briefs')
          .select('brief_date, generation, readiness_state, output_json, ai_brief_outcomes(training_adherence)')
          .gte('brief_date', first)
          .lte('brief_date', last)
          .order('generation', { ascending: true }),
        supabase
          .from('workout_logs')
          .select('logged_at, rpe')
          .gte('logged_at', windowStart)
          .lt('logged_at', windowEnd),
        supabase
          .from('nutrition_day')
          .select('date, calories_target, protein_target, meal_log(meal_log_item(calories, protein_g, carbs_g, fat_g))')
          .gte('date', first)
          .lte('date', last),
        supabase
          .from('whoop_snapshots')
          .select('recorded_at, recovery_score')
          .gte('recorded_at', prevWindowStart)
          .lt('recorded_at', windowEnd)
          .order('recorded_at'),
      ])

    // Latest generation per brief date wins (ordered ascending, so last write wins).
    const briefByDate = new Map<string, {
      readiness_state: string
      headline: string | null
      verdict: string | null
      adherence: string | null
    }>()
    for (const row of briefsResult.data ?? []) {
      const output = row.output_json as { headline?: string; training_decision?: { verdict?: string } } | null
      const outcomes = (row.ai_brief_outcomes ?? []) as Array<{ training_adherence: string | null }>
      briefByDate.set(String(row.brief_date), {
        readiness_state: String(row.readiness_state),
        headline: output?.headline ?? null,
        verdict: output?.training_decision?.verdict ?? null,
        adherence: outcomes[0]?.training_adherence ?? null,
      })
    }

    const todosByDate = new Map<string, Array<{ text: string; done: boolean }>>()
    for (const row of todosResult.data ?? []) {
      const key = String(row.day_date)
      const list = todosByDate.get(key) ?? []
      list.push({ text: String(row.text), done: Boolean(row.done) })
      todosByDate.set(key, list)
    }

    const logsByDate = new Map<string, number[]>()
    for (const row of logsResult.data ?? []) {
      const key = formatDateKeyInTimeZone(new Date(String(row.logged_at)), LIFEOS_TIME_ZONE)
      const list = logsByDate.get(key) ?? []
      list.push(row.rpe != null ? Number(row.rpe) : NaN)
      logsByDate.set(key, list)
    }

    const nutritionByDate = new Map<string, { consumed: MacroTotals; targets: { calories: number; protein_g: number } }>()
    for (const row of nutritionResult.data ?? []) {
      nutritionByDate.set(String(row.date), {
        consumed: calculateConsumed((row.meal_log ?? []) as MealLog[]),
        targets: { calories: Number(row.calories_target), protein_g: Number(row.protein_target) },
      })
    }

    // Latest recovery per local day; previous-month rows feed the avg delta.
    const recoveryByDate = new Map<string, number>()
    const prevRecoveries: number[] = []
    for (const row of snapshotsResult.data ?? []) {
      if (row.recovery_score == null) continue
      const key = formatDateKeyInTimeZone(new Date(String(row.recorded_at)), LIFEOS_TIME_ZONE)
      if (key.slice(0, 7) === month) recoveryByDate.set(key, Number(row.recovery_score))
      else if (key.slice(0, 7) === prevMonthFirst.slice(0, 7)) prevRecoveries.push(Number(row.recovery_score))
    }

    const today = getCurrentGoalDateInTimeZone(new Date(), LIFEOS_TIME_ZONE)
    const days: DayScore[] = dates.map(date => {
      const future = date > today
      const todos = todosByDate.get(date) ?? []
      const brief = briefByDate.get(date) ?? null
      const rpes = logsByDate.get(date) ?? []
      const nutrition = nutritionByDate.get(date) ?? null
      const weekday = weekdayOf(date)
      const planStatus = getPlanStatus(new Date(`${date}T12:00:00`))
      const expectedSession = planStatus.active && getDayMeta(weekday, planStatus.blockSlug).dbKey != null
      const validRpes = rpes.filter(r => !Number.isNaN(r))

      return {
        date,
        goals: future ? 'none' : scoreGoals(todos),
        training: future ? 'none' : scoreTraining({
          adherence: brief?.adherence ?? null,
          hadLogs: rpes.length > 0,
          expectedSession,
        }),
        fuel: future ? 'none' : scoreFuel({
          consumed: nutrition?.consumed ?? null,
          targets: nutrition?.targets ?? null,
        }),
        recovery: recoveryByDate.get(date) ?? null,
        readiness_state: brief?.readiness_state ?? null,
        detail: {
          todos,
          briefHeadline: brief?.headline ?? null,
          trainingVerdict: brief?.verdict ?? null,
          adherence: brief?.adherence ?? null,
          setsLogged: rpes.length,
          avgRpe: validRpes.length
            ? Number((validRpes.reduce((a, b) => a + b, 0) / validRpes.length).toFixed(1))
            : null,
          consumed: nutrition?.consumed ?? null,
          targets: nutrition?.targets ?? null,
        },
      }
    })

    const prevAvgRecovery = prevRecoveries.length
      ? Math.round(prevRecoveries.reduce((a, b) => a + b, 0) / prevRecoveries.length)
      : null

    return NextResponse.json({
      month,
      today,
      days,
      summary: buildMonthSummary(days, prevAvgRecovery),
    })
  } catch (error) {
    console.error('Monthly review failed:', error)
    return NextResponse.json({ error: 'Monthly review is unavailable' }, { status: 500 })
  }
}

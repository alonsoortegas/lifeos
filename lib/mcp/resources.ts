import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  getDb, getToday,
  fetchLatestRecovery, fetchRecoveryRange, fetchTodosForDate,
  fetchNutritionDay, fetchMealsForNutritionDay, computeMacroTotals,
  fetchTodayWorkoutSession, fetchWorkoutLogs, fetchCheckin,
  fetchLatestBrief, fetchBodyTrend, fetchNutritionPlan,
} from './db'

function json(uri: string, data: unknown) {
  return {
    contents: [{
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    }],
  }
}

export function registerResources(server: McpServer) {
  // --- Today snapshot ---
  server.registerResource(
    'today',
    'lifeos://today',
    { description: 'Full snapshot of today: latest WHOOP recovery, todos, nutrition summary, and active workout session.' },
    async (uri) => {
      const db = await getDb()
      const today = getToday()

      const [recovery, todos, nutritionDay, workout, checkin, { brief, proposals }] = await Promise.all([
        fetchLatestRecovery(db),
        fetchTodosForDate(db, today),
        fetchNutritionDay(db, today),
        fetchTodayWorkoutSession(db),
        fetchCheckin(db, today),
        fetchLatestBrief(db, today),
      ])

      let nutritionSummary: unknown = null
      if (nutritionDay) {
        const meals = await fetchMealsForNutritionDay(db, nutritionDay.id)
        const totals = computeMacroTotals(meals)
        nutritionSummary = { day: nutritionDay, meals, totals }
      }

      return json(uri.href, {
        date: today,
        recovery,
        todos,
        nutrition: nutritionSummary,
        workout: {
          planStatus: workout.planStatus,
          todayKey: workout.todayKey,
          session: workout.session,
          exercises: workout.exercises,
        },
        checkin,
        brief,
        pendingProposals: proposals,
      })
    }
  )

  // --- Recovery history ---
  server.registerResource(
    'recovery-history',
    'lifeos://recovery/history',
    { description: 'Last 30 days of WHOOP recovery data: recovery score, HRV, RHR, strain, sleep quality.' },
    async (uri) => {
      const db = await getDb()
      const end = getToday()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      const data = await fetchRecoveryRange(db, start.toISOString().slice(0, 10), end)
      return json(uri.href, data)
    }
  )

  // --- Recovery by date (template) ---
  server.registerResource(
    'recovery-by-date',
    new ResourceTemplate('lifeos://recovery/{date}', { list: undefined }),
    { description: 'WHOOP recovery snapshot for a specific date (YYYY-MM-DD or "today").' },
    async (uri, { date }) => {
      const db = await getDb()
      const resolvedDate = date === 'today' ? getToday() : String(date)
      const data = await fetchRecoveryRange(db, resolvedDate, resolvedDate)
      return json(uri.href, { date: resolvedDate, snapshot: data[0] ?? null })
    }
  )

  // --- Workout today ---
  server.registerResource(
    'workout-today',
    'lifeos://workout/today',
    { description: "Today's training session: prescribed exercises, sets, reps, weight, RPE targets, and plan status." },
    async (uri) => {
      const db = await getDb()
      const data = await fetchTodayWorkoutSession(db)
      return json(uri.href, data)
    }
  )

  // --- Workout logs by date (template) ---
  server.registerResource(
    'workout-logs',
    new ResourceTemplate('lifeos://workout/logs/{date}', { list: undefined }),
    { description: 'All logged sets for a given training date (YYYY-MM-DD or "today").' },
    async (uri, { date }) => {
      const db = await getDb()
      const resolvedDate = date === 'today' ? getToday() : String(date)
      const logs = await fetchWorkoutLogs(db, resolvedDate)
      return json(uri.href, { date: resolvedDate, logs })
    }
  )

  // --- Nutrition today ---
  server.registerResource(
    'nutrition-today',
    'lifeos://nutrition/today',
    { description: "Today's nutrition: macro targets, all logged meals and items, running totals vs goals." },
    async (uri) => {
      const db = await getDb()
      const today = getToday()
      const nutritionDay = await fetchNutritionDay(db, today)
      if (!nutritionDay) return json(uri.href, { date: today, message: 'No nutrition day found for today.' })
      const meals = await fetchMealsForNutritionDay(db, nutritionDay.id)
      const totals = computeMacroTotals(meals)
      return json(uri.href, { date: today, day: nutritionDay, meals, totals })
    }
  )

  // --- Nutrition plan reference ---
  server.registerResource(
    'nutrition-plan',
    'lifeos://nutrition/plan',
    { description: 'Nutrition reference data: day types with macro targets, meal templates, and core nutrition rules.' },
    async (uri) => {
      const db = await getDb()
      return json(uri.href, await fetchNutritionPlan(db))
    }
  )

  // --- Todos today ---
  server.registerResource(
    'todos-today',
    'lifeos://todos/today',
    { description: "Today's todo list, sorted by priority order." },
    async (uri) => {
      const db = await getDb()
      const today = getToday()
      return json(uri.href, { date: today, todos: await fetchTodosForDate(db, today) })
    }
  )

  // --- Brief today ---
  server.registerResource(
    'brief-today',
    'lifeos://brief/today',
    { description: "Today's AI-generated daily brief and any pending action proposals." },
    async (uri) => {
      const db = await getDb()
      const today = getToday()
      return json(uri.href, { date: today, ...(await fetchLatestBrief(db, today)) })
    }
  )

  // --- Check-in today ---
  server.registerResource(
    'checkin-today',
    'lifeos://checkin/today',
    { description: "Today's subjective check-in: soreness, motivation, energy, mood, and notes." },
    async (uri) => {
      const db = await getDb()
      const today = getToday()
      return json(uri.href, { date: today, checkin: await fetchCheckin(db, today) })
    }
  )

  // --- Body measurements trend ---
  server.registerResource(
    'body-trend',
    'lifeos://body/trend',
    { description: 'Last 90 days of WHOOP body measurements: weight, height, max heart rate.' },
    async (uri) => {
      const db = await getDb()
      return json(uri.href, await fetchBodyTrend(db))
    }
  )
}

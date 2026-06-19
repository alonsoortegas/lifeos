import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  getDb, getToday,
  fetchLatestRecovery, fetchRecoveryRange, fetchTodosForDate,
  fetchNutritionDay, fetchMealsForNutritionDay, computeMacroTotals,
  fetchTodayWorkoutSession, fetchWorkoutLogs, fetchCheckin,
  fetchLatestBrief, fetchNutritionPlan,
} from './db'

export function registerPrompts(server: McpServer) {
  server.registerPrompt('morning_brief', {
    title: 'Morning Brief',
    description: 'Full morning readiness assessment: recovery status, workout plan, and nutrition targets for today.',
  }, async () => {
    const db = await getDb()
    const today = getToday()
    const [recovery, todos, nutritionDay, workout, checkin, { brief }] = await Promise.all([
      fetchLatestRecovery(db),
      fetchTodosForDate(db, today),
      fetchNutritionDay(db, today),
      fetchTodayWorkoutSession(db),
      fetchCheckin(db, today),
      fetchLatestBrief(db, today),
    ])
    let nutritionSummary = null
    if (nutritionDay) {
      const meals = await fetchMealsForNutritionDay(db, nutritionDay.id)
      nutritionSummary = { day: nutritionDay, totals: computeMacroTotals(meals) }
    }

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Here is my LifeOS data for today (${today}):

## Recovery (WHOOP)
${JSON.stringify(recovery, null, 2)}

## Check-in
${JSON.stringify(checkin, null, 2)}

## Today's Workout
${JSON.stringify({ session: workout.session, exercises: workout.exercises, planStatus: workout.planStatus }, null, 2)}

## Todos
${JSON.stringify(todos, null, 2)}

## Nutrition
${JSON.stringify(nutritionSummary, null, 2)}

## AI Brief (if generated)
${JSON.stringify(brief?.output_json ?? null, null, 2)}

Please give me a concise morning readiness assessment:
1. Readiness verdict (green / controlled / recover / hard-no) with reasoning from the WHOOP data and check-in
2. Training recommendation — should I follow today's session, modify it, or skip?
3. Nutrition focus — any macro adjustments based on recovery and training load?
4. Top 1-2 action items from my todos
Keep it tight — I want a cockpit view, not an essay.`,
        },
      }],
    }
  })

  server.registerPrompt('weekly_summary', {
    title: 'Weekly Summary',
    description: 'Review the past 7 days: training adherence, recovery trend, nutrition pattern.',
    argsSchema: {
      days: z.string().optional().describe('Number of days to look back (default "7")'),
    },
  }, async ({ days }) => {
    const db = await getDb()
    const today = getToday()
    const lookback = parseInt(days ?? '7', 10)
    const start = new Date()
    start.setDate(start.getDate() - lookback)
    const startDate = start.toISOString().slice(0, 10)

    const [recovery, workoutLogs] = await Promise.all([
      fetchRecoveryRange(db, startDate, today),
      fetchWorkoutLogs(db, today),
    ])

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Here is my LifeOS data for the past ${lookback} days (${startDate} → ${today}):

## Recovery Trend
${JSON.stringify(recovery, null, 2)}

## Today's Workout Logs
${JSON.stringify(workoutLogs, null, 2)}

Please give me a weekly performance summary:
1. Recovery trend — any pattern in HRV, RHR, or strain worth noting?
2. Training adherence — how consistent was training this week?
3. Key wins and areas to improve
4. One recommendation for next week

Keep it actionable and concise.`,
        },
      }],
    }
  })

  server.registerPrompt('nutrition_check', {
    title: 'Nutrition Check',
    description: "How am I doing on macros today? Get a status check and suggestions.",
  }, async () => {
    const db = await getDb()
    const today = getToday()
    const nutritionDay = await fetchNutritionDay(db, today)
    let nutritionData = null
    if (nutritionDay) {
      const meals = await fetchMealsForNutritionDay(db, nutritionDay.id)
      const totals = computeMacroTotals(meals)
      nutritionData = { day: nutritionDay, meals, totals }
    }
    const plan = await fetchNutritionPlan(db)

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Here is my nutrition data for today (${today}):

## Today's Log
${JSON.stringify(nutritionData, null, 2)}

## Nutrition Plan Reference
Day types and macro targets:
${JSON.stringify(plan.dayTypes, null, 2)}

Nutrition rules:
${plan.rules.map((r: { rule_text: string }) => `- ${r.rule_text}`).join('\n')}

Please tell me:
1. How am I tracking against today's targets? (show macros: logged vs target)
2. What should I prioritize in my next meals to hit the day's goals?
3. Any red flags or things looking good?

Be specific with numbers.`,
        },
      }],
    }
  })

  server.registerPrompt('workout_debrief', {
    title: 'Workout Debrief',
    description: "Post-workout summary: what I logged vs what was prescribed, progression notes.",
  }, async () => {
    const db = await getDb()
    const today = getToday()
    const [workout, logs] = await Promise.all([
      fetchTodayWorkoutSession(db),
      fetchWorkoutLogs(db, today),
    ])

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Here is my workout data for today (${today}):

## Prescribed Session
${JSON.stringify({ session: workout.session, exercises: workout.exercises }, null, 2)}

## Logged Sets
${JSON.stringify(logs, null, 2)}

Please give me a workout debrief:
1. Did I complete all exercises? Any gaps?
2. How did performance compare to the prescription (sets, reps, weight, RPE)?
3. Any progression suggestions for next time?

Keep it short — bullet points are fine.`,
        },
      }],
    }
  })

  server.registerPrompt('plan_tomorrow', {
    title: 'Plan Tomorrow',
    description: "Given today's fatigue and todos, what should tomorrow look like?",
  }, async () => {
    const db = await getDb()
    const today = getToday()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    const [recovery, todayCheckin, todoToday, briefData] = await Promise.all([
      fetchLatestRecovery(db),
      fetchCheckin(db, today),
      fetchTodosForDate(db, today),
      fetchLatestBrief(db, today),
    ])

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Today is ${today}. I'm planning for tomorrow (${tomorrowStr}).

## Today's Recovery
${JSON.stringify(recovery, null, 2)}

## Today's Check-in
${JSON.stringify(todayCheckin, null, 2)}

## Today's Todos (remaining / incomplete)
${JSON.stringify(todoToday.filter(t => !t.done), null, 2)}

## Today's Brief Recommendations
${JSON.stringify(briefData.brief?.output_json ?? null, null, 2)}

Please help me plan tomorrow:
1. What's my likely readiness for tomorrow based on today's data?
2. Any incomplete todos I should carry forward?
3. What should I focus on (training, recovery, nutrition)?
4. Top 3 priority todos to set for tomorrow

Be direct and practical.`,
        },
      }],
    }
  })
}

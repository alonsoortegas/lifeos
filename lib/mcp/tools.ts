import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  getDb, getToday,
  fetchRecoveryRange, fetchTodosForDate,
  fetchNutritionDay, fetchMealsForNutritionDay, computeMacroTotals,
  fetchTodayWorkoutSession, fetchWorkoutLogs, fetchWorkouts, fetchTrendsMetrics, fetchCheckin,
  fetchLatestBrief, fetchBodyTrend, fetchNutritionPlan,
  ensureNutritionDay,
  fetchFinanceData, ensureFinAccount, ensureFinInstrument,
} from './db'
import { buildPositions, summarizePortfolio } from '@/lib/finance'
import type { FinHolding, FinInstrument } from '@/lib/types'

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true as const }
}

export function registerTools(server: McpServer) {
  // ── Read tools ──────────────────────────────────────────────────────────────

  server.registerTool('get_recovery', {
    description: 'Get WHOOP recovery data for a date range. Returns recovery score, HRV, strain, sleep metrics.',
    inputSchema: {
      start_date: z.string().describe('Start date YYYY-MM-DD (or "today")'),
      end_date: z.string().describe('End date YYYY-MM-DD (or "today")'),
    },
  }, async ({ start_date, end_date }) => {
    const db = await getDb()
    const today = getToday()
    const start = start_date === 'today' ? today : start_date
    const end = end_date === 'today' ? today : end_date
    return ok(await fetchRecoveryRange(db, start, end))
  })

  server.registerTool('get_workout_session', {
    description: "Get the training session for a given week and day. Defaults to today's active session.",
    inputSchema: {
      block_slug: z.string().optional().describe('Training block slug (e.g. "bulk-summer-2026"). Omit for current.'),
      week_number: z.number().int().optional().describe('Week within the block (1-based). Omit for current.'),
      day_of_week: z.string().optional().describe('Day key: monday, wednesday, thursday, friday, saturday. Omit for today.'),
    },
  }, async ({ block_slug, week_number, day_of_week }) => {
    const db = await getDb()
    if (!block_slug && !week_number && !day_of_week) {
      return ok(await fetchTodayWorkoutSession(db))
    }
    const { data: sessions } = await db
      .from('workout_sessions')
      .select('*')
      .eq('block_slug', block_slug ?? '')
      .eq('week_number', week_number ?? 1)
      .eq('day_of_week', day_of_week ?? 'monday')
    const session = sessions?.[0] ?? null
    let exercises: unknown[] = []
    if (session) {
      const { data } = await db.from('workout_exercises').select('*').eq('session_id', session.id).order('order_index')
      exercises = data ?? []
    }
    return ok({ session, exercises })
  })

  server.registerTool('get_workout_logs', {
    description: 'Get all logged sets for a specific training date.',
    inputSchema: {
      date: z.string().describe('Date YYYY-MM-DD (or "today")'),
    },
  }, async ({ date }) => {
    const db = await getDb()
    const resolved = date === 'today' ? getToday() : date
    return ok({ date: resolved, logs: await fetchWorkoutLogs(db, resolved) })
  })

  server.registerTool('get_workouts', {
    description: 'Get WHOOP-detected workouts (runs, rides, lifts, etc.) for a date range. Distinct from get_workout_logs, which returns manually logged strength sets. Each workout includes sport, strain, avg/max HR, duration, distance, pace, energy (kcal), and HR-zone minutes. Use category to filter out lifestyle movement (commuting/walking).',
    inputSchema: {
      start_date: z.string().describe('Start date YYYY-MM-DD (or "today")'),
      end_date: z.string().describe('End date YYYY-MM-DD (or "today")'),
      category: z.enum(['all', 'training', 'lifestyle']).optional().describe('Filter: "training" excludes commuting/walking, "lifestyle" keeps only those. Default "all".'),
    },
  }, async ({ start_date, end_date, category }) => {
    const db = await getDb()
    const today = getToday()
    const start = start_date === 'today' ? today : start_date
    const end = end_date === 'today' ? today : end_date
    const workouts = await fetchWorkouts(db, start, end, category ?? 'all')
    return ok({ start, end, category: category ?? 'all', count: workouts.length, workouts })
  })

  server.registerTool('get_trends', {
    description: 'Get computed training trends for a time range: body weight vs phase target (21-day rate + since-phase-start totals, verdict), strength (e1RM per key lift, weekly tonnage, strength/volume chips), engine (running efficiency and pace per run), weekly load (training minutes, sessions, strain, training-vs-lifestyle split), and fuel (daily kcal/protein vs target, adherence percentages, protein g/kg, 21-day energy balance vs the scale-implied surplus). Includes the current training phase (bulk/cut/maintenance).',
    inputSchema: {
      range: z.enum(['4w', '12w', '6m', 'all']).optional().describe('Lookback window. Default "12w".'),
    },
  }, async ({ range }) => {
    const db = await getDb()
    return ok(await fetchTrendsMetrics(db, range ?? '12w'))
  })

  server.registerTool('get_nutrition_day', {
    description: 'Get nutrition targets and all logged meals with macro totals for a date.',
    inputSchema: {
      date: z.string().describe('Date YYYY-MM-DD (or "today")'),
    },
  }, async ({ date }) => {
    const db = await getDb()
    const resolved = date === 'today' ? getToday() : date
    const nutritionDay = await fetchNutritionDay(db, resolved)
    if (!nutritionDay) return ok({ date: resolved, message: 'No nutrition day found.' })
    const meals = await fetchMealsForNutritionDay(db, nutritionDay.id)
    const totals = computeMacroTotals(meals)
    return ok({ date: resolved, day: nutritionDay, meals, totals })
  })

  server.registerTool('get_todos', {
    description: 'Get the todo list for a date.',
    inputSchema: {
      date: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
    },
  }, async ({ date }) => {
    const db = await getDb()
    const resolved = date === 'today' || !date ? getToday() : date
    return ok({ date: resolved, todos: await fetchTodosForDate(db, resolved) })
  })

  server.registerTool('get_brief', {
    description: "Get the AI daily brief and pending proposals for a date.",
    inputSchema: {
      date: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
    },
  }, async ({ date }) => {
    const db = await getDb()
    const resolved = date === 'today' || !date ? getToday() : date
    return ok({ date: resolved, ...(await fetchLatestBrief(db, resolved)) })
  })

  server.registerTool('get_checkin', {
    description: "Get the daily subjective check-in (soreness, motivation, energy, mood) for a date.",
    inputSchema: {
      date: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
    },
  }, async ({ date }) => {
    const db = await getDb()
    const resolved = date === 'today' || !date ? getToday() : date
    return ok({ date: resolved, checkin: await fetchCheckin(db, resolved) })
  })

  server.registerTool('get_body_trend', {
    description: 'Get body measurements trend (weight, height, max HR) from WHOOP.',
    inputSchema: {
      days: z.number().int().optional().describe('Number of past days to include. Default 90.'),
    },
  }, async ({ days }) => {
    const db = await getDb()
    return ok(await fetchBodyTrend(db, days ?? 90))
  })

  server.registerTool('get_nutrition_plan', {
    description: 'Get the nutrition reference data: day types with macro targets, meal templates, and nutrition rules.',
    inputSchema: {},
  }, async () => {
    const db = await getDb()
    return ok(await fetchNutritionPlan(db))
  })

  server.registerTool('get_month_review', {
    description: 'Get aggregated monthly stats: average recovery, workouts completed, nutrition days, todo completion.',
    inputSchema: {
      year: z.number().int().describe('Year (e.g. 2026)'),
      month: z.number().int().min(1).max(12).describe('Month 1–12'),
    },
  }, async ({ year, month }) => {
    const db = await getDb()
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0)
    const endDate = end.toISOString().slice(0, 10)

    const [recoveryData, todoData, workoutLogData] = await Promise.all([
      fetchRecoveryRange(db, startDate, endDate),
      db.from('todos').select('done,day_date').gte('day_date', startDate).lte('day_date', endDate),
      db.from('workout_logs').select('logged_at').gte('logged_at', `${startDate}T00:00:00`).lte('logged_at', `${endDate}T23:59:59`),
    ])

    const recovery = recoveryData as Array<{ recovery_score: number | null; hrv_rmssd: number | null; strain: number | null }>
    const avgRecovery = recovery.length ? Math.round(recovery.reduce((s, r) => s + (r.recovery_score ?? 0), 0) / recovery.length) : null
    const avgHrv = recovery.length ? Math.round(recovery.reduce((s, r) => s + (r.hrv_rmssd ?? 0), 0) / recovery.length * 10) / 10 : null

    const todos = (todoData.data ?? []) as Array<{ done: boolean; day_date: string }>
    const totalTodos = todos.length
    const doneTodos = todos.filter(t => t.done).length

    const trainingDays = new Set((workoutLogData.data ?? []).map((w: { logged_at: string }) => w.logged_at.slice(0, 10))).size

    return ok({
      period: { year, month, startDate, endDate },
      recovery: { days: recovery.length, avgRecovery, avgHrv },
      todos: { total: totalTodos, done: doneTodos, completionRate: totalTodos ? Math.round(doneTodos / totalTodos * 100) : null },
      training: { daysWithSets: trainingDays },
    })
  })

  server.registerTool('get_portfolio', {
    description: 'Get the investment portfolio summary: total value, invested cost, unrealized P/L, day change, allocation by asset class, and per-holding values.',
    inputSchema: {},
  }, async () => {
    const db = await getDb()
    const { instruments, holdings, prices } = await fetchFinanceData(db)
    const summary = summarizePortfolio(
      buildPositions(holdings as FinHolding[], instruments as FinInstrument[], prices as { instrument_id: number; price: number; as_of: string }[]),
    )
    return ok({
      totalValue: summary.totalValue,
      totalCost: summary.totalCost,
      totalPL: summary.totalPL,
      totalPLPct: summary.totalPLPct,
      dayChange: summary.dayChange,
      dayChangePct: summary.dayChangePct,
      byClass: summary.byClass,
      positions: summary.positions.map((p) => ({
        symbol: p.position.instrument.symbol,
        asset_class: p.position.instrument.asset_class,
        quantity: p.position.holding.quantity,
        price: p.position.price,
        marketValue: p.marketValue,
        unrealizedPL: p.unrealizedPL,
        unrealizedPLPct: p.unrealizedPLPct,
      })),
    })
  })

  server.registerTool('get_holdings', {
    description: 'Get raw investment holdings with their accounts and instruments (no valuation).',
    inputSchema: {},
  }, async () => {
    const db = await getDb()
    const { accounts, instruments, holdings } = await fetchFinanceData(db)
    return ok({ accounts, instruments, holdings })
  })

  // ── Write tools ─────────────────────────────────────────────────────────────

  server.registerTool('add_holding', {
    description: 'Add or update an investment holding. Creates the account and instrument if they do not exist.',
    inputSchema: {
      symbol: z.string().describe('Ticker/symbol, e.g. "VWCE" or "BTC"'),
      asset_class: z.enum(['etf', 'stock', 'crypto']).describe('Asset class'),
      quantity: z.number().describe('Units held'),
      avg_cost: z.number().optional().describe('Average cost per unit'),
      account_name: z.string().optional().describe('Account/broker name. Defaults to "Manual".'),
      isin: z.string().optional().describe('ISIN, if known'),
    },
  }, async ({ symbol, asset_class, quantity, avg_cost, account_name, isin }) => {
    const db = await getDb()
    const account = await ensureFinAccount(db, account_name ?? 'Manual', 'broker')
    if (!account) return err('could not create account')
    const instrument = await ensureFinInstrument(db, symbol.toUpperCase(), asset_class, isin ?? null)
    if (!instrument) return err('could not create instrument')
    const { data, error } = await db
      .from('fin_holdings')
      .upsert(
        { account_id: account.id, instrument_id: instrument.id, quantity, avg_cost: avg_cost ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,instrument_id' },
      )
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('log_finance_transaction', {
    description: 'Record an investment transaction (buy/sell/dividend/etc.). Creates the account and instrument if needed.',
    inputSchema: {
      symbol: z.string().describe('Ticker/symbol'),
      asset_class: z.enum(['etf', 'stock', 'crypto']).describe('Asset class'),
      type: z.enum(['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'transfer']).describe('Transaction type'),
      quantity: z.number().optional().describe('Units'),
      price: z.number().optional().describe('Price per unit'),
      fee: z.number().optional().describe('Fee'),
      amount: z.number().optional().describe('Total cash amount'),
      currency: z.string().optional().describe('Currency code, default EUR'),
      traded_at: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
      account_name: z.string().optional().describe('Account/broker name. Defaults to "Manual".'),
    },
  }, async ({ symbol, asset_class, type, quantity, price, fee, amount, currency, traded_at, account_name }) => {
    const db = await getDb()
    const account = await ensureFinAccount(db, account_name ?? 'Manual', 'broker')
    if (!account) return err('could not create account')
    const instrument = await ensureFinInstrument(db, symbol.toUpperCase(), asset_class, null)
    if (!instrument) return err('could not create instrument')
    const { data, error } = await db
      .from('fin_transactions')
      .insert({
        account_id: account.id,
        instrument_id: instrument.id,
        type,
        quantity: quantity ?? null,
        price: price ?? null,
        fee: fee ?? 0,
        amount: amount ?? null,
        currency: currency ?? 'EUR',
        traded_at: traded_at ?? getToday(),
        source: 'manual',
      })
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('log_workout_set', {
    description: 'Log a completed set for an exercise. Auto-attaches to today\'s session if available.',
    inputSchema: {
      exercise_name: z.string().describe('Name of the exercise'),
      set_number: z.number().int().describe('Set number (1-based)'),
      weight_kg: z.number().optional().describe('Weight in kg (for strength exercises)'),
      reps: z.number().int().optional().describe('Reps completed'),
      rpe: z.number().optional().describe('Rate of Perceived Exertion (1-10)'),
      distance_m: z.number().optional().describe('Distance in metres (for erg/carry exercises)'),
      duration_s: z.number().optional().describe('Duration in seconds (for erg exercises)'),
      notes: z.string().optional().describe('Free-form notes'),
    },
  }, async ({ exercise_name, set_number, weight_kg, reps, rpe, distance_m, duration_s, notes }) => {
    const db = await getDb()
    const { planStatus, session, exercises } = await fetchTodayWorkoutSession(db)

    const matchedExercise = (exercises as Array<{ id: number; exercise_name: string }>)
      .find(e => e.exercise_name.toLowerCase() === exercise_name.toLowerCase())

    const weight_lbs = weight_kg != null ? Math.round(weight_kg * 2.20462 * 10) / 10 : null

    const row = {
      exercise_name,
      set_number,
      weight_lbs,
      weight_unit: 'lbs',
      reps: reps ?? null,
      rpe: rpe ?? null,
      distance_m: distance_m ?? null,
      duration_s: duration_s ?? null,
      notes: notes ?? null,
      workout_session_id: session?.id ?? null,
      workout_exercise_id: matchedExercise?.id ?? null,
    }

    const { data, error } = await db.from('workout_logs').insert(row).select().single()
    if (error) return err(error.message)
    return ok({ logged: data, planStatus })
  })

  server.registerTool('log_meal_item', {
    description: 'Log a food item to a meal for a given date. Looks up macros from the food portion database.',
    inputSchema: {
      meal_name: z.enum(['breakfast', 'midday', 'pre_workout', 'post_workout', 'dinner', 'snack']).describe('Meal slot'),
      food_key: z.string().describe('Food key from the nutrition_food_portions table (e.g. "chicken_270g_raw")'),
      quantity: z.number().describe('Multiplier relative to the standard portion (e.g. 1.5 for 1.5 portions)'),
      date: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
    },
  }, async ({ meal_name, food_key, quantity, date }) => {
    const db = await getDb()
    const resolved = date === 'today' || !date ? getToday() : date

    const { data: portion, error: portionErr } = await db
      .from('nutrition_food_portions')
      .select('*')
      .eq('food_key', food_key)
      .single()
    if (portionErr || !portion) return err(`Food key "${food_key}" not found in database.`)

    const nutritionDay = await ensureNutritionDay(db, resolved)
    if (!nutritionDay) return err('Could not find or create nutrition day.')

    let { data: mealLog } = await db
      .from('meal_log')
      .select('id')
      .eq('nutrition_day_id', nutritionDay.id)
      .eq('meal_name', meal_name)
      .maybeSingle()

    if (!mealLog) {
      const { data, error } = await db
        .from('meal_log')
        .insert({ nutrition_day_id: nutritionDay.id, meal_name })
        .select('id')
        .single()
      if (error) return err(error.message)
      mealLog = data
    }

    const p = portion as { protein_g: number; carbs_g: number; fat_g: number; label: string }
    const macros = {
      protein_g: Math.round(p.protein_g * quantity * 10) / 10,
      carbs_g: Math.round(p.carbs_g * quantity * 10) / 10,
      fat_g: Math.round(p.fat_g * quantity * 10) / 10,
      calories: Math.round((p.protein_g * 4 + p.carbs_g * 4 + p.fat_g * 9) * quantity),
    }

    const { data: item, error: itemErr } = await db
      .from('meal_log_item')
      .insert({
        meal_log_id: mealLog!.id,
        food_item_id: null,
        custom_food_name: p.label,
        source: 'custom',
        quantity,
        ...macros,
        substitution_group: food_key,
      })
      .select()
      .single()
    if (itemErr) return err(itemErr.message)

    return ok({ logged: item, food: p.label, macros })
  })

  server.registerTool('add_todo', {
    description: 'Add a new todo/goal for a given date.',
    inputSchema: {
      text: z.string().describe('The goal or task text'),
      date: z.string().optional().describe('Date YYYY-MM-DD. Defaults to today.'),
    },
  }, async ({ text, date }) => {
    const db = await getDb()
    const resolved = date === 'today' || !date ? getToday() : date
    const todos = await fetchTodosForDate(db, resolved)
    const sort_order = todos.length > 0 ? Math.max(...todos.map(t => t.sort_order)) + 1 : 0
    const { data, error } = await db
      .from('todos')
      .insert({ text, done: false, day_date: resolved, sort_order })
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('complete_todo', {
    description: 'Mark a todo as done.',
    inputSchema: {
      todo_id: z.number().int().describe('The ID of the todo to complete'),
    },
  }, async ({ todo_id }) => {
    const db = await getDb()
    const { data, error } = await db
      .from('todos')
      .update({ done: true })
      .eq('id', todo_id)
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('delete_todo', {
    description: 'Delete a todo permanently.',
    inputSchema: {
      todo_id: z.number().int().describe('The ID of the todo to delete'),
    },
  }, async ({ todo_id }) => {
    const db = await getDb()
    const { error } = await db.from('todos').delete().eq('id', todo_id)
    if (error) return err(error.message)
    return ok({ deleted: true, todo_id })
  })

  server.registerTool('set_training_phase', {
    description: 'Declare a new training phase (bulk / cut / maintenance) starting on a date. History is preserved; the row with the latest start date becomes the current phase. Default target rates: bulk +0.25 kg/wk, cut -0.50 kg/wk, maintenance ±0.15 kg/wk band.',
    inputSchema: {
      phase: z.enum(['bulk', 'cut', 'maintenance']).describe('The phase to start'),
      started_on: z.string().optional().describe('Start date YYYY-MM-DD. Defaults to today.'),
      target_rate_kg_per_week: z.number().optional().describe('Override the default weekly weight-change target (kg/week; negative for a cut, band half-width for maintenance).'),
      notes: z.string().optional().describe('Optional note, e.g. the goal of the phase'),
    },
  }, async ({ phase, started_on, target_rate_kg_per_week, notes }) => {
    const db = await getDb()
    const { data, error } = await db
      .from('training_phases')
      .insert({
        phase,
        started_on: started_on ?? getToday(),
        target_rate_kg_per_week: target_rate_kg_per_week ?? null,
        notes: notes ?? null,
      })
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('save_checkin', {
    description: 'Save or update the daily subjective check-in.',
    inputSchema: {
      soreness: z.number().int().min(1).max(5).describe('Muscle soreness 1 (none) – 5 (very sore)'),
      motivation: z.number().int().min(1).max(5).describe('Motivation to train 1 (low) – 5 (high)'),
      energy: z.number().int().min(1).max(5).describe('Energy level 1 (depleted) – 5 (high)'),
      mood: z.number().int().min(1).max(5).describe('Mood 1 (low) – 5 (great)'),
      symptoms: z.string().optional().describe('Any symptoms (e.g. "stiff lower back")'),
      note: z.string().optional().describe('General notes'),
    },
  }, async ({ soreness, motivation, energy, mood, symptoms, note }) => {
    const db = await getDb()
    const today = getToday()
    const row = { check_date: today, soreness, motivation, energy, mood, symptoms: symptoms ?? null, note: note ?? null }
    const { data, error } = await db
      .from('daily_checkins')
      .upsert(row, { onConflict: 'check_date' })
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('accept_proposal', {
    description: 'Accept a pending AI proposal. This marks it accepted; the app will execute the side effect on next load.',
    inputSchema: {
      proposal_id: z.number().int().describe('The ID of the proposal to accept'),
    },
  }, async ({ proposal_id }) => {
    const db = await getDb()
    const { data, error } = await db
      .from('ai_proposals')
      .update({ status: 'accepted', resolved_at: new Date().toISOString() })
      .eq('id', proposal_id)
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })

  server.registerTool('rate_brief', {
    description: 'Rate the usefulness of a daily brief.',
    inputSchema: {
      brief_id: z.number().int().describe('The ID of the ai_briefs row'),
      rating: z.enum(['useful', 'not_useful']).describe('Was the brief useful?'),
      note: z.string().optional().describe('Optional feedback note'),
    },
  }, async ({ brief_id, rating, note }) => {
    const db = await getDb()
    const row = { brief_id, user_rating: rating, user_note: note ?? null }
    const { data, error } = await db
      .from('ai_brief_outcomes')
      .upsert(row, { onConflict: 'brief_id' })
      .select()
      .single()
    if (error) return err(error.message)
    return ok(data)
  })
}

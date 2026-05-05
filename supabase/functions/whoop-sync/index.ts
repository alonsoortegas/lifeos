// Whoop data poller — runs on cron every 30 minutes via Supabase scheduler.
// Reads refresh_token from whoop_tokens table, gets a fresh access_token,
// fetches recovery + sleep + cycle + workouts, and upserts into whoop_snapshots + whoop_workouts.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v2'

const SPORT_NAMES: Record<number, string> = {
  0: 'running',
  1: 'cycling',
  3: 'crossfit',
  16: 'baseball',
  27: 'elliptical',
  35: 'rowing',
  44: 'soccer',
  47: 'swimming',
  49: 'boxing',
  51: 'yoga',
  57: 'spin',
  63: 'walking',
  70: 'functional fitness',
  71: 'hiit',
  72: 'weightlifting',
  73: 'cross training',
  74: 'pilates',
  82: 'basketball',
  126: 'commuting',
  233: "barry's",
}

serve(async (_req) => {
  try {
    const clientId = Deno.env.get('WHOOP_CLIENT_ID')
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
      return json({ error: 'Missing required environment variables' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Load stored tokens
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('whoop_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('id', 1)
      .single()

    if (tokenErr || !tokenRow?.access_token) {
      return json({ error: 'No tokens found — complete Whoop OAuth first via /whoop-auth' }, 400)
    }

    let accessToken = tokenRow.access_token as string

    // 2. Refresh access token if we have a refresh token, otherwise use stored one
    if (tokenRow.refresh_token) {
      const tokenRes = await fetch(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })

      if (tokenRes.ok) {
        const tokens = await tokenRes.json()
        accessToken = tokens.access_token
        const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
        await supabase.from('whoop_tokens').upsert({
          id: 1,
          access_token: accessToken,
          refresh_token: tokens.refresh_token ?? tokenRow.refresh_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
      } else {
        console.warn('Token refresh failed, using stored access token')
      }
    }

    // 3. Fetch recovery, sleep, cycle, and workouts in parallel
    const [recoveryData, sleepData, cycleData, workoutData] = await Promise.all([
      whoopGet(accessToken, '/recovery?limit=1'),
      whoopGet(accessToken, '/activity/sleep?limit=1').catch((e) => { console.warn('sleep fetch failed:', e); return null }),
      whoopGet(accessToken, '/cycle?limit=1').catch((e) => { console.warn('cycle fetch failed:', e); return null }),
      whoopGet(accessToken, '/activity/workout?limit=10').catch((e) => { console.warn('workout fetch failed:', e); return null }),
    ])

    const recovery = (recoveryData?.records ?? [])[0]
    if (!recovery) return json({ error: 'No recovery records returned' }, 500)

    const sleep = (sleepData?.records ?? [])[0] ?? null
    const cycle = (cycleData?.records ?? [])[0] ?? null

    // 4. Compute sleep stage percentages + extract new daily fields
    let sleep_score: number | null = null
    let sleep_duration_ms: number | null = null
    let sleep_deep_pct: number | null = null
    let sleep_rem_pct: number | null = null
    let sleep_light_pct: number | null = null
    let sleep_awake_pct: number | null = null
    let sleep_consistency_pct: number | null = null
    let respiratory_rate: number | null = null

    if (sleep?.score) {
      sleep_score = sleep.score.sleep_performance_percentage ?? null
      sleep_consistency_pct = sleep.score.sleep_consistency_percentage ?? null
      respiratory_rate = sleep.score.respiratory_rate ?? null
      const s = sleep.score.stage_summary ?? {}
      const total = s.total_in_bed_time_milli ?? 0
      sleep_duration_ms = total || null
      if (total > 0) {
        sleep_deep_pct = ((s.total_slow_wave_sleep_time_milli ?? 0) / total) * 100
        sleep_rem_pct = ((s.total_rem_sleep_time_milli ?? 0) / total) * 100
        sleep_light_pct = ((s.total_light_sleep_time_milli ?? 0) / total) * 100
        sleep_awake_pct = ((s.total_awake_time_milli ?? 0) / total) * 100
      }
    }

    const kilojoule: number | null = cycle?.score?.kilojoule ?? null

    // 5. Upsert into whoop_snapshots
    const row = {
      cycle_id: recovery.cycle_id,
      recorded_at: recovery.created_at,
      recovery_score: recovery.score?.recovery_score ?? null,
      rhr: recovery.score?.resting_heart_rate ?? null,
      hrv_rmssd: recovery.score?.hrv_rmssd_milli ?? null,
      strain: cycle?.score?.strain ?? null,
      sleep_score,
      sleep_duration_ms,
      sleep_deep_pct,
      sleep_rem_pct,
      sleep_light_pct,
      sleep_awake_pct,
      sleep_consistency_pct,
      respiratory_rate,
      kilojoule,
      raw_json: { recovery, sleep, cycle },
    }

    const { error: upsertErr } = await supabase
      .from('whoop_snapshots')
      .upsert(row, { onConflict: 'cycle_id' })

    if (upsertErr) return json({ error: `Supabase upsert error: ${upsertErr.message}` }, 500)

    // 6. Upsert workouts
    let workoutCount = 0
    for (const w of workoutData?.records ?? []) {
      if (!w?.id || !w?.start) continue
      const zd = w.score?.zone_duration ?? {}
      const wRow = {
        workout_id: w.id,
        cycle_id: w.cycle_id ?? null,
        started_at: w.start,
        sport_name: SPORT_NAMES[w.sport_id as number] ?? `sport_${w.sport_id}`,
        strain: w.score?.strain ?? null,
        avg_hr: w.score?.average_heart_rate ?? null,
        max_hr: w.score?.max_heart_rate ?? null,
        zone0_min: zd.zone_zero_milli != null ? zd.zone_zero_milli / 60000 : null,
        zone1_min: zd.zone_one_milli != null ? zd.zone_one_milli / 60000 : null,
        zone2_min: zd.zone_two_milli != null ? zd.zone_two_milli / 60000 : null,
        zone3_min: zd.zone_three_milli != null ? zd.zone_three_milli / 60000 : null,
        zone4_min: zd.zone_four_milli != null ? zd.zone_four_milli / 60000 : null,
        zone5_min: zd.zone_five_milli != null ? zd.zone_five_milli / 60000 : null,
        raw_json: w,
      }
      const { error: wErr } = await supabase
        .from('whoop_workouts')
        .upsert(wRow, { onConflict: 'workout_id' })
      if (wErr) console.warn('workout upsert error:', wErr.message)
      else workoutCount++
    }

    return json({
      ok: true,
      cycle_id: recovery.cycle_id,
      recovery_score: recovery.score?.recovery_score,
      sleep_score,
      strain: row.strain,
      workouts_synced: workoutCount,
      synced_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('whoop-sync error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function whoopGet(token: string, path: string) {
  const res = await fetch(`${WHOOP_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Whoop ${path} error ${res.status}: ${await res.text()}`)
  return res.json()
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

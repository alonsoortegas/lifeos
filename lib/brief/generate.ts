import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addDaysToDateKey,
  formatDateKeyInTimeZone,
  getCurrentGoalDateInTimeZone,
  getZonedDayRange,
} from '@/lib/goal-dates'
import { assembleContext } from '@/lib/brief/context'
import { createDeterministicBrief } from '@/lib/brief/fallback'
import { BriefGuardError, validateAndGuardBrief } from '@/lib/brief/guards'
import { configuredBriefModels, type BriefModel } from '@/lib/brief/model'
import { BRIEF_PROMPT_VERSION } from '@/lib/brief/prompt'
import type { Brief, Proposal } from '@/lib/brief/schema'
import type {
  BriefContextPack,
  GeneratedBrief,
  StoredBrief,
  StoredProposal,
} from '@/lib/brief/types'

type DbClient = SupabaseClient
const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

function currentBriefDate() {
  return getCurrentGoalDateInTimeZone(new Date(), LIFEOS_TIME_ZONE)
}

export function hashBriefContext(pack: BriefContextPack) {
  const stablePack = {
    ...pack,
    whoop: {
      ...pack.whoop,
      // Age is display context, not new source data. Fresh/stale status still
      // changes the hash when the threshold is crossed.
      last_synced_hours_ago: undefined,
    },
  }
  return createHash('sha256')
    .update(JSON.stringify({ promptVersion: BRIEF_PROMPT_VERSION, pack: stablePack }))
    .digest('hex')
}

function proposalsFromBrief(brief: Brief) {
  const seen = new Set<string>()
  return brief.recommendations.flatMap((recommendation) => {
    const proposal = recommendation.proposal
    if (!proposal) return []
    const key = `${proposal.kind}:${JSON.stringify(proposal.payload)}`
    if (seen.has(key)) return []
    seen.add(key)
    return [proposal]
  })
}

export async function runModels(
  pack: BriefContextPack,
  models: BriefModel[] = configuredBriefModels(),
): Promise<GeneratedBrief> {
  let lastError: unknown = null
  const deterministic = (): GeneratedBrief => {
    const brief = createDeterministicBrief(pack)
    // Defense in depth: the deterministic brief must satisfy the same guards
    // as model output. A violation here is a programming bug — log it loudly
    // but still serve the brief (availability of level 2 is the contract).
    try {
      validateAndGuardBrief(brief, pack)
    } catch (error) {
      console.error('BUG: deterministic fallback brief violated guards:', error)
    }
    return {
      brief,
      model: 'deterministic-readiness-v1',
      fallbackLevel: 2,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
    }
  }

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]
    let violations: string[] = []
    const attempts = modelIndex === 0 ? 2 : 1

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await model.emitBrief(pack, violations)
        const brief = validateAndGuardBrief(result.raw, pack)
        return {
          brief,
          model: model.id,
          fallbackLevel: modelIndex === 0 ? 0 : 1,
          latencyMs: result.latencyMs,
          inputTokens: result.usage.in,
          outputTokens: result.usage.out,
        }
      } catch (error) {
        lastError = error
        if ((error as { status?: number }).status === 401) {
          // Auth failure: retrying this model is pointless, but the next rung
          // may be a different provider/key, so continue down the ladder.
          console.error(`Daily Brief model ${model.id} authentication failed; trying next fallback.`)
          break
        }
        violations = error instanceof BriefGuardError ? error.violations : [String(error)]
      }
    }
  }

  if (lastError) console.error('Daily Brief model fallback:', lastError)
  return deterministic()
}

function normalizeStoredBrief(row: Record<string, unknown>): StoredBrief {
  const proposals = (row.ai_proposals ?? []) as StoredProposal[]
  const outcomes = (row.ai_brief_outcomes ?? []) as Array<{ user_rating: 'useful' | 'not_useful' | null }>
  return {
    id: Number(row.id),
    brief_date: String(row.brief_date),
    generation: Number(row.generation),
    readiness_state: String(row.readiness_state),
    input_hash: String(row.input_hash),
    output_json: row.output_json as Brief,
    model: String(row.model),
    prompt_version: String(row.prompt_version),
    fallback_level: Number(row.fallback_level),
    created_at: String(row.created_at),
    proposals,
    outcome: outcomes[0] ?? null,
  }
}

export async function getLatestBrief(
  supabase: DbClient,
  date = currentBriefDate(),
): Promise<StoredBrief | null> {
  const { data, error } = await supabase
    .from('ai_briefs')
    .select('*, ai_proposals(*), ai_brief_outcomes(user_rating)')
    .eq('brief_date', date)
    .order('generation', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return normalizeStoredBrief(data as Record<string, unknown>)
}

async function persistBrief(
  supabase: DbClient,
  pack: BriefContextPack,
  inputHash: string,
  generated: GeneratedBrief,
  generation: number,
): Promise<StoredBrief> {
  const { data, error } = await supabase
    .from('ai_briefs')
    .insert({
      brief_date: pack.date,
      generation,
      readiness_state: pack.readiness?.state ?? 'unavailable',
      input_hash: inputHash,
      context_json: pack,
      output_json: generated.brief,
      model: generated.model,
      prompt_version: BRIEF_PROMPT_VERSION,
      fallback_level: generated.fallbackLevel,
      latency_ms: generated.latencyMs,
      input_tokens: generated.inputTokens,
      output_tokens: generated.outputTokens,
    })
    .select('*')
    .single()

  if (error || !data) {
    // Unique violation on (brief_date, generation): a concurrent request won
    // the race. Its brief is equivalent — return the winner instead of a
    // phantom row.
    if (error?.code === '23505') {
      const winner = await getLatestBrief(supabase, pack.date)
      if (winner) return winner
    }
    console.error('Daily Brief persistence failed:', error?.message)
    return {
      id: 0,
      brief_date: pack.date,
      generation,
      readiness_state: pack.readiness?.state ?? 'unavailable',
      input_hash: inputHash,
      output_json: generated.brief,
      model: generated.model,
      prompt_version: BRIEF_PROMPT_VERSION,
      fallback_level: generated.fallbackLevel,
      created_at: new Date().toISOString(),
      proposals: proposalsFromBrief(generated.brief).map((proposal, index) => ({
        id: -(index + 1),
        brief_id: 0,
        kind: proposal.kind,
        payload: proposal.payload,
        summary: proposal.summary,
        status: 'pending',
      })),
      outcome: null,
    }
  }

  const briefId = Number(data.id)
  const proposals = proposalsFromBrief(generated.brief)
  let storedProposals: StoredProposal[] = []
  if (proposals.length) {
    const { data: proposalRows } = await supabase
      .from('ai_proposals')
      .insert(proposals.map((proposal: Proposal) => ({
        brief_id: briefId,
        kind: proposal.kind,
        payload: proposal.payload,
        summary: proposal.summary,
      })))
      .select('*')
    storedProposals = (proposalRows ?? []) as StoredProposal[]
  }

  return normalizeStoredBrief({
    ...data,
    ai_proposals: storedProposals,
    ai_brief_outcomes: [],
  })
}

export type BriefGenerationMode = 'ensure' | 'refresh'

/**
 * `ensure` (GET, cron): serve the existing brief for the goal date; generate
 * only when none exists. Never regenerates, so reads cannot burn model calls
 * or expire pending proposals.
 *
 * `refresh` (explicit POST — Regenerate button, check-in save): regenerate
 * when the context pack changed, expiring the previous brief's pending
 * proposals. Always user-initiated.
 */
export async function generateDailyBrief(
  supabase: DbClient,
  date = currentBriefDate(),
  mode: BriefGenerationMode = 'ensure',
): Promise<StoredBrief> {
  const latest = await getLatestBrief(supabase, date)
  if (mode === 'ensure' && latest) return latest

  const pack = await assembleContext(supabase, date)
  const inputHash = hashBriefContext(pack)

  if (latest?.input_hash === inputHash) return latest

  if (latest) {
    await supabase
      .from('ai_proposals')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('brief_id', latest.id)
      .eq('status', 'pending')
  }

  const generated = await runModels(pack)
  const stored = await persistBrief(supabase, pack, inputHash, generated, (latest?.generation ?? 0) + 1)

  // A regeneration supersedes the brief the user may already have rated —
  // carry the rating forward so it isn't orphaned on the old generation.
  if (latest?.outcome?.user_rating && stored.id > 0 && stored.id !== latest.id) {
    await supabase.from('ai_brief_outcomes').upsert({
      brief_id: stored.id,
      user_rating: latest.outcome.user_rating,
    }, { onConflict: 'brief_id' })
    stored.outcome = { user_rating: latest.outcome.user_rating }
  }

  return stored
}

export type TrainingAdherence =
  | 'followed'
  | 'deviated_harder'
  | 'deviated_easier'
  | 'skipped'
  | 'unknown'

export interface AdherenceInput {
  expectedSession: boolean
  prescribedSets: number | null
  verdict: Brief['training_decision']['verdict']
  rpeCap: number | null
  loggedSetCount: number
  loggedRpes: number[]
}

export function classifyTrainingAdherence(input: AdherenceInput): TrainingAdherence {
  const { expectedSession, prescribedSets, verdict, rpeCap, loggedSetCount, loggedRpes } = input

  if (loggedSetCount === 0) {
    if (!expectedSession || verdict === 'skip') return 'followed'
    // A modified session may legitimately leave no set logs (e.g. Z2-only),
    // so absence of logs is not evidence of skipping.
    if (verdict === 'modify') return 'unknown'
    return 'skipped'
  }

  if (verdict === 'skip') return 'deviated_harder'
  if (rpeCap != null && loggedRpes.length && Math.max(...loggedRpes) > rpeCap + 0.5) {
    return 'deviated_harder'
  }
  if (prescribedSets != null && prescribedSets > 0 && loggedSetCount < prescribedSets * 0.5) {
    return 'deviated_easier'
  }
  return 'followed'
}

export function prescribedSetsFromContext(context: BriefContextPack): number | null {
  if (context.todays_session.status !== 'scheduled') return null
  const total = context.todays_session.exercises
    .reduce((sum, exercise) => sum + (exercise.sets ?? 0), 0)
  return total > 0 ? total : null
}

/** Latest recovery score on d+1 minus latest on d, per the local calendar. */
export function computeRecoveryDelta(
  rows: Array<{ recovery_score: number | string | null; recorded_at: string }>,
  date: string,
  timeZone: string,
): number | null {
  const nextDate = addDaysToDateKey(date, 1)
  let base: number | null = null
  let next: number | null = null
  for (const row of rows) {
    if (row.recovery_score == null) continue
    const day = formatDateKeyInTimeZone(new Date(row.recorded_at), timeZone)
    if (day === date) base = Number(row.recovery_score)
    else if (day === nextDate) next = Number(row.recovery_score)
  }
  return base != null && next != null ? next - base : null
}

export async function computePreviousBriefOutcomes(
  supabase: DbClient,
  currentDate = currentBriefDate(),
) {
  const { data: briefs } = await supabase
    .from('ai_briefs')
    .select('id, brief_date, output_json, context_json')
    .lt('brief_date', currentDate)
    .order('brief_date', { ascending: false })
    .limit(7)

  for (const row of briefs ?? []) {
    const { data: existing } = await supabase
      .from('ai_brief_outcomes')
      .select('id, computed_at')
      .eq('brief_id', row.id)
      .maybeSingle()
    if (existing?.computed_at) continue

    const date = String(row.brief_date)
    const dayRange = getZonedDayRange(date, LIFEOS_TIME_ZONE)
    const nextDayRange = getZonedDayRange(addDaysToDateKey(date, 1), LIFEOS_TIME_ZONE)

    const [logsResult, nutritionResult, recoveryResult] = await Promise.all([
      supabase
        .from('workout_logs')
        .select('rpe')
        .gte('logged_at', dayRange.startIso)
        .lt('logged_at', dayRange.endIso),
      supabase.from('nutrition_day').select('day_type').eq('date', date).maybeSingle(),
      supabase
        .from('whoop_snapshots')
        .select('recovery_score, recorded_at')
        .gte('recorded_at', dayRange.startIso)
        .lt('recorded_at', nextDayRange.endIso)
        .order('recorded_at'),
    ])

    const brief = row.output_json as Brief
    const context = row.context_json as BriefContextPack
    const logs = logsResult.data ?? []

    const adherence = classifyTrainingAdherence({
      expectedSession: context.todays_session.status === 'scheduled',
      prescribedSets: prescribedSetsFromContext(context),
      verdict: brief.training_decision.verdict,
      rpeCap: brief.training_decision.rpe_cap,
      loggedSetCount: logs.length,
      loggedRpes: logs.map((log) => log.rpe).filter((rpe): rpe is number => rpe != null).map(Number),
    })

    const recoveryDelta = computeRecoveryDelta(recoveryResult.data ?? [], date, LIFEOS_TIME_ZONE)

    await supabase.from('ai_brief_outcomes').upsert({
      brief_id: row.id,
      training_adherence: adherence,
      nutrition_day_type_actual: nutritionResult.data?.day_type ?? null,
      next_day_recovery_delta: recoveryDelta,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'brief_id' })
  }
}

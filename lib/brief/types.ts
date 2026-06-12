import type { Readiness, ReadinessState, Signal } from '@/lib/readiness'
import type { Brief, ProposalKind } from '@/lib/brief/schema'

export type WhoopStatus = 'fresh' | 'stale' | 'disconnected' | 'insufficient'
export type NutritionDayTypeKey = 'hard_training' | 'moderate_training' | 'rest_easy'

export interface ContextMetric {
  value: string
  signal?: Signal
}

export interface BriefContextPack {
  date: string
  weekday: string
  plan: {
    status: 'active' | 'not_started' | 'expired'
    week: number | null
  }
  readiness: null | {
    state: ReadinessState
    headline: string
    rpe_cap: number | null
    volume_cap: number | null
    signals: Record<string, ContextMetric>
  }
  whoop: {
    status: WhoopStatus
    recovery_score?: string
    sleep_score?: string
    strain_yesterday?: string
    last_synced_hours_ago?: string
  }
  todays_session:
    | {
        status: 'scheduled'
        id: number
        title: string
        session_type: string
        exercises: Array<{
          name: string
          sets: number | null
          reps: string | null
          target_rpe: string | null
        }>
      }
    | {
        status: 'rest' | 'no_active_plan'
        label: string
        detail: string
      }
  recent_training: Array<{
    date: string
    completed_sets: number
    average_rpe: string
  }>
  nutrition: {
    yesterday: null | {
      day_type: string
      calories: string
      protein: string
      versus_target: string
    }
    day_type_options: Array<{
      key: NutritionDayTypeKey
      label: string
      calories: string
      protein: string
      carbs: string
      fat: string
    }>
  }
  todos: Array<{ id: number; text: string; done: false }>
  check_in: null | {
    soreness?: string
    motivation?: string
    energy?: string
    mood?: string
    symptoms?: string
    note?: string
  }
  data_gaps: Array<{ source: string; impact: string }>
}

export interface StoredBrief {
  id: number
  brief_date: string
  generation: number
  readiness_state: string
  input_hash: string
  output_json: Brief
  model: string
  prompt_version: string
  fallback_level: number
  created_at: string
  proposals: StoredProposal[]
  outcome: {
    user_rating: 'useful' | 'not_useful' | null
  } | null
}

export interface StoredProposal {
  id: number
  brief_id: number
  kind: ProposalKind
  payload: Record<string, unknown>
  summary: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
}

export interface GeneratedBrief {
  brief: Brief
  model: string
  fallbackLevel: 0 | 1 | 2
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
}

export function compactReadiness(readiness: Readiness) {
  return {
    state: readiness.state,
    headline: readiness.headline,
    rpe_cap: readiness.rpeCap,
    volume_cap: readiness.volumeCap,
    signals: {
      hrv: { value: readiness.signals.hrv.value, signal: readiness.signals.hrv.signal },
      rhr: { value: readiness.signals.rhr.value, signal: readiness.signals.rhr.signal },
      sleep_score: { value: readiness.signals.sleepScore.value, signal: readiness.signals.sleepScore.signal },
      sleep_consistency: { value: readiness.signals.sleepConsist.value, signal: readiness.signals.sleepConsist.signal },
      strain_7d: { value: readiness.signals.strain7d.value, signal: readiness.signals.strain7d.signal },
    },
  }
}

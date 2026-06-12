import type { Brief, Evidence } from '@/lib/brief/schema'
import type { BriefContextPack } from '@/lib/brief/types'

function evidence(
  source: Evidence['source'],
  metric: string,
  value: string,
): Evidence {
  return { source, metric, value }
}

function trainingDecision(pack: BriefContextPack): Brief['training_decision'] {
  const state = pack.readiness?.state
  const cap = pack.readiness?.rpe_cap ?? null
  if (!pack.readiness || pack.todays_session.status === 'no_active_plan') {
    return {
      verdict: 'skip',
      modifications: ['No active, readiness-supported session is available.'],
      rpe_cap: cap,
    }
  }
  if (state === 'hardNo') {
    return { verdict: 'skip', modifications: ['Take a full recovery day.'], rpe_cap: cap }
  }
  if (state === 'recover') {
    return { verdict: 'modify', modifications: ['Use easy Zone 2 work or rest.'], rpe_cap: cap }
  }
  if (state === 'controlled') {
    return {
      verdict: 'modify',
      modifications: [`Cap effort at RPE ${cap ?? 8}.`, 'Reduce optional volume.'],
      rpe_cap: cap,
    }
  }
  if (pack.todays_session.status === 'scheduled') {
    if (pack.check_in?.symptoms) {
      // Symptoms floor: never an unmodified session, even on green readiness.
      return {
        verdict: 'modify',
        modifications: ['Symptoms reported — keep work easy and reassess before loading.'],
        rpe_cap: null,
      }
    }
    return { verdict: 'complete', modifications: [], rpe_cap: null }
  }
  return { verdict: 'skip', modifications: ['No prescribed gym session today.'], rpe_cap: null }
}

function nutritionDayType(pack: BriefContextPack): Brief['nutrition']['day_type'] {
  const state = pack.readiness?.state
  if (!pack.readiness || state === 'hardNo' || state === 'recover') return 'rest_easy'
  if (pack.todays_session.status === 'scheduled') return 'moderate_training'
  return 'rest_easy'
}

export function createDeterministicBrief(pack: BriefContextPack): Brief {
  const decision = trainingDecision(pack)
  const hasActivePlan = pack.todays_session.status !== 'no_active_plan'
  const readinessEvidence = pack.readiness
    ? evidence('readiness', 'state', pack.readiness.state)
    : evidence('whoop', 'status', pack.whoop.status)
  const sessionEvidence = pack.todays_session.status === 'scheduled'
    ? evidence('workout_plan', 'session_title', pack.todays_session.title)
    : evidence('workout_plan', 'session_status', pack.todays_session.status)
  const nutritionType = nutritionDayType(pack)
  const nutritionOption = pack.nutrition.day_type_options.find((option) => option.key === nutritionType)
  const priorities: Brief['priorities'] = []

  for (const todo of pack.todos.slice(0, 2)) {
    priorities.push({
      rank: priorities.length + 1,
      text: todo.text,
      source: 'todo',
      todo_id: todo.id,
    })
  }
  if (priorities.length < 3 && pack.todays_session.status === 'scheduled') {
    priorities.push({
      rank: priorities.length + 1,
      text: decision.verdict === 'complete'
        ? pack.todays_session.title
        : `Adjust ${pack.todays_session.title} to readiness`,
      source: 'training',
      todo_id: null,
    })
  }
  if (priorities.length === 0) {
    priorities.push({
      rank: 1,
      text: 'Protect recovery and choose one useful task.',
      source: 'recovery',
      todo_id: null,
    })
  }

  const recoveryAction: Brief['recovery_action'] =
    pack.readiness?.state === 'hardNo' || pack.check_in?.symptoms
      ? { action: 'full_rest', detail: 'Rest and reassess; seek professional advice if concerns persist.' }
      : pack.readiness?.state === 'recover'
        ? { action: 'zone2_only', detail: 'Keep movement easy and prioritize recovery.' }
        : pack.readiness?.signals.sleep_score?.signal === 'concern'
          ? { action: 'prioritize_sleep', detail: 'Protect an earlier, consistent sleep window.' }
          : { action: 'hydration', detail: 'Keep hydration steady through the day.' }

  return {
    brief_date: pack.date,
    headline: !hasActivePlan
      ? 'No active training block. Use readiness to protect the day.'
      : pack.readiness?.headline ?? 'Use a conservative plan until recovery data is complete.',
    training_decision: decision,
    nutrition: {
      day_type: nutritionType,
      timing_note: nutritionOption
        ? `${nutritionOption.carbs} carbs; place more near training when applicable.`
        : null,
    },
    recovery_action: recoveryAction,
    priorities,
    observations: [
      {
        id: 'obs-1',
        text: pack.readiness
          ? `Deterministic readiness is ${pack.readiness.state}.`
          : `WHOOP status is ${pack.whoop.status}; deterministic readiness is unavailable.`,
        evidence: [readinessEvidence],
      },
      {
        id: 'obs-2',
        text: pack.todays_session.status === 'scheduled'
          ? `${pack.todays_session.title} is scheduled.`
          : 'No active prescribed session is available.',
        evidence: [sessionEvidence],
      },
    ],
    inferences: [],
    recommendations: [
      {
        id: 'rec-training',
        domain: 'training',
        action: decision.verdict === 'complete'
          ? 'Complete the programmed session.'
          : decision.verdict === 'modify'
            ? decision.modifications[0]
            : 'Skip prescribed training load today.',
        rationale: !hasActivePlan
          ? 'The previous plan has ended, so no prescribed load should be inferred.'
          : pack.readiness?.headline ?? 'Readiness data is incomplete, so the conservative option wins.',
        confidence: pack.readiness ? 'high' : 'low',
        evidence: [readinessEvidence, sessionEvidence],
        basis: ['obs-1', 'obs-2'],
        proposal: pack.todays_session.status === 'scheduled' && decision.verdict !== 'complete'
          ? {
              kind: decision.verdict === 'skip' ? 'skip_session' : 'modify_session',
              payload: {
                session_id: pack.todays_session.id,
                modifications: decision.modifications,
                rpe_cap: decision.rpe_cap,
              },
              summary: decision.verdict === 'skip'
                ? `Skip ${pack.todays_session.title}`
                : `Apply today's training cap`,
            }
          : null,
      },
    ],
    data_gaps: pack.data_gaps,
    overall_confidence: pack.readiness && pack.whoop.status === 'fresh' ? 'medium' : 'low',
  }
}

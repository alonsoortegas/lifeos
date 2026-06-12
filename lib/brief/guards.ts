import { BriefSchema, type Brief, type Proposal } from '@/lib/brief/schema'
import { buildEvidenceCatalog, evidenceCatalogKey } from '@/lib/brief/catalog'
import type { BriefContextPack } from '@/lib/brief/types'

export class BriefGuardError extends Error {
  constructor(public violations: string[]) {
    super(violations.join('; '))
    this.name = 'BriefGuardError'
  }
}

function proposalIsValid(proposal: Proposal, pack: BriefContextPack) {
  const payload = proposal.payload
  switch (proposal.kind) {
    case 'set_nutrition_day_type':
      return pack.nutrition.day_type_options.some((option) => option.key === payload.day_type)
    case 'modify_session':
    case 'skip_session':
      return pack.todays_session.status === 'scheduled' &&
        Number(payload.session_id) === pack.todays_session.id
    case 'add_todo':
      return typeof payload.text === 'string' && payload.text.trim().length > 0
    case 'reorder_todos': {
      if (!Array.isArray(payload.todo_ids)) return false
      const ids = new Set(pack.todos.map((todo) => todo.id))
      return payload.todo_ids.every((id) => typeof id === 'number' && ids.has(id))
    }
  }
}

export function validateAndGuardBrief(raw: unknown, pack: BriefContextPack): Brief {
  const result = BriefSchema.safeParse(raw)
  if (!result.success) {
    throw new BriefGuardError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`))
  }

  const brief = result.data
  const violations: string[] = []
  const catalog = buildEvidenceCatalog(pack)

  if (brief.brief_date !== pack.date) violations.push('brief_date must match the context date')

  const state = pack.readiness?.state
  if (!state && brief.training_decision.verdict === 'complete') {
    violations.push('training cannot be complete without deterministic readiness')
  }
  if (state === 'hardNo' && brief.training_decision.verdict !== 'skip') {
    violations.push('hardNo readiness requires skip')
  }
  if (state === 'recover' && brief.training_decision.verdict === 'complete') {
    violations.push('recover readiness cannot complete training')
  }
  if (state === 'recover' && brief.training_decision.verdict === 'modify') {
    const text = brief.training_decision.modifications.join(' ').toLowerCase()
    if (!text.includes('zone 2') && !text.includes('z2') && !text.includes('easy')) {
      violations.push('recover modifications must be zone 2 or easy work')
    }
  }
  if (state === 'controlled' && brief.training_decision.verdict === 'complete') {
    violations.push('controlled readiness requires modify or skip')
  }
  // Health-safety floor in code, not prompt: reported symptoms can never
  // produce an unmodified session, regardless of readiness state.
  if (pack.check_in?.symptoms && brief.training_decision.verdict === 'complete') {
    violations.push('reported symptoms require a modified or skipped session')
  }

  const deterministicCap = pack.readiness?.rpe_cap
  if (deterministicCap != null) {
    if (brief.training_decision.rpe_cap == null) {
      violations.push('rpe_cap is required when readiness has a cap')
    } else if (brief.training_decision.rpe_cap > deterministicCap) {
      violations.push('rpe_cap cannot exceed the deterministic cap')
    }
  }

  if (!pack.nutrition.day_type_options.some((option) => option.key === brief.nutrition.day_type)) {
    violations.push('nutrition day type must exist in the context pack')
  }

  const todoIds = new Set(pack.todos.map((todo) => todo.id))
  for (const priority of brief.priorities) {
    if (priority.todo_id != null && !todoIds.has(priority.todo_id)) {
      violations.push(`priority todo_id ${priority.todo_id} is not in the context pack`)
    }
  }

  const evidences = [
    ...brief.observations.flatMap((observation) => observation.evidence),
    ...brief.recommendations.flatMap((recommendation) => recommendation.evidence),
  ]
  for (const evidence of evidences) {
    const value = catalog.get(evidenceCatalogKey(evidence.source, evidence.metric))
    if (!value) {
      violations.push(`evidence metric ${evidence.source}.${evidence.metric} is absent`)
    } else if (!value.includes(evidence.value) && !evidence.value.includes(value)) {
      violations.push(`evidence value for ${evidence.source}.${evidence.metric} does not match`)
    }
  }

  const knownBasis = new Set([
    ...brief.observations.map((item) => item.id),
    ...brief.inferences.map((item) => item.id),
  ])
  for (const inference of brief.inferences) {
    if (inference.basis.some((id) => !knownBasis.has(id))) {
      violations.push(`inference ${inference.id} has an unknown basis`)
    }
  }
  for (const recommendation of brief.recommendations) {
    if (recommendation.basis.some((id) => !knownBasis.has(id))) {
      violations.push(`recommendation ${recommendation.id} has an unknown basis`)
    }
    if (recommendation.proposal && !proposalIsValid(recommendation.proposal, pack)) {
      violations.push(`recommendation ${recommendation.id} has an invalid proposal payload`)
    }
  }

  if (violations.length) throw new BriefGuardError(violations)
  return brief
}

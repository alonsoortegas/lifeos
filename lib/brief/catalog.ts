import type { EvidenceSource } from '@/lib/brief/catalog-types'
import type { BriefContextPack } from '@/lib/brief/types'

export type EvidenceCatalog = Map<string, string>

function key(source: EvidenceSource, metric: string) {
  return `${source}.${metric}`
}

export function buildEvidenceCatalog(pack: BriefContextPack): EvidenceCatalog {
  const catalog: EvidenceCatalog = new Map()
  const add = (source: EvidenceSource, metric: string, value: string | undefined) => {
    if (value) catalog.set(key(source, metric), value)
  }

  add('workout_plan', 'status', pack.plan.status)
  if (pack.plan.week != null) add('workout_plan', 'week', String(pack.plan.week))

  if (pack.readiness) {
    add('readiness', 'state', pack.readiness.state)
    add('readiness', 'headline', pack.readiness.headline)
    if (pack.readiness.rpe_cap != null) add('readiness', 'rpe_cap', String(pack.readiness.rpe_cap))
    for (const [metric, signal] of Object.entries(pack.readiness.signals)) {
      add('readiness', metric, signal.value)
    }
  }

  add('whoop', 'status', pack.whoop.status)
  add('whoop', 'recovery_score', pack.whoop.recovery_score)
  add('whoop', 'sleep_score', pack.whoop.sleep_score)
  add('whoop', 'strain_yesterday', pack.whoop.strain_yesterday)
  add('whoop', 'last_synced_hours_ago', pack.whoop.last_synced_hours_ago)

  add('workout_plan', 'session_status', pack.todays_session.status)
  if (pack.todays_session.status === 'scheduled') {
    add('workout_plan', 'session_title', pack.todays_session.title)
    add('workout_plan', 'session_type', pack.todays_session.session_type)
  } else {
    add('workout_plan', 'rest_label', pack.todays_session.label)
    add('workout_plan', 'rest_detail', pack.todays_session.detail)
  }

  for (const row of pack.recent_training) {
    add('workout_logs', `${row.date}.completed_sets`, String(row.completed_sets))
    add('workout_logs', `${row.date}.average_rpe`, row.average_rpe)
  }

  if (pack.nutrition.yesterday) {
    add('nutrition', 'yesterday.day_type', pack.nutrition.yesterday.day_type)
    add('nutrition', 'yesterday.calories', pack.nutrition.yesterday.calories)
    add('nutrition', 'yesterday.protein', pack.nutrition.yesterday.protein)
    add('nutrition', 'yesterday.versus_target', pack.nutrition.yesterday.versus_target)
  }
  for (const option of pack.nutrition.day_type_options) {
    add('nutrition', `${option.key}.calories`, option.calories)
    add('nutrition', `${option.key}.protein`, option.protein)
    add('nutrition', `${option.key}.carbs`, option.carbs)
    add('nutrition', `${option.key}.fat`, option.fat)
  }

  for (const todo of pack.todos) add('todos', `todo_${todo.id}`, todo.text)
  if (pack.check_in) {
    for (const [metric, value] of Object.entries(pack.check_in)) {
      add('check_in', metric, value)
    }
  }

  return catalog
}

export function evidenceCatalogKey(source: EvidenceSource, metric: string) {
  return key(source, metric)
}

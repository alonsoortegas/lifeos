import type { BriefContextPack } from '@/lib/brief/types'

/** Canonical green-day context pack for Daily Brief tests. */
export function makeBriefPack(overrides: Partial<BriefContextPack> = {}): BriefContextPack {
  return {
    date: '2026-06-11',
    weekday: 'thursday',
    plan: { status: 'active', week: 6 },
    readiness: {
      state: 'green',
      headline: 'Hit it. Trust the work.',
      rpe_cap: null,
      volume_cap: null,
      signals: {
        hrv: { value: '+2%', signal: 'support' },
        rhr: { value: '+1 bpm', signal: 'support' },
        sleep_score: { value: '+4 pts', signal: 'support' },
        sleep_consistency: { value: '78%', signal: 'support' },
        strain_7d: { value: '0.96', signal: 'neutral' },
      },
    },
    whoop: {
      status: 'fresh',
      recovery_score: '82%',
      sleep_score: '84%',
      strain_yesterday: '12.4',
      last_synced_hours_ago: '1.0h',
    },
    todays_session: {
      status: 'scheduled',
      id: 12,
      title: 'Activation + Machine Work',
      session_type: 'activation',
      exercises: [{ name: 'SkiErg', sets: 2, reps: '200m', target_rpe: null }],
    },
    recent_training: [],
    nutrition: {
      yesterday: {
        day_type: 'moderate',
        calories: '1800 kcal',
        protein: '145g',
        versus_target: '82% of calorie target',
      },
      day_type_options: [
        { key: 'hard_training', label: 'Hard Training', calories: '2500 kcal', protein: '165g', carbs: '290g', fat: '65g' },
        { key: 'moderate_training', label: 'Moderate Training', calories: '2200 kcal', protein: '165g', carbs: '220g', fat: '65g' },
        { key: 'rest_easy', label: 'Rest / Easy', calories: '1950 kcal', protein: '165g', carbs: '160g', fat: '60g' },
      ],
    },
    todos: [{ id: 7, text: 'Ship onboarding', done: false }],
    check_in: null,
    data_gaps: [],
    ...overrides,
  }
}

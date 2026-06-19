export const TRAINING_BLOCKS = [
  {
    slug: 'hyrox-spring-2026',
    start: new Date('2026-04-27T00:00:00'),
    weeks: 9,
  },
  {
    slug: 'bulk-summer-2026',
    start: new Date('2026-06-29T00:00:00'),
    weeks: 11,
  },
] as const

export interface TrainingPlanStatus {
  active: boolean
  week: number | null
  blockSlug: string | null
  reason: 'not_started' | 'active' | 'expired'
}

export function getPlanStatus(reference = new Date()): TrainingPlanStatus {
  for (const block of TRAINING_BLOCKS) {
    const elapsed = reference.getTime() - block.start.getTime()
    const week = Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1
    if (week >= 1 && week <= block.weeks) {
      return { active: true, week, blockSlug: block.slug, reason: 'active' }
    }
  }

  const firstStart = TRAINING_BLOCKS[0].start.getTime()
  return reference.getTime() < firstStart
    ? { active: false, week: null, blockSlug: null, reason: 'not_started' }
    : { active: false, week: null, blockSlug: null, reason: 'expired' }
}

export function getCurrentWeek(reference = new Date()): number | null {
  return getPlanStatus(reference).week
}

export const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export type DayMeta = { label: string; dbKey: string | null; restLabel: string; restSub: string }

const LEGACY_DAY_META: Record<string, DayMeta> = {
  monday:    { label: 'MON', dbKey: 'monday',      restLabel: 'REST DAY',       restSub: 'No session scheduled' },
  tuesday:   { label: 'TUE', dbKey: null,           restLabel: 'ZONE 2 + HYROX', restSub: 'Zone 2 run AM · Hyrox class PM' },
  wednesday: { label: 'WED', dbKey: 'wednesday',    restLabel: 'REST DAY',       restSub: 'No session scheduled' },
  thursday:  { label: 'THU', dbKey: 'thursday_am',  restLabel: 'INTERVALS',      restSub: 'VO₂ max intervals PM — legs already covered AM' },
  friday:    { label: 'FRI', dbKey: null,           restLabel: 'MACHINE WORK',   restSub: 'SkiErg / Row trials or accessory work' },
  saturday:  { label: 'SAT', dbKey: null,           restLabel: 'THRESHOLD RUN',  restSub: 'Threshold run or Hyrox simulation' },
  sunday:    { label: 'SUN', dbKey: null,           restLabel: 'REST DAY',       restSub: 'Full recovery — no session scheduled' },
}

export const DAY_META: Record<string, DayMeta> = {
  monday:    { label: 'MON', dbKey: 'monday',    restLabel: 'UPPER',     restSub: 'Moderate / pump session' },
  tuesday:   { label: 'TUE', dbKey: null,        restLabel: 'ZONE 2 RUN', restSub: 'Easy conversational run · 30–40 min' },
  wednesday: { label: 'WED', dbKey: 'wednesday', restLabel: 'LOWER',     restSub: 'Hypertrophy + core session' },
  thursday:  { label: 'THU', dbKey: null,        restLabel: 'REST / BIKE', restSub: 'Rest, or easy Z2 bike · 30 min if fresh' },
  friday:    { label: 'FRI', dbKey: 'friday',    restLabel: 'UPPER',     restSub: 'Heavy / strength session' },
  saturday:  { label: 'SAT', dbKey: 'saturday',  restLabel: 'LOWER',     restSub: 'Strength + conditioning session' },
  sunday:    { label: 'SUN', dbKey: null,        restLabel: 'ZONE 2 / REST', restSub: 'Easy run · 40–50 min, or full rest' },
}

export function getDayMeta(day: string, blockSlug: string | null): DayMeta {
  const schedule = blockSlug === 'hyrox-spring-2026' ? LEGACY_DAY_META : DAY_META
  return schedule[day] ?? DAY_META.monday
}

export function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? 'monday'
}

// Training block anchored Monday April 27 2026. Weeks 1–6 were the original
// seeded plan; weeks 7–9 (through Sunday June 28) each repeat week 4 — the
// last full training week before the race taper (migrations 20260612*).
export const PLAN_START = new Date('2026-04-27T00:00:00')
export const PLAN_WEEKS = 9

export interface TrainingPlanStatus {
  active: boolean
  week: number | null
  reason: 'not_started' | 'active' | 'expired'
}

export function getPlanStatus(reference = new Date()): TrainingPlanStatus {
  const elapsed = reference.getTime() - PLAN_START.getTime()
  const week = Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1

  if (week < 1) return { active: false, week: null, reason: 'not_started' }
  if (week > PLAN_WEEKS) return { active: false, week: null, reason: 'expired' }
  return { active: true, week, reason: 'active' }
}

export function getCurrentWeek(reference = new Date()): number | null {
  return getPlanStatus(reference).week
}

export const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export const DAY_META: Record<string, { label: string; dbKey: string | null; restLabel: string; restSub: string }> = {
  monday:    { label: 'MON', dbKey: 'monday',      restLabel: 'REST DAY',       restSub: 'No session scheduled' },
  tuesday:   { label: 'TUE', dbKey: null,           restLabel: 'ZONE 2 + HYROX', restSub: 'Zone 2 run AM · Hyrox class PM' },
  wednesday: { label: 'WED', dbKey: 'wednesday',    restLabel: 'REST DAY',       restSub: 'No session scheduled' },
  thursday:  { label: 'THU', dbKey: 'thursday_am',  restLabel: 'INTERVALS',      restSub: 'VO₂ max intervals PM — legs already covered AM' },
  friday:    { label: 'FRI', dbKey: null,           restLabel: 'MACHINE WORK',   restSub: 'SkiErg / Row trials or accessory work' },
  saturday:  { label: 'SAT', dbKey: null,           restLabel: 'THRESHOLD RUN',  restSub: 'Threshold run or Hyrox simulation' },
  sunday:    { label: 'SUN', dbKey: null,           restLabel: 'REST DAY',       restSub: 'Full recovery — no session scheduled' },
}

export function getTodayKey(): string {
  return DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] ?? 'monday'
}

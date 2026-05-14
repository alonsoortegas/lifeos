// Plan started Monday April 27 2026
export const PLAN_START = new Date('2026-04-27T00:00:00')

export function getCurrentWeek(): number {
  const elapsed = Date.now() - PLAN_START.getTime()
  return Math.min(6, Math.max(1, Math.ceil(elapsed / (7 * 24 * 60 * 60 * 1000))))
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

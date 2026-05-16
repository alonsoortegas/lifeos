import { getCurrentGoalDate } from '@/lib/goal-dates'

export const FOCUS_ANCHORS = [
  'The body keeps the schedule. Show up before you feel ready.',
  'Discipline is the bridge between goals and accomplishment.',
  'Small actions, compounded daily, become identity.',
  'Consistency beats intensity. Do the boring thing again.',
  'The goal is not to feel motivated. The goal is to move.',
  "You don't rise to the occasion — you fall to your systems.",
  'Rest is part of training. Skipping it is not toughness.',
  'One hard thing per day keeps the softness away.',
  'Clarity comes from action, not from thinking about action.',
  'Build the day you want, or someone else will build it for you.',
  'Progress is not always visible. Trust the process anyway.',
  'The athlete and the builder share one thing: showing up.',
]

export function getDailyAnchor(): string {
  const dateKey = getCurrentGoalDate()
  const daysEpoch = Math.floor(new Date(dateKey).getTime() / 86_400_000)
  return FOCUS_ANCHORS[((daysEpoch % FOCUS_ANCHORS.length) + FOCUS_ANCHORS.length) % FOCUS_ANCHORS.length]
}

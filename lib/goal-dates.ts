export const GOAL_RESET_HOUR = 6

export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentGoalDate(base = new Date()) {
  const date = new Date(base)
  if (date.getHours() < GOAL_RESET_HOUR) {
    date.setDate(date.getDate() - 1)
  }
  return formatLocalDateKey(date)
}

export function getNextGoalDate(base = new Date()) {
  const date = new Date(base)
  if (date.getHours() >= GOAL_RESET_HOUR) {
    date.setDate(date.getDate() + 1)
  }
  return formatLocalDateKey(date)
}

export function getMillisecondsUntilNextGoalReset(base = new Date()) {
  const reset = new Date(base)
  reset.setHours(GOAL_RESET_HOUR, 0, 0, 0)

  if (base.getTime() >= reset.getTime()) {
    reset.setDate(reset.getDate() + 1)
  }

  return reset.getTime() - base.getTime()
}

export function formatGoalDateEyebrow(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

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

export function getCurrentGoalDateInTimeZone(
  base = new Date(),
  timeZone = 'Europe/Berlin',
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(base)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const localDate = new Date(Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
  ))
  if (Number(value.hour) < GOAL_RESET_HOUR) {
    localDate.setUTCDate(localDate.getUTCDate() - 1)
  }
  return localDate.toISOString().slice(0, 10)
}

/** Hour of day (0–23) at `base` in the given IANA time zone. */
export function getZonedHour(base = new Date(), timeZone = 'Europe/Berlin') {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(base))
}

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA time zone. */
export function formatDateKeyInTimeZone(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function addDaysToDateKey(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function timeZoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  )
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

function zonedMidnightUtc(isoDate: string, timeZone: string) {
  // Guess UTC midnight, then correct by the zone offset at that instant.
  // A second pass handles DST transitions where the offset itself changes.
  const guess = new Date(`${isoDate}T00:00:00Z`)
  const offset = timeZoneOffsetMs(guess, timeZone)
  const candidate = new Date(guess.getTime() - offset)
  const offsetAtCandidate = timeZoneOffsetMs(candidate, timeZone)
  return offsetAtCandidate === offset
    ? candidate
    : new Date(guess.getTime() - offsetAtCandidate)
}

/**
 * UTC instants bounding a local calendar day in the given IANA time zone.
 * `endIso` is exclusive (start of the next local day) and DST-correct, so a
 * day around a transition is 23 or 25 hours long.
 */
export function getZonedDayRange(isoDate: string, timeZone: string) {
  return {
    startIso: zonedMidnightUtc(isoDate, timeZone).toISOString(),
    endIso: zonedMidnightUtc(addDaysToDateKey(isoDate, 1), timeZone).toISOString(),
  }
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

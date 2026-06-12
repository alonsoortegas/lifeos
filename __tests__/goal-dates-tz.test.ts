import { describe, expect, it } from 'vitest'
import {
  addDaysToDateKey,
  formatDateKeyInTimeZone,
  getCurrentGoalDateInTimeZone,
  getZonedDayRange,
  getZonedHour,
} from '@/lib/goal-dates'

const TZ = 'Europe/Berlin'

describe('getCurrentGoalDateInTimeZone', () => {
  it('rolls back before 6 AM in winter (UTC+1)', () => {
    expect(getCurrentGoalDateInTimeZone(new Date('2026-01-15T04:30:00Z'), TZ)).toBe('2026-01-14')
    expect(getCurrentGoalDateInTimeZone(new Date('2026-01-15T05:30:00Z'), TZ)).toBe('2026-01-15')
  })

  it('rolls back before 6 AM in summer (UTC+2)', () => {
    expect(getCurrentGoalDateInTimeZone(new Date('2026-06-11T03:30:00Z'), TZ)).toBe('2026-06-10')
    expect(getCurrentGoalDateInTimeZone(new Date('2026-06-11T04:30:00Z'), TZ)).toBe('2026-06-11')
  })
})

describe('getZonedHour', () => {
  it('reflects DST: the winter cron run at 4:05 UTC is before the 6 AM reset', () => {
    expect(getZonedHour(new Date('2026-01-15T04:05:00Z'), TZ)).toBe(5)
    expect(getZonedHour(new Date('2026-01-15T05:05:00Z'), TZ)).toBe(6)
  })

  it('reflects DST: the summer cron run at 4:05 UTC is past the 6 AM reset', () => {
    expect(getZonedHour(new Date('2026-06-11T04:05:00Z'), TZ)).toBe(6)
  })
})

describe('getZonedDayRange', () => {
  it('bounds an ordinary summer day at UTC+2', () => {
    expect(getZonedDayRange('2026-06-11', TZ)).toEqual({
      startIso: '2026-06-10T22:00:00.000Z',
      endIso: '2026-06-11T22:00:00.000Z',
    })
  })

  it('bounds an ordinary winter day at UTC+1', () => {
    expect(getZonedDayRange('2026-01-15', TZ)).toEqual({
      startIso: '2026-01-14T23:00:00.000Z',
      endIso: '2026-01-15T23:00:00.000Z',
    })
  })

  it('produces a 23-hour day on the spring-forward transition (2026-03-29)', () => {
    const { startIso, endIso } = getZonedDayRange('2026-03-29', TZ)
    expect(startIso).toBe('2026-03-28T23:00:00.000Z')
    expect(endIso).toBe('2026-03-29T22:00:00.000Z')
  })

  it('produces a 25-hour day on the fall-back transition (2026-10-25)', () => {
    const { startIso, endIso } = getZonedDayRange('2026-10-25', TZ)
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(25 * 3_600_000)
  })
})

describe('addDaysToDateKey / formatDateKeyInTimeZone', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysToDateKey('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDaysToDateKey('2026-06-01', -1)).toBe('2026-05-31')
  })

  it('maps a late-UTC instant to the next Berlin date', () => {
    expect(formatDateKeyInTimeZone(new Date('2026-06-11T23:30:00Z'), TZ)).toBe('2026-06-12')
  })
})

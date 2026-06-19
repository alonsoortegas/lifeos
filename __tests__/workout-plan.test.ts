import { describe, expect, it } from 'vitest'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import { getCurrentWeek, getPlanStatus } from '@/lib/workout'
import { getDefaultNutritionDayType } from '@/lib/nutrition'

describe('training plan status', () => {
  it('returns week one at the start of the block', () => {
    expect(getCurrentWeek(new Date('2026-04-27T12:00:00'))).toBe(1)
  })

  it('returns week six during the original final week', () => {
    expect(getCurrentWeek(new Date('2026-06-06T12:00:00'))).toBe(6)
  })

  it('continues into the extension weeks 7–9', () => {
    expect(getCurrentWeek(new Date('2026-06-08T12:00:00'))).toBe(7)
    expect(getCurrentWeek(new Date('2026-06-12T12:00:00'))).toBe(7)
    expect(getCurrentWeek(new Date('2026-06-28T12:00:00'))).toBe(9)
    expect(getPlanStatus(new Date('2026-06-22T12:00:00'))).toEqual({
      active: true,
      week: 9,
      blockSlug: 'hyrox-spring-2026',
      reason: 'active',
    })
  })

  it('starts the bulk block on June 29 as week one', () => {
    expect(getCurrentWeek(new Date('2026-06-29T12:00:00'))).toBe(1)
    expect(getPlanStatus(new Date('2026-07-01T12:00:00'))).toEqual({
      active: true,
      week: 1,
      blockSlug: 'bulk-summer-2026',
      reason: 'active',
    })
  })

  it('runs ten training weeks followed by a deload week', () => {
    expect(getCurrentWeek(new Date('2026-09-06T12:00:00'))).toBe(10)
    expect(getCurrentWeek(new Date('2026-09-07T12:00:00'))).toBe(11)
    expect(getCurrentWeek(new Date('2026-09-14T12:00:00'))).toBeNull()
  })
})

describe('server goal-date boundary', () => {
  it('uses 6 AM Europe/Berlin during summer time', () => {
    expect(getCurrentGoalDateInTimeZone(
      new Date('2026-06-11T03:59:00Z'),
      'Europe/Berlin',
    )).toBe('2026-06-10')
    expect(getCurrentGoalDateInTimeZone(
      new Date('2026-06-11T04:01:00Z'),
      'Europe/Berlin',
    )).toBe('2026-06-11')
  })

  it('uses 6 AM Europe/Berlin during winter time', () => {
    expect(getCurrentGoalDateInTimeZone(
      new Date('2026-01-11T04:59:00Z'),
      'Europe/Berlin',
    )).toBe('2026-01-10')
    expect(getCurrentGoalDateInTimeZone(
      new Date('2026-01-11T05:01:00Z'),
      'Europe/Berlin',
    )).toBe('2026-01-11')
  })
})

describe('bulk nutrition day defaults', () => {
  it('uses lift targets on scheduled lifting days', () => {
    expect(getDefaultNutritionDayType(new Date('2026-06-29T12:00:00'))).toBe('hard')
    expect(getDefaultNutritionDayType(new Date('2026-07-04T12:00:00'))).toBe('hard')
  })

  it('uses cardio and rest targets on non-lifting days', () => {
    expect(getDefaultNutritionDayType(new Date('2026-06-30T12:00:00'))).toBe('moderate')
    expect(getDefaultNutritionDayType(new Date('2026-07-02T12:00:00'))).toBe('rest')
    expect(getDefaultNutritionDayType(new Date('2026-07-05T12:00:00'))).toBe('moderate')
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildMonthSummary,
  isOnPointDay,
  scoreFuel,
  scoreGoals,
  scoreTraining,
  type DayScore,
} from '@/lib/review/month'

const EMPTY_DETAIL: DayScore['detail'] = {
  todos: [], briefHeadline: null, trainingVerdict: null, adherence: null,
  setsLogged: 0, avgRpe: null, consumed: null, targets: null,
}

function day(partial: Partial<DayScore>, date = '2026-06-01'): DayScore {
  return {
    date, goals: 'none', training: 'none', fuel: 'none',
    recovery: null, readiness_state: null, detail: EMPTY_DETAIL,
    ...partial,
  }
}

describe('scoreGoals', () => {
  it('is on when every todo is done', () => {
    expect(scoreGoals([{ done: true }, { done: true }])).toBe('on')
  })
  it('is partial at ≥50% done', () => {
    expect(scoreGoals([{ done: true }, { done: false }])).toBe('partial')
  })
  it('is off below 50%', () => {
    expect(scoreGoals([{ done: true }, { done: false }, { done: false }])).toBe('off')
  })
  it('is none with no todos', () => {
    expect(scoreGoals([])).toBe('none')
  })
})

describe('scoreTraining', () => {
  it('trusts the adherence label first', () => {
    expect(scoreTraining({ adherence: 'followed', hadLogs: false, expectedSession: true })).toBe('on')
    expect(scoreTraining({ adherence: 'deviated_easier', hadLogs: true, expectedSession: true })).toBe('partial')
    expect(scoreTraining({ adherence: 'unknown', hadLogs: false, expectedSession: true })).toBe('partial')
    expect(scoreTraining({ adherence: 'skipped', hadLogs: false, expectedSession: true })).toBe('off')
    expect(scoreTraining({ adherence: 'deviated_harder', hadLogs: true, expectedSession: true })).toBe('off')
  })
  it('falls back to logs vs expectation without a brief', () => {
    expect(scoreTraining({ adherence: null, hadLogs: true, expectedSession: true })).toBe('on')
    expect(scoreTraining({ adherence: null, hadLogs: false, expectedSession: true })).toBe('off')
    expect(scoreTraining({ adherence: null, hadLogs: true, expectedSession: false })).toBe('on')
    expect(scoreTraining({ adherence: null, hadLogs: false, expectedSession: false })).toBe('none')
  })
})

describe('scoreFuel', () => {
  const targets = { calories: 2200, protein_g: 165 }
  const macros = (calories: number, protein_g: number) =>
    ({ calories, protein_g, carbs_g: 0, fat_g: 0 })

  it('is on when kcal within ±10% and protein ≥90%', () => {
    expect(scoreFuel({ consumed: macros(2100, 160), targets })).toBe('on')
  })
  it('is partial when only one criterion holds', () => {
    expect(scoreFuel({ consumed: macros(2100, 100), targets })).toBe('partial') // kcal ok
    expect(scoreFuel({ consumed: macros(1500, 160), targets })).toBe('partial') // protein ok
  })
  it('is off when neither holds', () => {
    expect(scoreFuel({ consumed: macros(1500, 90), targets })).toBe('off')
  })
  it('is none without targets or with nothing logged', () => {
    expect(scoreFuel({ consumed: macros(2000, 150), targets: null })).toBe('none')
    expect(scoreFuel({ consumed: macros(0, 0), targets })).toBe('none')
  })
})

describe('buildMonthSummary', () => {
  it('computes per-channel on-point percentages over scored days only', () => {
    const days = [
      day({ goals: 'on', training: 'on', fuel: 'on' }, '2026-06-01'),
      day({ goals: 'off', training: 'partial', fuel: 'on' }, '2026-06-02'),
      day({}, '2026-06-03'), // untracked — excluded from percentages
    ]
    const summary = buildMonthSummary(days)
    expect(summary.goalsOnPct).toBe(50)
    expect(summary.trainingOnPct).toBe(50)
    expect(summary.fuelOnPct).toBe(100)
  })

  it('tracks streaks, letting untracked days pass through', () => {
    const days = [
      day({ goals: 'on', training: 'on', fuel: 'on' }, '2026-06-01'),
      day({}, '2026-06-02'), // empty day does not break the streak
      day({ goals: 'on', training: 'partial', fuel: 'on' }, '2026-06-03'),
      day({ goals: 'off', training: 'on', fuel: 'on' }, '2026-06-04'), // off breaks
      day({ goals: 'on', training: 'on', fuel: 'partial' }, '2026-06-05'),
    ]
    const summary = buildMonthSummary(days)
    expect(summary.bestStreak).toBe(2)
    expect(summary.currentStreak).toBe(1)
  })

  it('averages recovery and carries the previous-month value', () => {
    const days = [
      day({ recovery: 60 }, '2026-06-01'),
      day({ recovery: 70 }, '2026-06-02'),
    ]
    const summary = buildMonthSummary(days, 58)
    expect(summary.avgRecovery).toBe(65)
    expect(summary.prevAvgRecovery).toBe(58)
  })
})

describe('isOnPointDay', () => {
  it('requires no off channel and at least one on', () => {
    expect(isOnPointDay({ goals: 'on', training: 'partial', fuel: 'none' })).toBe(true)
    expect(isOnPointDay({ goals: 'partial', training: 'partial', fuel: 'none' })).toBe(false)
    expect(isOnPointDay({ goals: 'on', training: 'off', fuel: 'on' })).toBe(false)
  })
})

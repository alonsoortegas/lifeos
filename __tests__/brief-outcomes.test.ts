import { describe, expect, it } from 'vitest'
import {
  classifyTrainingAdherence,
  computeRecoveryDelta,
  prescribedSetsFromContext,
  type AdherenceInput,
} from '@/lib/brief/generate'
import { makeBriefPack } from '@/test-utils/brief-pack'

function input(overrides: Partial<AdherenceInput> = {}): AdherenceInput {
  return {
    expectedSession: true,
    prescribedSets: 12,
    verdict: 'complete',
    rpeCap: null,
    loggedSetCount: 12,
    loggedRpes: [7, 7.5, 8],
    ...overrides,
  }
}

describe('classifyTrainingAdherence', () => {
  it('labels a completed prescribed session as followed', () => {
    expect(classifyTrainingAdherence(input())).toBe('followed')
  })

  it('labels skip verdict with no logs as followed', () => {
    expect(classifyTrainingAdherence(input({ verdict: 'skip', loggedSetCount: 0, loggedRpes: [] }))).toBe('followed')
  })

  it('labels logged training against a skip verdict as deviated_harder', () => {
    expect(classifyTrainingAdherence(input({ verdict: 'skip' }))).toBe('deviated_harder')
  })

  it('labels logged RPE above the cap as deviated_harder', () => {
    expect(classifyTrainingAdherence(input({ verdict: 'modify', rpeCap: 8.5, loggedRpes: [8, 9.5] }))).toBe('deviated_harder')
  })

  it('tolerates logged RPE within half a point of the cap', () => {
    expect(classifyTrainingAdherence(input({ verdict: 'modify', rpeCap: 8.5, loggedRpes: [8.5, 9] }))).toBe('followed')
  })

  it('labels under half the prescribed sets as deviated_easier', () => {
    expect(classifyTrainingAdherence(input({ loggedSetCount: 4, prescribedSets: 12 }))).toBe('deviated_easier')
  })

  it('labels a complete verdict with no logs as skipped', () => {
    expect(classifyTrainingAdherence(input({ loggedSetCount: 0, loggedRpes: [] }))).toBe('skipped')
  })

  it('labels a modify verdict with no logs as unknown (Z2 work is unlogged)', () => {
    expect(classifyTrainingAdherence(input({ verdict: 'modify', loggedSetCount: 0, loggedRpes: [] }))).toBe('unknown')
  })

  it('labels a rest day with no logs as followed', () => {
    expect(classifyTrainingAdherence(input({
      expectedSession: false, prescribedSets: null, verdict: 'skip', loggedSetCount: 0, loggedRpes: [],
    }))).toBe('followed')
  })
})

describe('prescribedSetsFromContext', () => {
  it('sums prescribed sets for a scheduled session', () => {
    expect(prescribedSetsFromContext(makeBriefPack())).toBe(2)
  })

  it('returns null when no session is scheduled', () => {
    const pack = makeBriefPack({
      todays_session: { status: 'rest', label: 'REST DAY', detail: 'No session scheduled' },
    })
    expect(prescribedSetsFromContext(pack)).toBeNull()
  })
})

describe('computeRecoveryDelta', () => {
  const TZ = 'Europe/Berlin'

  it('uses the latest snapshot of d+1 minus the latest of d in local time', () => {
    const rows = [
      { recovery_score: 60, recorded_at: '2026-06-11T05:00:00Z' }, // Jun 11 Berlin
      { recovery_score: 64, recorded_at: '2026-06-11T18:00:00Z' }, // Jun 11 (latest of d)
      { recovery_score: 71, recorded_at: '2026-06-12T05:00:00Z' }, // Jun 12 (d+1)
    ]
    expect(computeRecoveryDelta(rows, '2026-06-11', TZ)).toBe(7)
  })

  it('assigns a late-UTC snapshot to the next Berlin day', () => {
    const rows = [
      { recovery_score: 60, recorded_at: '2026-06-11T05:00:00Z' },
      // 23:30 UTC = 01:30 Berlin on Jun 12 → belongs to d+1
      { recovery_score: 75, recorded_at: '2026-06-11T23:30:00Z' },
    ]
    expect(computeRecoveryDelta(rows, '2026-06-11', TZ)).toBe(15)
  })

  it('returns null when either day is missing a score', () => {
    expect(computeRecoveryDelta([
      { recovery_score: 60, recorded_at: '2026-06-11T05:00:00Z' },
      { recovery_score: null, recorded_at: '2026-06-12T05:00:00Z' },
    ], '2026-06-11', TZ)).toBeNull()
    expect(computeRecoveryDelta([], '2026-06-11', TZ)).toBeNull()
  })
})

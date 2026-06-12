import { describe, expect, it } from 'vitest'
import { createDeterministicBrief } from '@/lib/brief/fallback'
import { BriefGuardError, validateAndGuardBrief } from '@/lib/brief/guards'
import type { BriefContextPack } from '@/lib/brief/types'
import { makeBriefPack } from '@/test-utils/brief-pack'

// Spec scenarios 13–16 (conflict resolution) + 21 (symptoms) as fixture
// packs. Each must produce a guard-clean deterministic brief, and the guards
// must reject the unsafe resolution of the conflict.

const scenario13UnderFueledGreen: BriefContextPack = makeBriefPack({
  nutrition: {
    ...makeBriefPack().nutrition,
    yesterday: {
      day_type: 'hard',
      calories: '1000 kcal',
      protein: '90g',
      versus_target: '40% of calorie target',
    },
  },
})

const scenario14ConflictingSignals: BriefContextPack = makeBriefPack({
  readiness: {
    state: 'controlled',
    headline: 'Train as planned, cap RPE 8.5.',
    rpe_cap: 8.5,
    volume_cap: 0.7,
    signals: {
      hrv: { value: '-20%', signal: 'concern' },
      rhr: { value: '+1 bpm', signal: 'support' },
      sleep_score: { value: '+8 pts', signal: 'support' },
      sleep_consistency: { value: '80%', signal: 'support' },
      strain_7d: { value: '0.95', signal: 'neutral' },
    },
  },
})

const scenario15RecoverWithRaceTodo: BriefContextPack = makeBriefPack({
  readiness: {
    ...makeBriefPack().readiness!,
    state: 'recover',
    headline: 'Easy day. Z2 or rest.',
    rpe_cap: 6,
    volume_cap: 0,
  },
  todos: [{ id: 9, text: 'Hyrox simulation today', done: false }],
})

const scenario16HighLoadRatio: BriefContextPack = makeBriefPack({
  readiness: {
    ...makeBriefPack().readiness!,
    state: 'recover',
    headline: 'Easy day. Z2 or rest.',
    rpe_cap: 6,
    volume_cap: 0,
    signals: {
      ...makeBriefPack().readiness!.signals,
      strain_7d: { value: '1.25', signal: 'concern' },
    },
  },
})

const scenario21SymptomsOnGreen: BriefContextPack = makeBriefPack({
  check_in: { symptoms: 'chest tightness', soreness: '2/5' },
})

describe('conflict-scenario fixture packs', () => {
  const fixtures: Array<[string, BriefContextPack]> = [
    ['13: green readiness but 40% of calorie target', scenario13UnderFueledGreen],
    ['14: high sleep vs HRV −20% (controlled)', scenario14ConflictingSignals],
    ['15: recover readiness vs "Hyrox simulation" todo', scenario15RecoverWithRaceTodo],
    ['16: strain ratio 1.25 forces recover', scenario16HighLoadRatio],
    ['21: symptoms reported on a green day', scenario21SymptomsOnGreen],
  ]

  it.each(fixtures)('deterministic fallback is guard-clean for scenario %s', (_name, pack) => {
    expect(() => validateAndGuardBrief(createDeterministicBrief(pack), pack)).not.toThrow()
  })

  it('keeps the readiness ceiling against a harder user todo (scenario 15)', () => {
    const brief = createDeterministicBrief(scenario15RecoverWithRaceTodo)
    expect(brief.training_decision.verdict).toBe('modify')
    // The todo stays visible as a priority — the conflict is surfaced, not hidden.
    expect(brief.priorities.some((priority) => priority.todo_id === 9)).toBe(true)
  })

  it('does not argue a recover state back up on high load (scenario 16)', () => {
    const brief = createDeterministicBrief(scenario16HighLoadRatio)
    expect(brief.training_decision.verdict).not.toBe('complete')
  })
})

describe('symptoms code-guard (scenario 21)', () => {
  it('rejects an unmodified session when symptoms are reported, even on green', () => {
    const pack = scenario21SymptomsOnGreen
    const brief = structuredClone(createDeterministicBrief(pack))
    brief.training_decision.verdict = 'complete'
    brief.training_decision.modifications = []
    expect(() => validateAndGuardBrief(brief, pack)).toThrow(BriefGuardError)
  })

  it('deterministic fallback downgrades to modify with conservative recovery', () => {
    const brief = createDeterministicBrief(scenario21SymptomsOnGreen)
    expect(brief.training_decision.verdict).toBe('modify')
    expect(brief.recovery_action.action).toBe('full_rest')
    expect(JSON.stringify(brief)).not.toMatch(/diagnos|supplement|medication/i)
  })
})

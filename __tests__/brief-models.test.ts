import { describe, expect, it, vi } from 'vitest'
import { createDeterministicBrief } from '@/lib/brief/fallback'
import { runModels } from '@/lib/brief/generate'
import type { BriefModel, BriefModelResult } from '@/lib/brief/model'
import { makeBriefPack } from '@/test-utils/brief-pack'

function modelResult(raw: unknown): BriefModelResult {
  return { raw, usage: { in: 800, out: 600 }, latencyMs: 1200 }
}

function fakeModel(id: string, emit: BriefModel['emitBrief']): BriefModel {
  return { id, emitBrief: emit }
}

function unauthorizedError() {
  return Object.assign(new Error('401 authentication_error'), { status: 401 })
}

describe('runModels fallback ladder', () => {
  it('returns level 0 when the primary model emits a valid brief', async () => {
    const pack = makeBriefPack()
    const valid = createDeterministicBrief(pack)
    const primary = vi.fn(async () => modelResult(valid))

    const result = await runModels(pack, [fakeModel('primary-model', primary)])

    expect(result.fallbackLevel).toBe(0)
    expect(result.model).toBe('primary-model')
    expect(result.inputTokens).toBe(800)
    expect(primary).toHaveBeenCalledTimes(1)
  })

  it('retries the primary once with guard violations, then falls to the cheap model at level 1', async () => {
    // Spec scenario 18: schema/guard-invalid output → retry → level 1 recorded.
    const pack = makeBriefPack()
    const valid = createDeterministicBrief(pack)
    const invalid = { ...structuredClone(valid), headline: null }

    const violationsSeen: string[][] = []
    const primary = vi.fn(async (_pack, retryViolations: string[] = []) => {
      violationsSeen.push(retryViolations)
      return modelResult(invalid)
    })
    const cheap = vi.fn(async () => modelResult(valid))

    const result = await runModels(pack, [
      fakeModel('primary-model', primary),
      fakeModel('cheap-model', cheap),
    ])

    expect(primary).toHaveBeenCalledTimes(2)
    expect(violationsSeen[0]).toEqual([])
    expect(violationsSeen[1].length).toBeGreaterThan(0)
    expect(result.fallbackLevel).toBe(1)
    expect(result.model).toBe('cheap-model')
  })

  it('continues down the ladder on a 401 instead of jumping to deterministic', async () => {
    const pack = makeBriefPack()
    const valid = createDeterministicBrief(pack)
    const primary = vi.fn(async () => { throw unauthorizedError() })
    const cheap = vi.fn(async () => modelResult(valid))

    const result = await runModels(pack, [
      fakeModel('primary-model', primary),
      fakeModel('cheap-model', cheap),
    ])

    // 401 must not waste the retry attempt on the same credentials.
    expect(primary).toHaveBeenCalledTimes(1)
    expect(result.fallbackLevel).toBe(1)
    expect(result.model).toBe('cheap-model')
  })

  it('returns the deterministic level 2 brief when every model fails', async () => {
    const pack = makeBriefPack()
    const failing = vi.fn(async () => { throw new Error('overloaded') })

    const result = await runModels(pack, [
      fakeModel('primary-model', failing),
      fakeModel('cheap-model', failing),
    ])

    expect(result.fallbackLevel).toBe(2)
    expect(result.model).toBe('deterministic-readiness-v1')
    expect(result.brief.training_decision.verdict).toBe('complete')
  })

  it('returns the deterministic brief when no models are configured', async () => {
    const pack = makeBriefPack()
    const result = await runModels(pack, [])
    expect(result.fallbackLevel).toBe(2)
  })
})

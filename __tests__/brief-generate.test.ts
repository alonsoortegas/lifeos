import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateDailyBrief, hashBriefContext } from '@/lib/brief/generate'
import { BRIEF_PROMPT_VERSION } from '@/lib/brief/prompt'
import { makeBriefPack } from '@/test-utils/brief-pack'

vi.mock('@/lib/brief/context', () => ({ assembleContext: vi.fn() }))
import { assembleContext } from '@/lib/brief/context'

const DATE = '2026-06-11'

type StubResult = { data: unknown; error: { code?: string; message?: string } | null }
type StubCall = { table: string; op: 'select' | 'insert' | 'update' | 'upsert'; payload?: unknown }

/** Minimal chainable PostgREST stub: every chain resolves through `resolve`. */
function createSupabaseStub(resolve: (call: StubCall) => StubResult) {
  return {
    from(table: string) {
      const call: StubCall = { table, op: 'select' }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      Object.assign(builder, {
        select: chain,
        eq: chain,
        lt: chain,
        gte: chain,
        order: chain,
        limit: chain,
        insert(payload: unknown) { call.op = 'insert'; call.payload = payload; return builder },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return builder },
        upsert(payload: unknown) { call.op = 'upsert'; call.payload = payload; return builder },
        maybeSingle: () => Promise.resolve(resolve(call)),
        single: () => Promise.resolve(resolve(call)),
        then(onFulfilled: (value: StubResult) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(resolve(call)).then(onFulfilled, onRejected)
        },
      })
      return builder
    },
  } as unknown as SupabaseClient
}

function briefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    brief_date: DATE,
    generation: 1,
    readiness_state: 'green',
    input_hash: 'stale-hash',
    output_json: { headline: 'previous' },
    model: 'deterministic-readiness-v1',
    prompt_version: BRIEF_PROMPT_VERSION,
    fallback_level: 2,
    created_at: '2026-06-11T04:05:00Z',
    ai_proposals: [],
    ai_brief_outcomes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(assembleContext).mockReset()
})

describe('generateDailyBrief lifecycle', () => {
  it('ensure mode serves the existing brief without assembling context or generating', async () => {
    const calls: StubCall[] = []
    const supabase = createSupabaseStub((call) => {
      calls.push(call)
      return { data: briefRow(), error: null }
    })

    const brief = await generateDailyBrief(supabase, DATE, 'ensure')

    expect(brief.id).toBe(41)
    expect(assembleContext).not.toHaveBeenCalled()
    expect(calls.every((call) => call.op === 'select')).toBe(true)
  })

  it('refresh mode is idempotent for an unchanged context pack', async () => {
    const pack = makeBriefPack()
    vi.mocked(assembleContext).mockResolvedValue(pack)
    const calls: StubCall[] = []
    const supabase = createSupabaseStub((call) => {
      calls.push(call)
      return { data: briefRow({ input_hash: hashBriefContext(pack) }), error: null }
    })

    const brief = await generateDailyBrief(supabase, DATE, 'refresh')

    expect(brief.generation).toBe(1)
    expect(calls.some((call) => call.op === 'insert')).toBe(false)
    expect(calls.some((call) => call.op === 'update')).toBe(false)
  })

  it('refresh mode regenerates on a changed pack, expiring pending proposals and bumping generation', async () => {
    const pack = makeBriefPack()
    vi.mocked(assembleContext).mockResolvedValue(pack)
    const calls: StubCall[] = []
    const supabase = createSupabaseStub((call) => {
      calls.push(call)
      if (call.table === 'ai_briefs' && call.op === 'insert') {
        return { data: { ...briefRow(), ...(call.payload as Record<string, unknown>), id: 42 }, error: null }
      }
      if (call.op === 'update') return { data: null, error: null }
      return { data: briefRow(), error: null } // existing generation 1, stale hash
    })

    const brief = await generateDailyBrief(supabase, DATE, 'refresh')

    const expiry = calls.find((call) => call.table === 'ai_proposals' && call.op === 'update')
    expect(expiry?.payload).toMatchObject({ status: 'expired' })
    const insert = calls.find((call) => call.table === 'ai_briefs' && call.op === 'insert')
    expect(insert?.payload).toMatchObject({
      generation: 2,
      input_hash: hashBriefContext(pack),
      prompt_version: BRIEF_PROMPT_VERSION,
      fallback_level: 2, // no models configured in tests
    })
    expect(brief.id).toBe(42)
    expect(brief.generation).toBe(2)
  })

  it('carries the user rating forward when a regeneration supersedes a rated brief', async () => {
    const pack = makeBriefPack()
    vi.mocked(assembleContext).mockResolvedValue(pack)
    const calls: StubCall[] = []
    const supabase = createSupabaseStub((call) => {
      calls.push(call)
      if (call.table === 'ai_briefs' && call.op === 'insert') {
        return { data: { ...briefRow(), ...(call.payload as Record<string, unknown>), id: 42 }, error: null }
      }
      if (call.op === 'update' || call.op === 'upsert') return { data: null, error: null }
      return {
        data: briefRow({ ai_brief_outcomes: [{ user_rating: 'useful' }] }),
        error: null,
      }
    })

    const brief = await generateDailyBrief(supabase, DATE, 'refresh')

    const carry = calls.find((call) => call.table === 'ai_brief_outcomes' && call.op === 'upsert')
    expect(carry?.payload).toMatchObject({ brief_id: 42, user_rating: 'useful' })
    expect(brief.outcome).toEqual({ user_rating: 'useful' })
  })

  it('returns the concurrent winner when the insert loses the generation race', async () => {
    const pack = makeBriefPack()
    vi.mocked(assembleContext).mockResolvedValue(pack)
    let selects = 0
    const winner = briefRow({ id: 99, generation: 2, input_hash: hashBriefContext(pack) })
    const supabase = createSupabaseStub((call) => {
      if (call.table === 'ai_briefs' && call.op === 'insert') {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      if (call.op === 'update') return { data: null, error: null }
      selects += 1
      // First read: stale generation 1. After the conflict: the winner row.
      return { data: selects === 1 ? briefRow() : winner, error: null }
    })

    const brief = await generateDailyBrief(supabase, DATE, 'refresh')

    expect(brief.id).toBe(99)
    expect(brief.generation).toBe(2)
  })
})

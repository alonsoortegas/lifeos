import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { BriefJsonSchema } from '@/lib/brief/schema'
import { BRIEF_SYSTEM_PROMPT, serializeContext } from '@/lib/brief/prompt'
import type { BriefContextPack } from '@/lib/brief/types'

export interface BriefModelResult {
  raw: unknown
  usage: { in: number | null; out: number | null }
  latencyMs: number
}

export interface BriefModel {
  id: string
  emitBrief(pack: BriefContextPack, retryViolations?: string[]): Promise<BriefModelResult>
}

// Per-attempt timeouts. Worst case across the ladder (2 primary attempts +
// 1 fallback attempt) must stay below the route's maxDuration of 60s so the
// deterministic level-2 brief always gets a chance to run.
export const PRIMARY_MODEL_TIMEOUT_MS = 20_000
export const FALLBACK_MODEL_TIMEOUT_MS = 10_000

export function anthropicBriefModel(modelId: string, timeoutMs = PRIMARY_MODEL_TIMEOUT_MS): BriefModel {
  return {
    id: modelId,
    async emitBrief(pack, retryViolations = []) {
      const started = Date.now()
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await client.messages.create(
        {
          model: modelId,
          max_tokens: 1800,
          temperature: 0,
          system: BRIEF_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: serializeContext(pack, retryViolations) }],
          tools: [{
            name: 'emit_brief',
            description: 'Emit the validated LifeOS Daily Brief.',
            input_schema: BriefJsonSchema as Anthropic.Tool.InputSchema,
          }],
          tool_choice: { type: 'tool', name: 'emit_brief', disable_parallel_tool_use: true },
        },
        { timeout: timeoutMs, maxRetries: 0 },
      )

      const toolCall = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'emit_brief',
      )
      if (!toolCall) throw new Error('Model did not call emit_brief')

      return {
        raw: toolCall.input,
        usage: {
          in: message.usage.input_tokens,
          out: message.usage.output_tokens,
        },
        latencyMs: Date.now() - started,
      }
    },
  }
}

export function configuredBriefModels() {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const primary = process.env.ANTHROPIC_REASONING_MODEL ?? 'claude-opus-4-8'
  const cheap = process.env.ANTHROPIC_FALLBACK_MODEL ?? 'claude-haiku-4-5'
  return [
    anthropicBriefModel(primary, PRIMARY_MODEL_TIMEOUT_MS),
    anthropicBriefModel(cheap, FALLBACK_MODEL_TIMEOUT_MS),
  ]
}

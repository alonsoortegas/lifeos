import { z } from 'zod'

export const EvidenceSourceSchema = z.enum([
  'whoop',
  'readiness',
  'workout_plan',
  'workout_logs',
  'nutrition',
  'todos',
  'check_in',
])

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const EvidenceSchema = z.object({
  source: EvidenceSourceSchema,
  metric: z.string().min(1),
  value: z.string().min(1),
})

export const ObservationSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(140),
  evidence: z.array(EvidenceSchema).min(1),
})

export const InferenceSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(140),
  basis: z.array(z.string()),
  confidence: ConfidenceSchema,
})

export const ProposalKindSchema = z.enum([
  'set_nutrition_day_type',
  'modify_session',
  'skip_session',
  'add_todo',
  'reorder_todos',
])

export const ProposalSchema = z.object({
  kind: ProposalKindSchema,
  payload: z.record(z.string(), z.unknown()),
  summary: z.string().max(80),
})

export const RecommendationSchema = z.object({
  id: z.string().min(1),
  domain: z.enum(['training', 'nutrition', 'recovery', 'focus']),
  action: z.string().max(120),
  rationale: z.string().max(200),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema).min(1),
  basis: z.array(z.string()),
  proposal: ProposalSchema.nullable(),
})

export const BriefSchema = z.object({
  brief_date: z.iso.date(),
  headline: z.string().max(80),
  training_decision: z.object({
    verdict: z.enum(['complete', 'modify', 'skip']),
    modifications: z.array(z.string().max(100)),
    rpe_cap: z.number().min(0).max(10).nullable(),
  }),
  nutrition: z.object({
    day_type: z.enum(['hard_training', 'moderate_training', 'rest_easy']),
    timing_note: z.string().max(160).nullable(),
  }),
  recovery_action: z.object({
    action: z.enum([
      'prioritize_sleep',
      'zone2_only',
      'mobility',
      'full_rest',
      'hydration',
      'none',
    ]),
    detail: z.string().max(120),
  }),
  priorities: z.array(z.object({
    rank: z.number().int().min(1).max(3),
    text: z.string().max(100),
    source: z.enum(['todo', 'training', 'recovery', 'inferred']),
    todo_id: z.number().int().nullable(),
  })).max(3),
  observations: z.array(ObservationSchema).max(6),
  inferences: z.array(InferenceSchema).max(4),
  recommendations: z.array(RecommendationSchema).min(1).max(5),
  data_gaps: z.array(z.object({
    source: z.string(),
    impact: z.string().max(100),
  })),
  overall_confidence: ConfidenceSchema,
})

export type Brief = z.infer<typeof BriefSchema>
export type Evidence = z.infer<typeof EvidenceSchema>
export type Proposal = z.infer<typeof ProposalSchema>
export type ProposalKind = z.infer<typeof ProposalKindSchema>

export const BriefJsonSchema = z.toJSONSchema(BriefSchema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
})

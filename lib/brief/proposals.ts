import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentGoalDateInTimeZone } from '@/lib/goal-dates'
import type { ProposalKind } from '@/lib/brief/schema'

type DbClient = SupabaseClient
const LIFEOS_TIME_ZONE = process.env.LIFEOS_TIME_ZONE ?? 'Europe/Berlin'

const DAY_TYPE_MAP = {
  hard_training: 'hard',
  moderate_training: 'moderate',
  rest_easy: 'rest',
} as const

export async function resolveProposal(
  supabase: DbClient,
  proposalId: number,
  action: 'accept' | 'reject',
) {
  const { data: proposal, error } = await supabase
    .from('ai_proposals')
    .select('*, ai_briefs(brief_date)')
    .eq('id', proposalId)
    .eq('status', 'pending')
    .single()

  if (error || !proposal) throw new Error('Proposal is not available')
  const briefDate = String((proposal.ai_briefs as { brief_date: string }).brief_date)
  if (briefDate !== getCurrentGoalDateInTimeZone(new Date(), LIFEOS_TIME_ZONE)) {
    throw new Error('Proposal has expired')
  }

  if (action === 'accept') {
    await applyProposal(
      supabase,
      proposal.kind as ProposalKind,
      proposal.payload as Record<string, unknown>,
      briefDate,
    )
  }

  const status = action === 'accept' ? 'accepted' : 'rejected'
  const { data: updated, error: updateError } = await supabase
    .from('ai_proposals')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (updateError) throw new Error(updateError.message)
  return updated
}

async function applyProposal(
  supabase: DbClient,
  kind: ProposalKind,
  payload: Record<string, unknown>,
  briefDate: string,
) {
  if (kind === 'set_nutrition_day_type') {
    const normalized = String(payload.day_type) as keyof typeof DAY_TYPE_MAP
    const dayType = DAY_TYPE_MAP[normalized]
    if (!dayType) throw new Error('Invalid nutrition day type')

    const { data: targets, error: targetError } = await supabase
      .from('nutrition_day_types')
      .select('kcal_target, protein_g, carbs_g, fat_g')
      .eq('key', normalized)
      .single()
    if (targetError || !targets) throw new Error('Nutrition targets are unavailable')

    const { error } = await supabase.from('nutrition_day').upsert({
      date: briefDate,
      day_type: dayType,
      goal: 'cut',
      calories_target: targets.kcal_target,
      protein_target: targets.protein_g,
      carbs_target: targets.carbs_g,
      fat_target: targets.fat_g,
    }, { onConflict: 'date' })
    if (error) throw new Error(error.message)
    return
  }

  if (kind === 'add_todo') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) throw new Error('Invalid todo text')
    const { data: last } = await supabase
      .from('todos')
      .select('sort_order')
      .eq('day_date', briefDate)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase.from('todos').insert({
      text,
      day_date: briefDate,
      sort_order: Number(last?.sort_order ?? 0) + 1,
    })
    if (error) throw new Error(error.message)
    return
  }

  if (kind === 'reorder_todos') {
    const ids = Array.isArray(payload.todo_ids)
      ? payload.todo_ids.filter((id): id is number => typeof id === 'number')
      : []
    for (let index = 0; index < ids.length; index += 1) {
      const { error } = await supabase
        .from('todos')
        .update({ sort_order: index + 1 })
        .eq('id', ids[index])
        .eq('day_date', briefDate)
      if (error) throw new Error(error.message)
    }
  }

  // Training proposals are decision records. They never rewrite the prescribed plan.
}

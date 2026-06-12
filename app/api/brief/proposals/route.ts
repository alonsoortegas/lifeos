import { NextRequest, NextResponse } from 'next/server'
import { resolveProposal } from '@/lib/brief/proposals'
import { createBriefServerClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  let body: { id?: number; action?: 'accept' | 'reject' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Number.isInteger(body.id) || !['accept', 'reject'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'A proposal id and action are required' }, { status: 400 })
  }

  try {
    const supabase = await createBriefServerClient()
    const proposal = await resolveProposal(supabase, body.id!, body.action!)
    return NextResponse.json({ proposal })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proposal could not be resolved'
    return NextResponse.json({ error: message }, { status: 409 })
  }
}

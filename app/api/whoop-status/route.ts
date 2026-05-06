import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!serviceKey) {
    return NextResponse.json({ connected: false, reauth_required: false, has_offline: false })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: row } = await supabase
    .from('whoop_tokens')
    .select('access_token, refresh_token, reauth_required, scope')
    .eq('id', 1)
    .single()

  if (!row?.access_token) {
    return NextResponse.json({ connected: false, reauth_required: false, has_offline: false })
  }

  return NextResponse.json({
    connected: true,
    reauth_required: row.reauth_required ?? false,
    // has_offline is true only when a refresh_token is present (requires offline scope)
    has_offline: !!row.refresh_token,
  })
}

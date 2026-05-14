'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { WhoopSnapshot, WhoopWorkout } from '@/lib/types'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
)

export function useWhoopData() {
  const [snap, setSnap] = useState<WhoopSnapshot | null>(null)
  const [history, setHistory] = useState<WhoopSnapshot[]>([])
  const [workouts, setWorkouts] = useState<WhoopWorkout[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [reauthRequired, setReauthRequired] = useState(false)
  const [hasOffline, setHasOffline] = useState(true)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    const [snapRes, histRes, wktRes] = await Promise.all([
      supabase.from('whoop_snapshots').select('*').order('recorded_at', { ascending: false }).limit(1).single(),
      supabase.from('whoop_snapshots').select('*').order('recorded_at', { ascending: false }).limit(30),
      supabase.from('whoop_workouts').select('*').order('started_at', { ascending: false }).limit(25),
    ])

    if (snapRes.data) setSnap(snapRes.data as WhoopSnapshot)
    if (histRes.data) setHistory([...(histRes.data as WhoopSnapshot[])].reverse())
    if (wktRes.data) setWorkouts(wktRes.data as WhoopWorkout[])

    // PGRST116 = "no rows" — expected when Whoop hasn't synced yet, not a real error
    const hasError = [snapRes.error, histRes.error, wktRes.error].some(
      e => e && e.code !== 'PGRST116'
    )
    setLoadError(hasError ? 'failed to load' : null)
  }

  useEffect(() => {
    void load()
    fetch('/api/whoop-status')
      .then(r => r.json())
      .then(d => {
        setReauthRequired(d.reauth_required ?? false)
        setHasOffline(d.has_offline ?? true)
        setTokenExpired(d.expires_at ? new Date(d.expires_at).getTime() <= Date.now() : false)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function syncNow() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/whoop-sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSyncMsg(`synced · recovery ${data.recovery_score}% · ${data.workouts_synced ?? 0} workouts`)
        void load()
      } else if (data.error === 'reauth_required') {
        setReauthRequired(true)
        setSyncMsg(null)
      } else {
        setSyncMsg(data.error ?? 'sync failed')
      }
    } catch {
      setSyncMsg('network error')
    } finally {
      setSyncing(false)
    }
  }

  return { snap, history, workouts, syncing, syncMsg, reauthRequired, hasOffline, tokenExpired, loadError, syncNow }
}

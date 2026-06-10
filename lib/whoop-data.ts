'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
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
  const [syncNeedsReconnect, setSyncNeedsReconnect] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const autoSyncStarted = useRef(false)

  const load = useCallback(async () => {
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
  }, [])

  const syncNow = useCallback(async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/whoop-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backfill: true }) })
      const data = await res.json()
      if (data.ok) {
        setSyncMsg(`synced · recovery ${data.recovery_score}% · ${data.workouts_synced ?? 0} workouts`)
        setReauthRequired(false)
        setTokenExpired(false)
        setSyncNeedsReconnect(false)
        void load()
      } else if (data.error === 'reauth_required') {
        setReauthRequired(true)
        setSyncNeedsReconnect(true)
        setSyncMsg(null)
      } else if (data.error === 'token_refresh_failed') {
        setTokenExpired(true)
        setSyncNeedsReconnect(true)
        setSyncMsg('token refresh failed')
      } else {
        setSyncMsg(data.error ?? 'sync failed')
      }
    } catch {
      setSyncMsg('network error')
    } finally {
      setSyncing(false)
    }
  }, [load])

  useEffect(() => {
    const initialId = window.setTimeout(() => { void load() }, 0)
    fetch('/api/whoop-status')
      .then(r => r.json())
      .then(d => {
        const expiresAt = d.expires_at ? new Date(d.expires_at).getTime() : null
        const expired = expiresAt != null && expiresAt <= Date.now()
        setReauthRequired(d.reauth_required ?? false)
        setHasOffline(d.has_offline ?? true)
        setTokenExpired(expired)
        setSyncNeedsReconnect((d.reauth_required ?? false) || expired)
      })
      .catch(() => {})
    return () => window.clearTimeout(initialId)
  }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('whoop_sync') !== '1' || autoSyncStarted.current) return

    autoSyncStarted.current = true
    params.delete('whoop_sync')
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
    void syncNow()
  }, [syncNow])

  const needsReconnect = reauthRequired || tokenExpired || syncNeedsReconnect

  return { snap, history, workouts, syncing, syncMsg, reauthRequired, hasOffline, tokenExpired, needsReconnect, loadError, syncNow }
}

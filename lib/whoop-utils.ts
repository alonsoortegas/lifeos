import { whoopRedirectUri } from './whoop-redirect'

export const WHOOP_CLIENT_ID = 'aeb5a295-3c6a-42a9-9657-57227bb0adb7'
export const WHOOP_SCOPES = 'offline read:recovery read:sleep read:workout read:cycles read:body_measurement'

export function whoopAuthUrl(host: string): string {
  const redirectUri = encodeURIComponent(whoopRedirectUri(host))
  const scope = encodeURIComponent(WHOOP_SCOPES)
  return `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${WHOOP_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=lifeos26`
}

export const SPORT_COLORS: Record<string, string> = {
  'functional fitness': '#f97316',
  'functional-fitness': '#f97316',
  yoga: '#10b981',
  running: '#8b5cf6',
  walking: '#6b7280',
  'weight lifting': '#06b6d4',
  weightlifting: '#06b6d4',
  lifting: '#06b6d4',
  cycling: '#3b82f6',
  hiit: '#f59e0b',
  "barry's": '#ef4444',
  barrys: '#ef4444',
  commuting: '#9ca3af',
  default: '#a78bfa',
}

export function sportColor(name: string | null): string {
  if (!name) return SPORT_COLORS.default
  const key = name.toLowerCase()
  return SPORT_COLORS[key] ?? SPORT_COLORS.default
}

export function avg(arr: (number | null)[], decimals = 0): string {
  const vals = arr.filter((v): v is number => v != null && v > 0)
  if (!vals.length) return '—'
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return decimals > 0 ? mean.toFixed(decimals) : String(Math.round(mean))
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function sleepHM(ms: number | null): string {
  if (!ms) return '—'
  const totalMin = Math.round(ms / 60000)
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
}

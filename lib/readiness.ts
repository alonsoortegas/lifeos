import type { WhoopSnapshot } from './types'

export type Signal = 'support' | 'caution' | 'concern' | 'neutral'
export type ReadinessState = 'green' | 'controlled' | 'recover' | 'hardNo'

export interface Delta {
  abs: number
  pct: number
  signal: Signal
  value: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  label: string
}

export interface Readiness {
  state: ReadinessState
  headline: string
  rationale: string[]
  rpeCap: number | null
  volumeCap: number | null
  signals: {
    hrv: Delta
    rhr: Delta
    sleepScore: Delta
    sleepConsist: Delta
    strain7d: Delta
  }
}

const THRESHOLDS = {
  hrv:         { support: -5,  caution: -15 },
  rhr:         { support: 2,   caution: 6   },
  sleepScore:  { support: 80,  caution: 65  },
  sleepConsist:{ support: 65,  caution: 50  },
  strainLoad:  { support: 0.9, caution: 1.1 },
}

const STATE_CONFIG = {
  green:      { headline: 'Hit it. Trust the work.',             rpeCap: null, volumeCap: null },
  controlled: { headline: 'Train as planned, cap RPE 8.5.',      rpeCap: 8.5,  volumeCap: 0.7  },
  recover:    { headline: 'Easy day. Z2 or rest.',               rpeCap: 6,    volumeCap: 0    },
  hardNo:     { headline: 'Rest. Body is asking.',               rpeCap: 0,    volumeCap: 0    },
}

function median(vals: number[]): number {
  if (!vals.length) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function signalToTone(s: Signal): 'good' | 'warn' | 'bad' | 'neutral' {
  return s === 'support' ? 'good' : s === 'caution' ? 'warn' : s === 'concern' ? 'bad' : 'neutral'
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`
}

function fmtBpm(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta))} bpm`
}

function scoreHrv(pct: number): Signal {
  if (pct >= THRESHOLDS.hrv.support)  return 'support'
  if (pct >= THRESHOLDS.hrv.caution)  return 'caution'
  return 'concern'
}

function scoreRhr(delta: number): Signal {
  if (delta <= THRESHOLDS.rhr.support) return 'support'
  if (delta <= THRESHOLDS.rhr.caution) return 'caution'
  return 'concern'
}

function scoreSleep(score: number): Signal {
  if (score >= THRESHOLDS.sleepScore.support) return 'support'
  if (score >= THRESHOLDS.sleepScore.caution) return 'caution'
  return 'concern'
}

function scoreSleepConsist(pct: number): Signal {
  if (pct >= THRESHOLDS.sleepConsist.support) return 'support'
  if (pct >= THRESHOLDS.sleepConsist.caution) return 'caution'
  return 'concern'
}

function scoreStrainLoad(ratio: number): Signal {
  if (ratio <= THRESHOLDS.strainLoad.support) return 'support'
  if (ratio <= THRESHOLDS.strainLoad.caution) return 'neutral'
  if (ratio <= 1.2)                           return 'caution'
  return 'concern'
}

export function computeReadiness(snapshots: WhoopSnapshot[]): Readiness | null {
  if (snapshots.length < 3) return null

  const today = snapshots[0]
  const history = snapshots.slice(1)
  const last30 = history.slice(0, 29)
  const last7  = history.slice(0, 7)

  // Baselines (median of prior 30 days, excluding today)
  const hrvBase    = median(last30.map(s => s.hrv_rmssd ?? 0).filter(v => v > 0))
  const rhrBase    = median(last30.map(s => s.rhr ?? 0).filter(v => v > 0))
  const sleepBase  = median(last30.map(s => s.sleep_score ?? 0).filter(v => v > 0))
  const consistBase = median(last7.map(s => s.sleep_consistency_pct ?? 0).filter(v => v > 0))

  // HRV
  const todayHrv = today.hrv_rmssd ?? 0
  const hrvPct   = hrvBase > 0 ? ((todayHrv - hrvBase) / hrvBase) * 100 : 0
  const hrvSig   = scoreHrv(hrvPct)
  const hrv: Delta = {
    abs: todayHrv - hrvBase, pct: hrvPct, signal: hrvSig,
    value: fmtPct(hrvPct), tone: signalToTone(hrvSig), label: 'vs 30d',
  }

  // RHR
  const todayRhr  = today.rhr ?? 0
  const rhrAbs    = rhrBase > 0 ? todayRhr - rhrBase : 0
  const rhrSig    = scoreRhr(rhrAbs)
  const rhr: Delta = {
    abs: rhrAbs, pct: rhrBase > 0 ? (rhrAbs / rhrBase) * 100 : 0, signal: rhrSig,
    value: fmtBpm(rhrAbs), tone: signalToTone(rhrSig), label: 'vs 30d',
  }

  // Sleep score
  const todaySleep  = today.sleep_score ?? 0
  const sleepAbs    = sleepBase > 0 ? todaySleep - sleepBase : 0
  const sleepSig    = scoreSleep(todaySleep)
  const sleepLabel  = sleepAbs > 5 ? 'above normal' : sleepAbs < -5 ? 'below normal' : 'in band'
  const sleepScore: Delta = {
    abs: sleepAbs, pct: sleepBase > 0 ? (sleepAbs / sleepBase) * 100 : 0, signal: sleepSig,
    value: sleepAbs >= 0 ? `+${Math.round(sleepAbs)} pts` : `${Math.round(sleepAbs)} pts`,
    tone: signalToTone(sleepSig), label: sleepLabel,
  }

  // Sleep consistency
  const todayConsist  = today.sleep_consistency_pct ?? 0
  const consistAbs    = consistBase > 0 ? todayConsist - consistBase : 0
  const consistSig    = scoreSleepConsist(todayConsist)
  const sleepConsist: Delta = {
    abs: consistAbs, pct: consistBase > 0 ? (consistAbs / consistBase) * 100 : 0, signal: consistSig,
    value: `${Math.round(todayConsist)}%`, tone: signalToTone(consistSig), label: '7d consist',
  }

  // Strain 7d:28d load ratio
  const strain28Vals  = snapshots.slice(0, 28).map(s => s.strain ?? 0)
  const strain7Vals   = last7.map(s => s.strain ?? 0)
  const strain28Avg   = strain28Vals.length ? strain28Vals.reduce((a, b) => a + b, 0) / strain28Vals.length : 1
  const strain7Avg    = strain7Vals.length  ? strain7Vals.reduce((a, b) => a + b, 0)  / strain7Vals.length  : 1
  const strainRatio   = strain28Avg > 0 ? strain7Avg / strain28Avg : 1
  const strainSig     = scoreStrainLoad(strainRatio)
  const strain7d: Delta = {
    abs: strain7Avg - strain28Avg, pct: strain28Avg > 0 ? ((strain7Avg - strain28Avg) / strain28Avg) * 100 : 0,
    signal: strainSig, value: strainRatio.toFixed(2), tone: signalToTone(strainSig), label: '7d load',
  }

  // State machine (first match wins)
  const allSignals     = [hrvSig, rhrSig, sleepSig, consistSig, strainSig]
  const concernCount   = allSignals.filter(s => s === 'concern').length
  const cautionCount   = allSignals.filter(s => s === 'caution').length
  const sickSignal     = rhrAbs > 10 && rhrSig === 'concern'

  let state: ReadinessState
  if (sickSignal || concernCount >= 3)                              state = 'hardNo'
  else if (concernCount >= 2 || todaySleep < 60 || strainRatio > 1.2) state = 'recover'
  else if (concernCount >= 1 || cautionCount >= 1)                  state = 'controlled'
  else                                                               state = 'green'

  // Rationale bullets
  const rationale: string[] = []
  if (hrvBase > 0) rationale.push(`HRV ${fmtPct(hrvPct)} vs 30d`)
  if (rhrBase > 0) rationale.push(`RHR ${fmtBpm(rhrAbs)} vs baseline`)
  if (todaySleep > 0) {
    rationale.push(`Sleep ${todaySleep}% — ${sleepSig === 'support' ? 'strong' : sleepSig === 'caution' ? 'adequate' : 'low'}`)
  }
  rationale.push(`7d load ${strainRatio.toFixed(2)} — ${strainSig === 'support' ? 'fresh' : strainSig === 'caution' ? 'building' : strainSig === 'concern' ? 'high' : 'normal'}`)

  const cfg = STATE_CONFIG[state]
  return {
    state, headline: cfg.headline, rationale, rpeCap: cfg.rpeCap, volumeCap: cfg.volumeCap,
    signals: { hrv, rhr, sleepScore, sleepConsist, strain7d },
  }
}

export function stateLabel(state: ReadinessState): string {
  return state === 'green' ? 'GREEN-LIGHT' : state === 'controlled' ? 'CONTROLLED' : state === 'recover' ? 'RECOVER' : 'HARD-NO'
}

export function stateTone(state: ReadinessState): 'good' | 'warn' | 'bad' {
  return state === 'green' ? 'good' : state === 'controlled' ? 'warn' : 'bad'
}

export function stateColor(state: ReadinessState): string {
  return state === 'green' ? '#00d26a' : state === 'controlled' ? '#f59e0b' : '#ef4444'
}

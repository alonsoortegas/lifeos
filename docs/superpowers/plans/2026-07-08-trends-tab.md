# Trends Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 7th "Trends" dashboard tab that computes phase-aware training trends (body weight vs phase target, strength e1RM + tonnage, running efficiency, weekly load) from the four existing data streams.

**Architecture:** Pure metric functions in `lib/trends.ts` (unit-tested with vitest), a `useTrends` client hook that loads the source tables and memoizes computed metrics, and a `TrendsTab` component rendering five sections. Chart primitives are extracted from WhoopTab into `components/ui/charts.tsx` and shared. One new table: `training_phases`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (`@/lib/supabase` browser client), vitest, Tailwind v4 + Aurora design tokens.

**Spec:** `docs/superpowers/specs/2026-07-08-trends-tab-design.md`

## Global Constraints

- Weekly buckets are **Monday-start** dates computed in **Europe/Berlin** time.
- `workout_logs.weight_lbs` holds **mixed units**: normalize per-row via `weight_unit` (`'lbs'` → ×0.45359237, anything else is kg). Zero/null weight sets are excluded from tonnage/e1RM.
- Phase default target rates: bulk **+0.25 kg/wk**, cut **−0.50 kg/wk**, maintenance **±0.15 kg/wk band** (explicit `target_rate_kg_per_week` overrides; for maintenance an explicit value is used as the band half-width).
- Verdict thresholds: bulk/cut `rate/target` — on_track 0.5–1.5, fast >1.5, slow <0.5. Chips: strength = median e1RM slope, ±1%/week; volume = mean of last 3 complete weeks vs prior 3, ±5%.
- Trendlines/slopes require **n ≥ 3** points; weight rate requires **≥ 5 weigh-ins in the last 21 days**.
- Aurora rules: CSS var tokens for all neutrals, Geist Mono (`var(--font-jetbrains-mono, monospace)`) for numbers, channel colors only (`#00d26a` mint, `#38bdf8` cyan, `#a78bfa` violet, `#fb7185` coral, `#fbbf24` amber), no emojis, `.panel` cards, `.sheet` for the bottom sheet.
- App code must **not** import from `lib/mcp/*`; `lib/mcp/db.ts` imports shared workout shaping from `lib/trends.ts`.
- Tests live in `__tests__/*.test.ts`, run with `npm test` (vitest). Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- The Supabase project id is `xmvvfamtrungmiqveitk` (project "lifeos"). Migrations are applied with the Supabase MCP `apply_migration` tool, and the same SQL is committed as a file under `supabase/migrations/`.

---

### Task 1: `training_phases` table + type

**Files:**
- Create: `supabase/migrations/20260709000000_training_phases.sql`
- Modify: `lib/types.ts` (append after `WhoopWorkout`)

**Interfaces:**
- Produces: table `training_phases`; TypeScript `TrainingPhase` interface (used by Tasks 3, 8, 9).

- [ ] **Step 1: Write the migration file**

```sql
-- Training phase declarations (bulk / cut / maintenance).
-- Setting a phase inserts a new row; history is preserved.
-- Current phase = row with the latest started_on.
create table training_phases (
  id          bigint primary key generated always as identity,
  phase       text not null check (phase in ('bulk','cut','maintenance')),
  started_on  date not null,
  target_rate_kg_per_week numeric(4,2),  -- null = phase default
  notes       text,
  created_at  timestamptz default now()
);
alter table training_phases enable row level security;
create policy "authenticated_all_training_phases" on training_phases
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply the migration**

Apply with the Supabase MCP tool `apply_migration` (project_id `xmvvfamtrungmiqveitk`, name `training_phases`, query = the SQL above).
Expected: `{"success":true}`

- [ ] **Step 3: Verify the table exists**

Run via Supabase MCP `execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'training_phases' order by ordinal_position;
```
Expected: 6 rows (`id`, `phase`, `started_on`, `target_rate_kg_per_week`, `notes`, `created_at`).

- [ ] **Step 4: Add the TypeScript interface**

Append to `lib/types.ts`:

```ts
export type PhaseKind = 'bulk' | 'cut' | 'maintenance'

export interface TrainingPhase {
  id: number
  phase: PhaseKind
  started_on: string
  target_rate_kg_per_week: number | null
  notes: string | null
  created_at?: string
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: exit 0

```bash
git add supabase/migrations/20260709000000_training_phases.sql lib/types.ts
git commit -m "feat: training_phases table + TrainingPhase type"
```

---

### Task 2: `lib/trends.ts` foundations (units, dates, weeks, rolling, slope, workout shaping)

**Files:**
- Create: `lib/trends.ts`
- Modify: `lib/mcp/db.ts` (replace local `classifyWorkout`/`shapeWorkout`/`RawWorkoutRow`/`WorkoutCategory` with imports)
- Test: `__tests__/trends-foundations.test.ts`

**Interfaces:**
- Produces (all exported from `lib/trends.ts`):
  - `type WorkoutCategory = 'training' | 'lifestyle'`
  - `classifyWorkout(sportName: string | null): WorkoutCategory`
  - `normalizeWeightKg(weight: number | null, unit: string | null): number | null`
  - `berlinDateKey(iso: string): string` — `YYYY-MM-DD` in Europe/Berlin
  - `weekStartKey(dateKey: string): string` — Monday of that week
  - `interface DatedValue { date: string; value: number }`
  - `rollingAverage(points: DatedValue[], windowDays: number): DatedValue[]`
  - `linearSlopePerDay(points: DatedValue[]): number | null`
  - `interface RawWorkoutRow` / `interface ShapedWorkout` / `shapeWorkout(w: RawWorkoutRow): ShapedWorkout` (same shape `lib/mcp/db.ts` used)
  - `PHASE_DEFAULT_RATE: Record<PhaseKind, number>`, `MAINTENANCE_BAND_KG = 0.15`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/trends-foundations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  classifyWorkout, normalizeWeightKg, berlinDateKey, weekStartKey,
  rollingAverage, linearSlopePerDay, shapeWorkout,
} from '@/lib/trends'

describe('classifyWorkout', () => {
  it('marks commuting and walking as lifestyle', () => {
    expect(classifyWorkout('commuting')).toBe('lifestyle')
    expect(classifyWorkout('walking')).toBe('lifestyle')
  })
  it('marks everything else (and null) as training', () => {
    expect(classifyWorkout('running')).toBe('training')
    expect(classifyWorkout('weightlifting')).toBe('training')
    expect(classifyWorkout(null)).toBe('training')
  })
})

describe('normalizeWeightKg', () => {
  it('passes kg through', () => expect(normalizeWeightKg(100, 'kg')).toBe(100))
  it('converts lbs', () => expect(normalizeWeightKg(100, 'lbs')).toBeCloseTo(45.359, 2))
  it('returns null for zero/null weight', () => {
    expect(normalizeWeightKg(0, 'kg')).toBeNull()
    expect(normalizeWeightKg(null, 'kg')).toBeNull()
  })
})

describe('berlinDateKey', () => {
  it('handles CEST (+2) rollover', () => expect(berlinDateKey('2026-07-08T22:30:00Z')).toBe('2026-07-09'))
  it('handles CET (+1) rollover', () => expect(berlinDateKey('2026-01-15T23:30:00Z')).toBe('2026-01-16'))
  it('keeps same-day times', () => expect(berlinDateKey('2026-07-08T10:00:00Z')).toBe('2026-07-08'))
})

describe('weekStartKey', () => {
  it('maps Wednesday to its Monday', () => expect(weekStartKey('2026-07-08')).toBe('2026-07-06'))
  it('maps Monday to itself', () => expect(weekStartKey('2026-07-06')).toBe('2026-07-06'))
  it('maps Sunday to the preceding Monday', () => expect(weekStartKey('2026-07-12')).toBe('2026-07-06'))
  it('crosses month boundaries', () => expect(weekStartKey('2026-08-01')).toBe('2026-07-27'))
})

describe('rollingAverage', () => {
  it('averages only points inside the calendar-day window', () => {
    const pts = [
      { date: '2026-07-01', value: 100 },
      { date: '2026-07-02', value: 102 },
      { date: '2026-07-10', value: 110 },
    ]
    expect(rollingAverage(pts, 7)).toEqual([
      { date: '2026-07-01', value: 100 },
      { date: '2026-07-02', value: 101 },
      { date: '2026-07-10', value: 110 },
    ])
  })
})

describe('linearSlopePerDay', () => {
  it('fits a perfect line', () => {
    const pts = [
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-02', value: 80.1 },
      { date: '2026-07-03', value: 80.2 },
    ]
    expect(linearSlopePerDay(pts)!).toBeCloseTo(0.1, 6)
  })
  it('returns null below 2 points', () => {
    expect(linearSlopePerDay([{ date: '2026-07-01', value: 80 }])).toBeNull()
  })
})

describe('shapeWorkout', () => {
  it('derives duration, pace, kcal and category from raw_json', () => {
    const shaped = shapeWorkout({
      workout_id: 'abc', cycle_id: null, started_at: '2026-07-07T10:31:06Z',
      sport_name: 'running', strain: 13.8, avg_hr: 155, max_hr: 174,
      zone0_min: 0.2, zone1_min: 0.6, zone2_min: 2.9, zone3_min: 31, zone4_min: 6.4, zone5_min: 0,
      raw_json: {
        start: '2026-07-07T10:31:06Z', end: '2026-07-07T11:12:18Z',
        score: { distance_meter: 6215.3, altitude_gain_meter: 129.2, kilojoule: 2318.9 },
      },
    })
    expect(shaped.category).toBe('training')
    expect(shaped.duration_min).toBeCloseTo(41.2, 1)
    expect(shaped.kcal).toBe(554)
    expect(shaped.pace_min_per_km!).toBeCloseTo(6.63, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/trends-foundations.test.ts`
Expected: FAIL — `Cannot find module '@/lib/trends'` (or equivalent resolution error)

- [ ] **Step 3: Create `lib/trends.ts`**

```ts
// Pure trend-metric functions for the Trends tab.
// No I/O here — everything is (rows, params) → series/summary, unit-tested in __tests__/.
import type { PhaseKind, TrainingPhase } from '@/lib/types'

export type { PhaseKind, TrainingPhase }

// ── Phase constants ───────────────────────────────────────────────────────────
export const PHASE_DEFAULT_RATE: Record<PhaseKind, number> = {
  bulk: 0.25,
  cut: -0.5,
  maintenance: 0,
}
export const MAINTENANCE_BAND_KG = 0.15

// ── Workout classification & shaping (shared with lib/mcp/db.ts) ────────────
// Commuting/walking are lifestyle movement, not training — stored but filtered
// out of training analysis.
const LIFESTYLE_SPORTS = new Set(['commuting', 'walking'])

export type WorkoutCategory = 'training' | 'lifestyle'

export function classifyWorkout(sportName: string | null): WorkoutCategory {
  return sportName && LIFESTYLE_SPORTS.has(sportName.toLowerCase()) ? 'lifestyle' : 'training'
}

export interface RawWorkoutRow {
  workout_id: string
  cycle_id: number | null
  started_at: string
  sport_name: string | null
  strain: number | null
  avg_hr: number | null
  max_hr: number | null
  zone0_min: number | null; zone1_min: number | null; zone2_min: number | null
  zone3_min: number | null; zone4_min: number | null; zone5_min: number | null
  raw_json: Record<string, unknown> | null
}

export interface ShapedWorkout {
  workout_id: string
  started_at: string
  sport_name: string | null
  category: WorkoutCategory
  strain: number | null
  avg_hr: number | null
  max_hr: number | null
  duration_min: number | null
  distance_m: number | null
  altitude_gain_m: number | null
  kilojoule: number | null
  kcal: number | null
  pace_min_per_km: number | null
  zone_minutes: { z0: number | null; z1: number | null; z2: number | null; z3: number | null; z4: number | null; z5: number | null }
}

// Flatten a stored workout into an analysis-friendly shape, deriving duration,
// distance, pace, and energy from raw_json (columns only keep strain/HR/zones).
export function shapeWorkout(w: RawWorkoutRow): ShapedWorkout {
  const raw = (w.raw_json ?? {}) as Record<string, unknown>
  const score = (raw.score ?? {}) as Record<string, number | null>
  const start = raw.start ? new Date(raw.start as string) : new Date(w.started_at)
  const end = raw.end ? new Date(raw.end as string) : null
  const duration_min = end ? Math.round(((end.getTime() - start.getTime()) / 60000) * 10) / 10 : null
  const distance_m = score.distance_meter ?? null
  const kilojoule = score.kilojoule ?? null
  const kcal = kilojoule != null ? Math.round(kilojoule / 4.184) : null
  const pace_min_per_km =
    distance_m && distance_m > 0 && duration_min != null
      ? Math.round((duration_min / (distance_m / 1000)) * 100) / 100
      : null
  return {
    workout_id: w.workout_id,
    started_at: w.started_at,
    sport_name: w.sport_name,
    category: classifyWorkout(w.sport_name),
    strain: w.strain,
    avg_hr: w.avg_hr,
    max_hr: w.max_hr,
    duration_min,
    distance_m,
    altitude_gain_m: score.altitude_gain_meter ?? null,
    kilojoule,
    kcal,
    pace_min_per_km,
    zone_minutes: {
      z0: w.zone0_min, z1: w.zone1_min, z2: w.zone2_min,
      z3: w.zone3_min, z4: w.zone4_min, z5: w.zone5_min,
    },
  }
}

// ── Units ─────────────────────────────────────────────────────────────────────
// workout_logs.weight_lbs holds mixed units: the app writes kg (weight_unit
// 'kg'), the MCP tool writes lbs (weight_unit 'lbs'). Normalize once here.
export function normalizeWeightKg(weight: number | null, unit: string | null): number | null {
  if (weight == null || weight <= 0) return null
  return unit === 'lbs' ? weight * 0.45359237 : weight
}

// ── Dates & weeks ─────────────────────────────────────────────────────────────
const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function berlinDateKey(iso: string): string {
  return BERLIN_DATE.format(new Date(iso))
}

function dayNumber(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000)
}

/** Monday-start week key for a YYYY-MM-DD date key. */
export function weekStartKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ── Series math ───────────────────────────────────────────────────────────────
export interface DatedValue { date: string; value: number }

/** Trailing calendar-day rolling average; input need not be contiguous. */
export function rollingAverage(points: DatedValue[], windowDays: number): DatedValue[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p) => {
    const end = dayNumber(p.date)
    const inWindow = sorted.filter((q) => {
      const d = dayNumber(q.date)
      return d > end - windowDays && d <= end
    })
    const mean = inWindow.reduce((s, q) => s + q.value, 0) / inWindow.length
    return { date: p.date, value: Math.round(mean * 100) / 100 }
  })
}

/** Least-squares slope in value-units per day. Null below 2 points. */
export function linearSlopePerDay(points: DatedValue[]): number | null {
  if (points.length < 2) return null
  const x0 = dayNumber(points[0].date)
  const xs = points.map((p) => dayNumber(p.date) - x0)
  const ys = points.map((p) => p.value)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den === 0 ? null : num / den
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/trends-foundations.test.ts`
Expected: PASS (all describe blocks)

- [ ] **Step 5: Point `lib/mcp/db.ts` at the shared implementations**

In `lib/mcp/db.ts`:
1. Add to the imports at the top:
```ts
import { classifyWorkout, shapeWorkout, type WorkoutCategory, type RawWorkoutRow } from '@/lib/trends'
```
2. Delete the local `LIFESTYLE_SPORTS` const, `WorkoutCategory` type, `classifyWorkout` function, `RawWorkoutRow` type, and `shapeWorkout` function (the block between the `// WHOOP-detected workouts...` comment and `fetchWorkouts`). Keep the comment and `fetchWorkouts` itself — it now uses the imported symbols unchanged.
3. `fetchWorkouts` keeps its exact signature: `(db, startDate, endDate, category: WorkoutCategory | 'all' = 'all')`.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test` then `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: all tests pass, tsc exit 0

- [ ] **Step 7: Commit**

```bash
git add lib/trends.ts lib/mcp/db.ts __tests__/trends-foundations.test.ts
git commit -m "feat: trends foundations — units, Berlin weeks, rolling avg, slope, shared workout shaping"
```

---

### Task 3: Body & phase metrics

**Files:**
- Modify: `lib/trends.ts` (append)
- Test: `__tests__/trends-body.test.ts`

**Interfaces:**
- Consumes: `rollingAverage`, `linearSlopePerDay`, `PHASE_DEFAULT_RATE`, `MAINTENANCE_BAND_KG`, `TrainingPhase`.
- Produces:
  - `type Verdict = 'on_track' | 'fast' | 'slow'`
  - `interface BodyTrend { weights: DatedValue[]; rolling7: DatedValue[]; ratePerWeek: number | null; targetRate: number | null; verdict: Verdict | null }`
  - `computeBodyTrend(measurements: { measured_on: string; weight_kg: number | null }[], phase: TrainingPhase | null, todayKey: string): BodyTrend`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/trends-body.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBodyTrend } from '@/lib/trends'
import type { TrainingPhase } from '@/lib/types'

const TODAY = '2026-07-08'

function phase(p: TrainingPhase['phase'], target: number | null = null): TrainingPhase {
  return { id: 1, phase: p, started_on: '2026-06-01', target_rate_kg_per_week: target, notes: null }
}

/** 7 weigh-ins every 3 days ending today, rising `ratePerWeek`. */
function weights(ratePerWeek: number, base = 80) {
  const dates = ['2026-06-20', '2026-06-23', '2026-06-26', '2026-06-29', '2026-07-02', '2026-07-05', '2026-07-08']
  const perDay = ratePerWeek / 7
  return dates.map((d, i) => ({ measured_on: d, weight_kg: base + perDay * i * 3 }))
}

describe('computeBodyTrend', () => {
  it('bulk on pace → on_track', () => {
    const t = computeBodyTrend(weights(0.25), phase('bulk'), TODAY)
    expect(t.ratePerWeek!).toBeCloseTo(0.25, 2)
    expect(t.targetRate).toBe(0.25)
    expect(t.verdict).toBe('on_track')
  })
  it('bulk gaining >1.5x target → fast', () => {
    expect(computeBodyTrend(weights(0.6), phase('bulk'), TODAY).verdict).toBe('fast')
  })
  it('cut losing <0.5x target → slow', () => {
    expect(computeBodyTrend(weights(-0.1), phase('cut'), TODAY).verdict).toBe('slow')
  })
  it('maintenance inside band → on_track, above → fast', () => {
    expect(computeBodyTrend(weights(0.1), phase('maintenance'), TODAY).verdict).toBe('on_track')
    expect(computeBodyTrend(weights(0.3), phase('maintenance'), TODAY).verdict).toBe('fast')
  })
  it('explicit maintenance target widens the band', () => {
    expect(computeBodyTrend(weights(0.3), phase('maintenance', 0.4), TODAY).verdict).toBe('on_track')
  })
  it('needs ≥5 weigh-ins in 21 days', () => {
    const few = weights(0.25).slice(-4)
    const t = computeBodyTrend(few, phase('bulk'), TODAY)
    expect(t.ratePerWeek).toBeNull()
    expect(t.verdict).toBeNull()
  })
  it('no phase → no target, no verdict, but still series', () => {
    const t = computeBodyTrend(weights(0.25), null, TODAY)
    expect(t.targetRate).toBeNull()
    expect(t.verdict).toBeNull()
    expect(t.weights.length).toBe(7)
    expect(t.rolling7.length).toBe(7)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/trends-body.test.ts`
Expected: FAIL — `computeBodyTrend` is not exported

- [ ] **Step 3: Append the implementation to `lib/trends.ts`**

```ts
// ── Body & phase ──────────────────────────────────────────────────────────────
export type Verdict = 'on_track' | 'fast' | 'slow'

export interface BodyTrend {
  weights: DatedValue[]
  rolling7: DatedValue[]
  ratePerWeek: number | null
  targetRate: number | null
  verdict: Verdict | null
}

function rateVerdict(rate: number, phase: TrainingPhase): Verdict {
  if (phase.phase === 'maintenance') {
    const band = phase.target_rate_kg_per_week != null
      ? Math.abs(phase.target_rate_kg_per_week)
      : MAINTENANCE_BAND_KG
    if (Math.abs(rate) <= band) return 'on_track'
    return rate > 0 ? 'fast' : 'slow'
  }
  const target = phase.target_rate_kg_per_week ?? PHASE_DEFAULT_RATE[phase.phase]
  const ratio = rate / target
  if (ratio > 1.5) return 'fast'
  if (ratio < 0.5) return 'slow'
  return 'on_track'
}

export function computeBodyTrend(
  measurements: { measured_on: string; weight_kg: number | null }[],
  phase: TrainingPhase | null,
  todayKey: string,
): BodyTrend {
  const weights: DatedValue[] = measurements
    .filter((m) => m.weight_kg != null && m.weight_kg > 0)
    .map((m) => ({ date: m.measured_on, value: Number(m.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const rolling7 = rollingAverage(weights, 7)

  // Weekly rate = least-squares fit over the last 21 days; needs ≥5 weigh-ins.
  const cutoff = Math.floor(Date.parse(`${todayKey}T00:00:00Z`) / 86400000) - 21
  const recent = weights.filter((w) => Math.floor(Date.parse(`${w.date}T00:00:00Z`) / 86400000) > cutoff)
  const slope = recent.length >= 5 ? linearSlopePerDay(recent) : null
  const ratePerWeek = slope != null ? Math.round(slope * 7 * 100) / 100 : null

  let targetRate: number | null = null
  let verdict: Verdict | null = null
  if (phase) {
    targetRate = phase.target_rate_kg_per_week ?? PHASE_DEFAULT_RATE[phase.phase]
    if (ratePerWeek != null) verdict = rateVerdict(ratePerWeek, phase)
  }
  return { weights, rolling7, ratePerWeek, targetRate, verdict }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/trends-body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/trends.ts __tests__/trends-body.test.ts
git commit -m "feat: body-weight trend with phase-aware rate verdict"
```

---

### Task 4: Strength metrics (e1RM + weekly tonnage + chips)

**Files:**
- Modify: `lib/trends.ts` (append)
- Test: `__tests__/trends-strength.test.ts`

**Interfaces:**
- Consumes: `normalizeWeightKg`, `berlinDateKey`, `weekStartKey`, `linearSlopePerDay`.
- Produces:
  - `type Chip = 'up' | 'flat' | 'down'`
  - `epley1RM(weightKg: number, reps: number): number`
  - `interface ExerciseTrend { exercise: string; points: DatedValue[]; slopePctPerWeek: number | null }`
  - `interface StrengthTrends { exercises: ExerciseTrend[]; weeklyTonnage: { week: string; kg: number }[]; strengthChip: Chip | null; volumeChip: Chip | null }`
  - `interface StrengthLogRow { logged_at: string; exercise_name: string; weight_lbs: number | null; weight_unit: string | null; reps: number | null }`
  - `computeStrengthTrends(logs: StrengthLogRow[], todayKey: string, topN?: number): StrengthTrends`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/trends-strength.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { epley1RM, computeStrengthTrends, type StrengthLogRow } from '@/lib/trends'

const TODAY = '2026-07-08'

function set(logged_at: string, exercise: string, weight: number, reps: number, unit = 'kg'): StrengthLogRow {
  return { logged_at, exercise_name: exercise, weight_lbs: weight, weight_unit: unit, reps }
}

describe('epley1RM', () => {
  it('single rep is the weight itself', () => expect(epley1RM(100, 1)).toBe(100))
  it('applies Epley above 1 rep', () => expect(epley1RM(100, 5)).toBeCloseTo(116.67, 1))
})

describe('computeStrengthTrends', () => {
  it('normalizes mixed units into tonnage', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Squat', 100, 5, 'kg'),
      set('2026-07-07T10:05:00Z', 'Squat', 220.462, 5, 'lbs'), // ≈ 100 kg
    ], TODAY)
    expect(t.weeklyTonnage).toHaveLength(1)
    expect(t.weeklyTonnage[0].week).toBe('2026-07-06')
    expect(t.weeklyTonnage[0].kg).toBe(1000)
  })
  it('excludes zero-weight and zero-rep sets', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Plank', 0, 1),
      set('2026-07-07T10:05:00Z', 'Squat', 100, 0),
    ], TODAY)
    expect(t.weeklyTonnage).toHaveLength(0)
    expect(t.exercises).toHaveLength(0)
  })
  it('keeps the best e1RM set per session', () => {
    const t = computeStrengthTrends([
      set('2026-07-07T10:00:00Z', 'Bench', 100, 5), // e1RM 116.7
      set('2026-07-07T10:10:00Z', 'Bench', 105, 2), // e1RM 112
    ], TODAY)
    expect(t.exercises[0].points).toHaveLength(1)
    expect(t.exercises[0].points[0].value).toBeCloseTo(116.7, 1)
  })
  it('keeps only the topN most-logged exercises', () => {
    const logs = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].flatMap((ex) => [
        set('2026-07-01T10:00:00Z', ex, 50, 5),
        set('2026-07-03T10:00:00Z', ex, 50, 5),
      ]),
      set('2026-07-01T10:00:00Z', 'G', 50, 5), // logged once → dropped at topN=6
    ]
    const t = computeStrengthTrends(logs, TODAY)
    expect(t.exercises.map((e) => e.exercise)).not.toContain('G')
    expect(t.exercises).toHaveLength(6)
  })
  it('rising e1RM over ≥3 sessions → strengthChip up', () => {
    const t = computeStrengthTrends([
      set('2026-06-22T10:00:00Z', 'Squat', 100, 5),
      set('2026-06-29T10:00:00Z', 'Squat', 102, 5),
      set('2026-07-06T10:00:00Z', 'Squat', 104, 5),
    ], TODAY)
    expect(t.exercises[0].slopePctPerWeek!).toBeGreaterThan(1)
    expect(t.strengthChip).toBe('up')
  })
  it('volumeChip compares last 3 complete weeks vs prior 3', () => {
    // 6 complete weeks: 3× 1000 kg then 3× 1100 kg; today's partial week excluded.
    const logs = [
      set('2026-05-26T10:00:00Z', 'Squat', 100, 10), // wk 2026-05-25
      set('2026-06-02T10:00:00Z', 'Squat', 100, 10), // wk 2026-06-01
      set('2026-06-09T10:00:00Z', 'Squat', 100, 10), // wk 2026-06-08
      set('2026-06-16T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-15
      set('2026-06-23T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-22
      set('2026-06-30T10:00:00Z', 'Squat', 110, 10), // wk 2026-06-29
      set('2026-07-07T10:00:00Z', 'Squat', 200, 10), // current wk — excluded
    ]
    expect(computeStrengthTrends(logs, TODAY).volumeChip).toBe('up')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/trends-strength.test.ts`
Expected: FAIL — `epley1RM` is not exported

- [ ] **Step 3: Append the implementation to `lib/trends.ts`**

```ts
// ── Strength (from manually logged sets) ─────────────────────────────────────
export type Chip = 'up' | 'flat' | 'down'

export function epley1RM(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30)
}

export interface StrengthLogRow {
  logged_at: string
  exercise_name: string
  weight_lbs: number | null
  weight_unit: string | null
  reps: number | null
}

export interface ExerciseTrend {
  exercise: string
  points: DatedValue[]
  slopePctPerWeek: number | null
}

export interface StrengthTrends {
  exercises: ExerciseTrend[]
  weeklyTonnage: { week: string; kg: number }[]
  strengthChip: Chip | null
  volumeChip: Chip | null
}

export function computeStrengthTrends(logs: StrengthLogRow[], todayKey: string, topN = 6): StrengthTrends {
  const sets = logs.flatMap((l) => {
    const kg = normalizeWeightKg(l.weight_lbs, l.weight_unit)
    if (kg == null || !l.reps || l.reps <= 0) return []
    return [{ exercise: l.exercise_name, date: berlinDateKey(l.logged_at), kg, reps: l.reps }]
  })

  // Key lifts = most-logged exercises in range.
  const counts = new Map<string, number>()
  for (const s of sets) counts.set(s.exercise, (counts.get(s.exercise) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([e]) => e)

  const exercises: ExerciseTrend[] = top.map((exercise) => {
    const best = new Map<string, number>() // date → best e1RM that session
    for (const s of sets) {
      if (s.exercise !== exercise) continue
      const e1 = epley1RM(s.kg, s.reps)
      best.set(s.date, Math.max(best.get(s.date) ?? 0, e1))
    }
    const points = [...best.entries()]
      .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date))
    let slopePctPerWeek: number | null = null
    if (points.length >= 3) {
      const slope = linearSlopePerDay(points)
      const mean = points.reduce((s, p) => s + p.value, 0) / points.length
      if (slope != null && mean > 0) slopePctPerWeek = Math.round(((slope * 7) / mean) * 1000) / 10
    }
    return { exercise, points, slopePctPerWeek }
  })

  const tonnage = new Map<string, number>()
  for (const s of sets) {
    const wk = weekStartKey(s.date)
    tonnage.set(wk, (tonnage.get(wk) ?? 0) + s.kg * s.reps)
  }
  const weeklyTonnage = [...tonnage.entries()]
    .map(([week, kg]) => ({ week, kg: Math.round(kg) }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Strength chip: median e1RM slope across key lifts, ±1%/week.
  const slopes = exercises
    .map((e) => e.slopePctPerWeek)
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b)
  let strengthChip: Chip | null = null
  if (slopes.length) {
    const median = slopes[Math.floor(slopes.length / 2)]
    strengthChip = median > 1 ? 'up' : median < -1 ? 'down' : 'flat'
  }

  // Volume chip: mean of last 3 complete weeks vs the prior 3, ±5%.
  const currentWeek = weekStartKey(todayKey)
  const complete = weeklyTonnage.filter((w) => w.week < currentWeek)
  const last3 = complete.slice(-3)
  const prev3 = complete.slice(-6, -3)
  let volumeChip: Chip | null = null
  if (last3.length && prev3.length) {
    const mean = (a: { kg: number }[]) => a.reduce((s, w) => s + w.kg, 0) / a.length
    const changePct = ((mean(last3) - mean(prev3)) / mean(prev3)) * 100
    volumeChip = changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat'
  }

  return { exercises, weeklyTonnage, strengthChip, volumeChip }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/trends-strength.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/trends.ts __tests__/trends-strength.test.ts
git commit -m "feat: strength trends — e1RM per lift, weekly tonnage, strength/volume chips"
```

---

### Task 5: Engine metrics (running efficiency, lifting HR, recovery rolling)

**Files:**
- Modify: `lib/trends.ts` (append)
- Test: `__tests__/trends-engine.test.ts`

**Interfaces:**
- Consumes: `ShapedWorkout`, `berlinDateKey`, `rollingAverage`, `linearSlopePerDay`.
- Produces:
  - `interface RunPoint { date: string; paceMinPerKm: number; avgHr: number; efficiency: number; elevationGainM: number | null }`
  - `interface EngineTrends { runs: RunPoint[]; efficiencySlopePctPerWeek: number | null; liftHr: DatedValue[]; recoveryRolling7: DatedValue[]; hrvRolling7: DatedValue[] }`
  - `computeEngineTrends(workouts: ShapedWorkout[], snapshots: { recorded_at: string; recovery_score: number | null; hrv_rmssd: number | null }[]): EngineTrends`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/trends-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeEngineTrends, type ShapedWorkout } from '@/lib/trends'

function wkt(over: Partial<ShapedWorkout>): ShapedWorkout {
  return {
    workout_id: 'x', started_at: '2026-07-07T10:00:00Z', sport_name: 'running',
    category: 'training', strain: 10, avg_hr: 150, max_hr: 170,
    duration_min: 40, distance_m: 6000, altitude_gain_m: null,
    kilojoule: 2000, kcal: 478, pace_min_per_km: 6.67,
    zone_minutes: { z0: 0, z1: 0, z2: 0, z3: 40, z4: 0, z5: 0 },
    ...over,
  }
}

describe('computeEngineTrends', () => {
  it('computes efficiency = speed(m/min) / avgHr', () => {
    const t = computeEngineTrends([wkt({})], [])
    expect(t.runs).toHaveLength(1)
    expect(t.runs[0].efficiency).toBeCloseTo(1.0, 3) // 150 m/min ÷ 150 bpm
    expect(t.runs[0].paceMinPerKm).toBeCloseTo(6.67, 2)
  })
  it('excludes runs without distance or HR, but keeps lifting HR series', () => {
    const t = computeEngineTrends([
      wkt({ distance_m: null }),
      wkt({ avg_hr: null }),
      wkt({ sport_name: 'weightlifting', avg_hr: 105, started_at: '2026-07-08T15:00:00Z' }),
    ], [])
    expect(t.runs).toHaveLength(0)
    expect(t.liftHr).toEqual([{ date: '2026-07-08', value: 105 }])
  })
  it('efficiency slope needs ≥3 runs', () => {
    const two = [wkt({ started_at: '2026-07-01T10:00:00Z' }), wkt({ started_at: '2026-07-05T10:00:00Z' })]
    expect(computeEngineTrends(two, []).efficiencySlopePctPerWeek).toBeNull()
    const three = [...two, wkt({ started_at: '2026-07-08T10:00:00Z', duration_min: 38 })]
    expect(computeEngineTrends(three, []).efficiencySlopePctPerWeek).not.toBeNull()
  })
  it('rolls recovery and HRV over 7 days', () => {
    const t = computeEngineTrends([], [
      { recorded_at: '2026-07-06T06:00:00Z', recovery_score: 60, hrv_rmssd: 80 },
      { recorded_at: '2026-07-07T06:00:00Z', recovery_score: 80, hrv_rmssd: 100 },
    ])
    expect(t.recoveryRolling7).toEqual([
      { date: '2026-07-06', value: 60 },
      { date: '2026-07-07', value: 70 },
    ])
    expect(t.hrvRolling7[1].value).toBe(90)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/trends-engine.test.ts`
Expected: FAIL — `computeEngineTrends` is not exported

- [ ] **Step 3: Append the implementation to `lib/trends.ts`**

```ts
// ── Engine (aerobic fitness) ─────────────────────────────────────────────────
export interface RunPoint {
  date: string
  paceMinPerKm: number
  avgHr: number
  efficiency: number // meters per minute per bpm — higher is fitter
  elevationGainM: number | null
}

export interface EngineTrends {
  runs: RunPoint[]
  efficiencySlopePctPerWeek: number | null
  liftHr: DatedValue[]
  recoveryRolling7: DatedValue[]
  hrvRolling7: DatedValue[]
}

export function computeEngineTrends(
  workouts: ShapedWorkout[],
  snapshots: { recorded_at: string; recovery_score: number | null; hrv_rmssd: number | null }[],
): EngineTrends {
  const runs: RunPoint[] = workouts
    .filter((w) =>
      w.sport_name === 'running' &&
      (w.distance_m ?? 0) > 0 &&
      (w.duration_min ?? 0) > 0 &&
      (w.avg_hr ?? 0) > 0,
    )
    .map((w) => {
      const speed = w.distance_m! / w.duration_min! // m/min
      return {
        date: berlinDateKey(w.started_at),
        paceMinPerKm: Math.round((w.duration_min! / (w.distance_m! / 1000)) * 100) / 100,
        avgHr: w.avg_hr!,
        efficiency: Math.round((speed / w.avg_hr!) * 1000) / 1000,
        elevationGainM: w.altitude_gain_m,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  let efficiencySlopePctPerWeek: number | null = null
  if (runs.length >= 3) {
    const pts = runs.map((r) => ({ date: r.date, value: r.efficiency }))
    const slope = linearSlopePerDay(pts)
    const mean = pts.reduce((s, p) => s + p.value, 0) / pts.length
    if (slope != null && mean > 0) efficiencySlopePctPerWeek = Math.round(((slope * 7) / mean) * 1000) / 10
  }

  const liftHr = workouts
    .filter((w) => w.sport_name === 'weightlifting' && (w.avg_hr ?? 0) > 0)
    .map((w) => ({ date: berlinDateKey(w.started_at), value: w.avg_hr! }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const recPts = snapshots
    .filter((s) => s.recovery_score != null)
    .map((s) => ({ date: berlinDateKey(s.recorded_at), value: Number(s.recovery_score) }))
  const hrvPts = snapshots
    .filter((s) => s.hrv_rmssd != null)
    .map((s) => ({ date: berlinDateKey(s.recorded_at), value: Number(s.hrv_rmssd) }))

  return {
    runs,
    efficiencySlopePctPerWeek,
    liftHr,
    recoveryRolling7: rollingAverage(recPts, 7),
    hrvRolling7: rollingAverage(hrvPts, 7),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/trends-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/trends.ts __tests__/trends-engine.test.ts
git commit -m "feat: engine trends — running efficiency, lifting HR, rolling recovery/HRV"
```

---

### Task 6: Load metrics (weekly minutes, sessions, strain, lifestyle split)

**Files:**
- Modify: `lib/trends.ts` (append)
- Test: `__tests__/trends-load.test.ts`

**Interfaces:**
- Consumes: `ShapedWorkout`, `berlinDateKey`, `weekStartKey`.
- Produces:
  - `interface LoadWeek { week: string; trainingMin: number; lifestyleMin: number; sessions: number; strain: number }`
  - `interface LoadTrends { weeks: LoadWeek[]; totalTrainingMin: number; totalLifestyleMin: number }`
  - `computeLoadTrends(workouts: ShapedWorkout[], snapshots: { recorded_at: string; strain: number | null }[]): LoadTrends`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/trends-load.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLoadTrends, type ShapedWorkout } from '@/lib/trends'

function wkt(over: Partial<ShapedWorkout>): ShapedWorkout {
  return {
    workout_id: 'x', started_at: '2026-07-07T10:00:00Z', sport_name: 'weightlifting',
    category: 'training', strain: 10, avg_hr: 110, max_hr: 150,
    duration_min: 60, distance_m: null, altitude_gain_m: null,
    kilojoule: null, kcal: null, pace_min_per_km: null,
    zone_minutes: { z0: 30, z1: 25, z2: 5, z3: 0, z4: 0, z5: 0 },
    ...over,
  }
}

describe('computeLoadTrends', () => {
  it('splits training vs lifestyle minutes and counts training sessions only', () => {
    const t = computeLoadTrends([
      wkt({}),
      wkt({ sport_name: 'commuting', category: 'lifestyle', duration_min: 17 }),
    ], [])
    expect(t.weeks).toHaveLength(1)
    expect(t.weeks[0].trainingMin).toBe(60)
    expect(t.weeks[0].lifestyleMin).toBe(17)
    expect(t.weeks[0].sessions).toBe(1)
  })
  it('buckets Sunday vs Monday into different weeks', () => {
    const t = computeLoadTrends([
      wkt({ started_at: '2026-07-05T10:00:00Z' }), // Sun → wk 2026-06-29
      wkt({ started_at: '2026-07-06T10:00:00Z' }), // Mon → wk 2026-07-06
    ], [])
    expect(t.weeks.map((w) => w.week)).toEqual(['2026-06-29', '2026-07-06'])
  })
  it('falls back to zone-minute sum when duration is missing', () => {
    const t = computeLoadTrends([wkt({ duration_min: null })], [])
    expect(t.weeks[0].trainingMin).toBe(60) // 30+25+5
  })
  it('sums weekly strain from snapshots', () => {
    const t = computeLoadTrends([], [
      { recorded_at: '2026-07-06T06:00:00Z', strain: 10.5 },
      { recorded_at: '2026-07-07T06:00:00Z', strain: 14.2 },
    ])
    expect(t.weeks[0].strain).toBeCloseTo(24.7, 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/trends-load.test.ts`
Expected: FAIL — `computeLoadTrends` is not exported

- [ ] **Step 3: Append the implementation to `lib/trends.ts`**

```ts
// ── Load ──────────────────────────────────────────────────────────────────────
export interface LoadWeek {
  week: string
  trainingMin: number
  lifestyleMin: number
  sessions: number
  strain: number
}

export interface LoadTrends {
  weeks: LoadWeek[]
  totalTrainingMin: number
  totalLifestyleMin: number
}

function workoutMinutes(w: ShapedWorkout): number {
  if (w.duration_min != null) return w.duration_min
  const z = w.zone_minutes
  return [z.z0, z.z1, z.z2, z.z3, z.z4, z.z5].reduce<number>((s, v) => s + (v ?? 0), 0)
}

export function computeLoadTrends(
  workouts: ShapedWorkout[],
  snapshots: { recorded_at: string; strain: number | null }[],
): LoadTrends {
  const weeks = new Map<string, LoadWeek>()
  const get = (wk: string): LoadWeek => {
    if (!weeks.has(wk)) weeks.set(wk, { week: wk, trainingMin: 0, lifestyleMin: 0, sessions: 0, strain: 0 })
    return weeks.get(wk)!
  }

  for (const w of workouts) {
    const row = get(weekStartKey(berlinDateKey(w.started_at)))
    const min = workoutMinutes(w)
    if (w.category === 'training') {
      row.trainingMin += min
      row.sessions += 1
    } else {
      row.lifestyleMin += min
    }
  }
  for (const s of snapshots) {
    if (s.strain == null) continue
    get(weekStartKey(berlinDateKey(s.recorded_at))).strain += Number(s.strain)
  }

  const sorted = [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({
      ...w,
      trainingMin: Math.round(w.trainingMin),
      lifestyleMin: Math.round(w.lifestyleMin),
      strain: Math.round(w.strain * 10) / 10,
    }))

  return {
    weeks: sorted,
    totalTrainingMin: sorted.reduce((s, w) => s + w.trainingMin, 0),
    totalLifestyleMin: sorted.reduce((s, w) => s + w.lifestyleMin, 0),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass, then run the whole suite**

Run: `npm test`
Expected: all test files pass (including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add lib/trends.ts __tests__/trends-load.test.ts
git commit -m "feat: load trends — weekly training minutes, sessions, strain, lifestyle split"
```

---

### Task 7: Extract chart primitives to `components/ui/charts.tsx`

**Files:**
- Create: `components/ui/charts.tsx`
- Modify: `components/tabs/WhoopTab.tsx` (delete local copies, import instead)

**Interfaces:**
- Produces named exports `ChartTitle`, `AxisRow`, `BigSpark`, `DualSpark`, `BarChart`, `Legend` with the **exact same props** as the current local components in `components/tabs/WhoopTab.tsx:39-252`. TrendsTab (Task 9) imports these.

- [ ] **Step 1: Create `components/ui/charts.tsx`**

Copy the component code **verbatim** from `components/tabs/WhoopTab.tsx` — the blocks for `ChartTitle` (lines ~39–46), `AxisRow` (~48–54), `BigSpark` (~56–141), `DualSpark` (~143–196), `BarChart` (~198–235), and `Legend` (~237–252) — into the new file with this header, and add `export` to each function declaration:

```tsx
'use client'

// Shared SVG/CSS chart primitives (extracted from WhoopTab).
// SVG presentation attributes can't take var(--token) — colors go through
// style={} where needed; C mirrors the Aurora tokens used by the charts.
const C = {
  card: 'var(--surface)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
  border: 'var(--border)', accent: '#00d26a',
}
const mono = 'var(--font-jetbrains-mono, monospace)'
```

(The copied bodies reference only `C.card`, `C.dim`, `C.faint`, `C.border`, `C.accent`, and `mono` — all defined above. Do not modify any copied logic.)

- [ ] **Step 2: Update WhoopTab to import the shared charts**

In `components/tabs/WhoopTab.tsx`:
1. Add: `import { ChartTitle, AxisRow, BigSpark, DualSpark, BarChart, Legend } from '@/components/ui/charts'`
2. Delete the six local component definitions (the lines copied in Step 1). Keep the local `MiniStat` and `SectionLabel` — they are not chart primitives.

- [ ] **Step 3: Typecheck and run the suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc exit 0, all tests pass

- [ ] **Step 4: Visual spot-check**

Run: `npm run dev`, open `http://localhost:3000/?tab=whoop` — the Whoop tab must render identically (recovery chart, HRV/RHR dual chart, strain bars, legend). Stop the server after checking.

- [ ] **Step 5: Commit**

```bash
git add components/ui/charts.tsx components/tabs/WhoopTab.tsx
git commit -m "refactor: extract chart primitives to components/ui/charts"
```

---

### Task 8: `useTrends` hook

**Files:**
- Create: `lib/useTrends.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase`; all compute functions and `shapeWorkout`/`berlinDateKey` from `@/lib/trends`; `TrainingPhase`, `PhaseKind` from `@/lib/types`.
- Produces:
  - `type TrendsRange = '4w' | '12w' | '6m' | 'all'`
  - `useTrends(): { loading: boolean; error: string | null; range: TrendsRange; setRange(r: TrendsRange): void; metrics: TrendsMetrics | null; currentPhase: TrainingPhase | null; setPhase(phase: PhaseKind, startedOn: string, targetRate?: number | null): Promise<void> }`
  - `interface TrendsMetrics { body: BodyTrend; strength: StrengthTrends; engine: EngineTrends; load: LoadTrends }`

- [ ] **Step 1: Create `lib/useTrends.ts`**

```ts
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  berlinDateKey, shapeWorkout,
  computeBodyTrend, computeStrengthTrends, computeEngineTrends, computeLoadTrends,
  type RawWorkoutRow, type StrengthLogRow,
  type BodyTrend, type StrengthTrends, type EngineTrends, type LoadTrends,
} from '@/lib/trends'
import type { PhaseKind, TrainingPhase } from '@/lib/types'

export type TrendsRange = '4w' | '12w' | '6m' | 'all'
const RANGE_DAYS: Record<TrendsRange, number | null> = { '4w': 28, '12w': 84, '6m': 183, all: null }
const RANGE_STORAGE_KEY = 'lifeos-trends-range'

export interface TrendsMetrics {
  body: BodyTrend
  strength: StrengthTrends
  engine: EngineTrends
  load: LoadTrends
}

type SnapshotRow = { recorded_at: string; recovery_score: number | null; hrv_rmssd: number | null; strain: number | null }
type WeightRow = { measured_on: string; weight_kg: number | null }

function initialRange(): TrendsRange {
  if (typeof window === 'undefined') return '12w'
  const stored = window.localStorage.getItem(RANGE_STORAGE_KEY)
  return stored === '4w' || stored === '12w' || stored === '6m' || stored === 'all' ? stored : '12w'
}

export function useTrends() {
  const [range, setRangeState] = useState<TrendsRange>(initialRange)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [workouts, setWorkouts] = useState<RawWorkoutRow[]>([])
  const [logs, setLogs] = useState<StrengthLogRow[]>([])
  const [weights, setWeights] = useState<WeightRow[]>([])
  const [phases, setPhases] = useState<TrainingPhase[]>([])
  const [loaded, setLoaded] = useState(false)

  const setRange = useCallback((r: TrendsRange) => {
    setRangeState(r)
    try { window.localStorage.setItem(RANGE_STORAGE_KEY, r) } catch { /* private mode */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const days = RANGE_DAYS[range]
    const startIso = days != null ? new Date(Date.now() - days * 86400000).toISOString() : null
    const startDate = startIso?.slice(0, 10) ?? null

    let snapQ = supabase.from('whoop_snapshots')
      .select('recorded_at,recovery_score,hrv_rmssd,strain').order('recorded_at')
    if (startIso) snapQ = snapQ.gte('recorded_at', startIso)

    let wktQ = supabase.from('whoop_workouts')
      .select('workout_id,cycle_id,started_at,sport_name,strain,avg_hr,max_hr,zone0_min,zone1_min,zone2_min,zone3_min,zone4_min,zone5_min,raw_json')
      .order('started_at')
    if (startIso) wktQ = wktQ.gte('started_at', startIso)

    let logQ = supabase.from('workout_logs')
      .select('logged_at,exercise_name,weight_lbs,weight_unit,reps').order('logged_at')
    if (startIso) logQ = logQ.gte('logged_at', startIso)

    let weightQ = supabase.from('whoop_body_measurements')
      .select('measured_on,weight_kg').order('measured_on')
    if (startDate) weightQ = weightQ.gte('measured_on', startDate)

    const phaseQ = supabase.from('training_phases').select('*').order('started_on', { ascending: false })

    const [snapRes, wktRes, logRes, weightRes, phaseRes] = await Promise.all([snapQ, wktQ, logQ, weightQ, phaseQ])
    const firstError = snapRes.error ?? wktRes.error ?? logRes.error ?? weightRes.error ?? phaseRes.error
    if (firstError) {
      setError(firstError.message)
    } else {
      setSnapshots((snapRes.data ?? []) as SnapshotRow[])
      setWorkouts((wktRes.data ?? []) as RawWorkoutRow[])
      setLogs((logRes.data ?? []) as StrengthLogRow[])
      setWeights((weightRes.data ?? []) as WeightRow[])
      setPhases((phaseRes.data ?? []) as TrainingPhase[])
      setLoaded(true)
    }
    setLoading(false)
  }, [range])

  useEffect(() => { void load() }, [load])

  const currentPhase = phases[0] ?? null

  const metrics = useMemo<TrendsMetrics | null>(() => {
    if (!loaded) return null
    const todayKey = berlinDateKey(new Date().toISOString())
    const shaped = workouts.map(shapeWorkout)
    return {
      body: computeBodyTrend(weights, currentPhase, todayKey),
      strength: computeStrengthTrends(logs, todayKey),
      engine: computeEngineTrends(shaped, snapshots),
      load: computeLoadTrends(shaped, snapshots),
    }
  }, [loaded, workouts, weights, logs, snapshots, currentPhase])

  const setPhase = useCallback(async (phase: PhaseKind, startedOn: string, targetRate?: number | null) => {
    const supabase = createClient()
    const { error: insertError } = await supabase.from('training_phases').insert({
      phase, started_on: startedOn, target_rate_kg_per_week: targetRate ?? null,
    })
    if (insertError) throw new Error(insertError.message)
    await load()
  }, [load])

  return { loading, error, range, setRange, metrics, currentPhase, setPhase }
}
```

- [ ] **Step 2: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: exit 0
(No unit test — the hook is I/O glue over the tested pure functions; it is exercised end-to-end in Task 10's verification.)

- [ ] **Step 3: Commit**

```bash
git add lib/useTrends.ts
git commit -m "feat: useTrends hook — range-filtered loading + memoized trend metrics"
```

---

### Task 9: `TrendsTab` component

**Files:**
- Create: `components/tabs/TrendsTab.tsx`

**Interfaces:**
- Consumes: `useTrends` (Task 8), chart primitives from `@/components/ui/charts` (Task 7), `sportColor` from `@/lib/whoop-utils`, `TrainingPhase`/`PhaseKind` from `@/lib/types`, `Chip`/`Verdict` types from `@/lib/trends`.
- Produces: default export `TrendsTab` (no props) — consumed by Shell/DesktopShell in Task 10.

- [ ] **Step 1: Create `components/tabs/TrendsTab.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import { ChartTitle, AxisRow, BigSpark, DualSpark, BarChart, Legend } from '@/components/ui/charts'
import { useTrends, type TrendsRange } from '@/lib/useTrends'
import type { Chip, Verdict } from '@/lib/trends'
import type { PhaseKind } from '@/lib/types'

const C = {
  card: 'var(--surface)', border: 'var(--border)', text: 'var(--text)',
  dim: 'var(--text-dim)', faint: 'var(--text-faint)',
}
const mono = 'var(--font-jetbrains-mono, monospace)'
const MINT = '#00d26a', CYAN = '#38bdf8', VIOLET = '#a78bfa', CORAL = '#fb7185', AMBER = '#fbbf24'

const RANGES: TrendsRange[] = ['4w', '12w', '6m', 'all']
const PHASES: PhaseKind[] = ['bulk', 'cut', 'maintenance']

const CHIP_GLYPH: Record<Chip, string> = { up: '↑', flat: '→', down: '↓' }
const CHIP_COLOR: Record<Chip, string> = { up: MINT, flat: AMBER, down: CORAL }
const VERDICT_LABEL: Record<Verdict, string> = { on_track: 'on track', fast: 'too fast', slow: 'too slow' }
const VERDICT_COLOR: Record<Verdict, string> = { on_track: MINT, fast: AMBER, slow: CORAL }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.faint, borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 10, marginTop: 18 }}>
      {children}
    </div>
  )
}

function StatChip({ label, chip }: { label: string; chip: Chip | null }) {
  const color = chip ? CHIP_COLOR[chip] : C.faint
  return (
    <span style={{ fontFamily: mono, fontSize: 10, color, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 10px' }}>
      {label} {chip ? CHIP_GLYPH[chip] : '·'}
    </span>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, padding: '14px 0' }}>{children}</div>
}

export default function TrendsTab() {
  const { loading, error, range, setRange, metrics, currentPhase, setPhase } = useTrends()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftPhase, setDraftPhase] = useState<PhaseKind>('bulk')
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftRate, setDraftRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function savePhase() {
    setSaving(true)
    setSaveError(null)
    try {
      const rate = draftRate.trim() === '' ? null : Number(draftRate)
      await setPhase(draftPhase, draftDate, Number.isFinite(rate as number) ? rate : null)
      setSheetOpen(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return <div className="px-4"><EmptyNote>failed to load trends — {error}</EmptyNote></div>
  }

  const body = metrics?.body
  const strength = metrics?.strength
  const engine = metrics?.engine
  const load = metrics?.load
  const phaseWeeks = currentPhase
    ? Math.max(1, Math.round((Date.now() - Date.parse(currentPhase.started_on)) / (7 * 86400000)))
    : null

  return (
    <div className="boot mx-auto max-w-md px-4">
      {/* Range selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="active:scale-[0.95]"
            style={{
              flex: 1, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
              padding: '7px 0', borderRadius: 999,
              border: `1px solid ${range === r ? MINT : C.border}`,
              color: range === r ? MINT : C.dim,
              background: range === r ? 'rgba(0,210,106,0.08)' : 'transparent',
            }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Phase header */}
      <div className="panel rounded-2xl" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <div className="display" style={{ fontSize: 17, fontWeight: 700, color: C.text, textTransform: 'uppercase' }}>
              {currentPhase ? currentPhase.phase : 'no phase set'}
              {phaseWeeks != null && <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginLeft: 8 }}>week {phaseWeeks}</span>}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
              {body?.ratePerWeek != null
                ? <>
                    {body.ratePerWeek >= 0 ? '+' : ''}{body.ratePerWeek} kg/wk
                    {body.targetRate != null && <span style={{ color: C.faint }}> · target {body.targetRate >= 0 ? '+' : ''}{body.targetRate}</span>}
                    {body.verdict && <span style={{ color: VERDICT_COLOR[body.verdict], marginLeft: 6 }}>{VERDICT_LABEL[body.verdict]}</span>}
                  </>
                : 'need more weigh-ins for a rate'}
            </div>
          </div>
          <button
            onClick={() => { setDraftPhase(currentPhase?.phase ?? 'bulk'); setSheetOpen(true) }}
            className="active:scale-[0.95]"
            style={{ fontFamily: mono, fontSize: 10, color: CYAN, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 12px' }}
          >
            {currentPhase ? 'change' : 'set phase'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <StatChip label="strength" chip={strength?.strengthChip ?? null} />
          <StatChip label="volume" chip={strength?.volumeChip ?? null} />
        </div>
      </div>

      {loading && !metrics && <EmptyNote>loading trends…</EmptyNote>}

      {metrics && (
        <>
          {/* Body */}
          <SectionLabel>Body</SectionLabel>
          <Card>
            <ChartTitle
              title="Weight · 7d avg"
              right={body!.weights.length > 0
                ? <span style={{ fontFamily: mono, fontSize: 11, color: C.text }}>{body!.weights[body!.weights.length - 1].value.toFixed(1)} kg</span>
                : undefined}
            />
            {body!.weights.length >= 2 ? (
              <>
                <DualSpark
                  dataA={body!.rolling7.map((p) => p.value)}
                  dataB={body!.weights.map((p) => p.value)}
                  colorA={MINT}
                  colorB={C.faint}
                />
                <Legend items={[{ label: '7d avg', color: MINT }, { label: 'daily', color: C.faint, dashed: true }]} />
                <AxisRow first={body!.weights[0].date} last={body!.weights[body!.weights.length - 1].date} />
              </>
            ) : <EmptyNote>collecting weigh-ins</EmptyNote>}
          </Card>

          {/* Strength */}
          <SectionLabel>Strength</SectionLabel>
          {strength!.exercises.length === 0 ? (
            <Card><EmptyNote>no logged sets in range</EmptyNote></Card>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {strength!.exercises.map((ex) => {
                  const up = (ex.slopePctPerWeek ?? 0) >= 0
                  const color = ex.slopePctPerWeek == null ? CYAN : up ? MINT : CORAL
                  const latest = ex.points[ex.points.length - 1]
                  return (
                    <Card key={ex.exercise}>
                      <div style={{ fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ex.exercise}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: C.text }}>{latest.value}</span>
                        <span style={{ fontFamily: mono, fontSize: 9, color: C.dim }}>kg e1RM</span>
                        {ex.slopePctPerWeek != null && (
                          <span style={{ fontFamily: mono, fontSize: 9, color, marginLeft: 'auto' }}>
                            {ex.slopePctPerWeek >= 0 ? '+' : ''}{ex.slopePctPerWeek}%/wk
                          </span>
                        )}
                      </div>
                      {ex.points.length >= 2
                        ? <BigSpark data={ex.points.map((p) => p.value)} color={color} height={36} />
                        : <div style={{ height: 36 }} />}
                    </Card>
                  )
                })}
              </div>
              <Card>
                <ChartTitle title="Weekly tonnage" right={<span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>kg lifted</span>} />
                {strength!.weeklyTonnage.length > 0 ? (
                  <>
                    <BarChart data={strength!.weeklyTonnage.map((w) => w.kg)} color={CYAN} height={70} />
                    <AxisRow first={strength!.weeklyTonnage[0].week} last={strength!.weeklyTonnage[strength!.weeklyTonnage.length - 1].week} />
                  </>
                ) : <EmptyNote>no tonnage in range</EmptyNote>}
              </Card>
            </>
          )}

          {/* Engine */}
          <SectionLabel>Engine</SectionLabel>
          <Card>
            <ChartTitle
              title="Run efficiency"
              right={engine!.efficiencySlopePctPerWeek != null
                ? <span style={{ fontFamily: mono, fontSize: 10, color: engine!.efficiencySlopePctPerWeek >= 0 ? MINT : CORAL }}>
                    {engine!.efficiencySlopePctPerWeek >= 0 ? '+' : ''}{engine!.efficiencySlopePctPerWeek}%/wk
                  </span>
                : undefined}
            />
            {engine!.runs.length >= 2 ? (
              <>
                <BigSpark data={engine!.runs.map((r) => r.efficiency)} color={CYAN} height={60} />
                <AxisRow first={engine!.runs[0].date} last={engine!.runs[engine!.runs.length - 1].date} />
              </>
            ) : engine!.runs.length === 1 ? (
              <EmptyNote>
                1 run: {engine!.runs[0].paceMinPerKm} min/km @ {engine!.runs[0].avgHr} bpm
                {engine!.runs[0].elevationGainM != null && ` · +${Math.round(engine!.runs[0].elevationGainM)}m`}
                {' — trend appears after 3 runs'}
              </EmptyNote>
            ) : <EmptyNote>no runs with GPS in range</EmptyNote>}
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Card>
              <ChartTitle title="Lift avg HR" />
              {engine!.liftHr.length >= 2
                ? <BigSpark data={engine!.liftHr.map((p) => p.value)} color={VIOLET} height={44} />
                : <EmptyNote>needs 2+ lifts</EmptyNote>}
            </Card>
            <Card>
              <ChartTitle title="Recovery 7d" />
              {engine!.recoveryRolling7.length >= 2
                ? <BigSpark data={engine!.recoveryRolling7.map((p) => p.value)} color={MINT} height={44} />
                : <EmptyNote>needs 2+ days</EmptyNote>}
            </Card>
          </div>

          {/* Load */}
          <SectionLabel>Load</SectionLabel>
          <Card>
            <ChartTitle
              title="Weekly training minutes"
              right={<span style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>
                {load!.totalTrainingMin} train · {load!.totalLifestyleMin} life
              </span>}
            />
            {load!.weeks.length > 0 ? (
              <>
                <BarChart data={load!.weeks.map((w) => w.trainingMin)} color={MINT} height={70} />
                <AxisRow first={load!.weeks[0].week} last={load!.weeks[load!.weeks.length - 1].week} />
              </>
            ) : <EmptyNote>no workouts in range</EmptyNote>}
          </Card>
          <Card>
            <ChartTitle title="Weekly strain" />
            {load!.weeks.length > 0
              ? <BarChart data={load!.weeks.map((w) => w.strain)} color={VIOLET} height={54} />
              : <EmptyNote>no strain data in range</EmptyNote>}
          </Card>
        </>
      )}

      {/* Phase sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: 'var(--scrim)' }}
          onClick={() => !saving && setSheetOpen(false)}
        >
          <div
            className="sheet glass-thick fixed bottom-0 left-0 right-0 rounded-t-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="display" style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Set training phase</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {PHASES.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraftPhase(p)}
                  className="active:scale-[0.95]"
                  style={{
                    flex: 1, fontFamily: mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
                    padding: '9px 0', borderRadius: 12,
                    border: `1px solid ${draftPhase === p ? MINT : C.border}`,
                    color: draftPhase === p ? MINT : C.dim,
                    background: draftPhase === p ? 'rgba(0,210,106,0.08)' : 'transparent',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              start date
            </label>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              style={{ width: '100%', fontFamily: mono, fontSize: 13, color: C.text, background: 'var(--surface-2)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 12px', marginBottom: 12 }}
            />
            <label style={{ display: 'block', fontFamily: mono, fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              target kg/week (blank = default)
            </label>
            <input
              type="number"
              step="0.05"
              inputMode="decimal"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              placeholder={draftPhase === 'bulk' ? '+0.25' : draftPhase === 'cut' ? '-0.50' : '±0.15 band'}
              style={{ width: '100%', fontFamily: mono, fontSize: 13, color: C.text, background: 'var(--surface-2)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 12px', marginBottom: 14 }}
            />
            {saveError && <div style={{ fontFamily: mono, fontSize: 10, color: CORAL, marginBottom: 10 }}>{saveError}</div>}
            <button
              onClick={() => void savePhase()}
              disabled={saving}
              className="active:scale-[0.97]"
              style={{ width: '100%', fontFamily: mono, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#08130c', background: MINT, borderRadius: 14, padding: '12px 0', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'saving…' : 'save phase'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add components/tabs/TrendsTab.tsx
git commit -m "feat: TrendsTab — phase header, body/strength/engine/load sections"
```

---

### Task 10: Navigation wiring + docs + final verification

**Files:**
- Modify: `components/TabBar.tsx:5-12` (TABS array)
- Modify: `components/Shell.tsx` (labels, query index, renderTab, import)
- Modify: `components/DesktopShell.tsx` (TABS, keybindings, CMDK, renderTab, import)
- Modify: `CLAUDE.md` (tab reference, navigation, project structure)

**Interfaces:**
- Consumes: default export `TrendsTab` from `@/components/tabs/TrendsTab`.

- [ ] **Step 1: TabBar**

In `components/TabBar.tsx`, insert Trends before Money:

```ts
const TABS = [
  { icon: '◐', label: 'Today' },
  { icon: '◆', label: 'Focus' },
  { icon: '▲', label: 'Workout' },
  { icon: '○', label: 'Fuel' },
  { icon: '~', label: 'Whoop' },
  { icon: '∿', label: 'Trends' },
  { icon: '€', label: 'Money' },
]
```

- [ ] **Step 2: Mobile Shell**

In `components/Shell.tsx`:
1. `import TrendsTab from '@/components/tabs/TrendsTab'`
2. `const TAB_LABELS = ['Today', 'Focus', 'Workout', 'Fuel', 'Whoop', 'Trends', 'Money']`
3. `TAB_QUERY_INDEX`: `{ today: 0, focus: 1, workout: 2, nutrition: 3, whoop: 4, trends: 5, finance: 6 }`
4. `renderTab` switch: `case 5: return <TrendsTab />` and `case 6: return <FinanceTab />`

(The number-key handler already ranges over `TAB_LABELS.length`, so `7` starts working automatically.)

- [ ] **Step 3: DesktopShell**

In `components/DesktopShell.tsx`:
1. `import TrendsTab from '@/components/tabs/TrendsTab'`
2. TABS — insert before finance and bump finance to kbd 7:
```ts
  { key: 'trends',    icon: '∿', label: 'Trends',    kbd: '6' },
  { key: 'finance',   icon: '€', label: 'Finances',  kbd: '7' },
```
3. Keydown handler (near line 246): change `mod && e.key === '6'` to set `'trends'`, and add `if (mod && e.key === '7') { e.preventDefault(); setActiveTab('finance') }`
4. `CMDK_ITEMS`: add `{ sec: 'jump', ic: '∿', label: 'Go to Trends', kbd: '⌘6', tab: 'trends', action: undefined }` before the finance entry and change the finance entry's `kbd` to `'⌘7'`.
5. `renderTab` switch: add `case 'trends': return <TrendsTab />` (desktop reuses the mobile component, same as TodayTab).

- [ ] **Step 4: Update CLAUDE.md**

1. Tab reference table: add row `| 5 | Trends | No | Interactive — phase-aware trends: body weight vs target, e1RM/tonnage, run efficiency, weekly load |` and renumber Money to 6.
2. Navigation section: `keys 1–7`.
3. TabBar line in project structure: `◐ TODAY · ◆ FOCUS · ▲ WORKOUT · ○ NUTRITION · ~ WHOOP · ∿ TRENDS · € MONEY`.
4. Project structure: add `TrendsTab.tsx`, `lib/trends.ts`, `lib/useTrends.ts`, `components/ui/charts.tsx` entries; add `training_phases` to the database schema table with purpose "Training phase declarations (bulk/cut/maintenance) with start date and optional target rate".

- [ ] **Step 5: Full verification**

Run: `npm test && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json && npm run build`
Expected: all pass, build succeeds.

Then `npm run dev` and check `http://localhost:3000/?tab=trends`:
- Range selector renders and switches
- Phase header shows "no phase set" → open sheet → save a phase → header updates
- Body/Strength/Engine/Load sections render with real data (23 workouts + weights are already synced)
- Whoop tab still renders unchanged
- Keys 1–7 switch tabs

- [ ] **Step 6: Commit**

```bash
git add components/TabBar.tsx components/Shell.tsx components/DesktopShell.tsx CLAUDE.md
git commit -m "feat: wire Trends tab into mobile + desktop navigation"
```

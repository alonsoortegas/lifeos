# Trends Tab — Design

**Date:** 2026-07-08
**Status:** Approved (Approach A — client-computed trends)

## Purpose

A 7th dashboard tab that brings the four data streams together for trend analysis, framed by the user's current training phase (bulk / cut / maintenance). It answers three questions in priority order:

1. **Am I getting fitter?** — running efficiency, lifting HR envelope, recovery trajectory
2. **How much am I training?** — weekly load, training vs lifestyle split, consistency
3. **Is my lifting progressing?** — strength (e1RM) and volume (tonnage) from logged sets

The tab must support phase decisions: during a bulk, is weight rising at the right rate while strength climbs; during a cut, is weight falling while strength holds.

## Architecture

Follows the FinanceTab pattern exactly:

- **`lib/trends.ts`** — pure, unit-testable metric functions: `(rows, range) → series/summary`
- **`lib/useTrends.ts`** — client hook: loads sources, memoizes computed metrics
- **`components/tabs/TrendsTab.tsx`** — presentation only
- **`components/ui/charts.tsx`** — `LineChart` / `BarChart` / `ChartTitle` extracted from WhoopTab (no visual change to WhoopTab; deduplication so TrendsTab reuses them)

No server routes. No realtime. Computation is client-side; data volume is tens of rows per week.

## Data sources

| Stream | Table | Feeds |
|---|---|---|
| Daily recovery/strain/sleep | `whoop_snapshots` | Recovery trajectory, weekly strain |
| Per-workout envelope | `whoop_workouts` | Running efficiency, lifting HR, load split |
| Logged sets | `workout_logs` | Tonnage, e1RM per lift |
| Daily weight | `whoop_body_measurements` | Weight trend vs phase target |

### New table: `training_phases`

```sql
create table training_phases (
  id          bigint primary key generated always as identity,
  phase       text not null check (phase in ('bulk','cut','maintenance')),
  started_on  date not null,
  target_rate_kg_per_week numeric(4,2),  -- null = phase default
  notes       text,
  created_at  timestamptz default now()
);
```

- Setting a phase inserts a new row; history is preserved. Current phase = row with latest `started_on`.
- Default target rates when `target_rate_kg_per_week` is null: bulk **+0.25 kg/wk**, cut **−0.50 kg/wk**, maintenance **±0.15 kg/wk** band.
- RLS enabled, `authenticated` role policies (same as other tables).

### Unit normalization

`workout_logs.weight_lbs` holds **mixed units**: the app writes kg with `weight_unit: 'kg'`; the MCP `log_workout_set` tool writes lbs with `weight_unit: 'lbs'`. Normalize once at load: `weight_unit === 'lbs' → ×0.4536`, else kg. Everything downstream is kg.

## Metrics (`lib/trends.ts`)

Four groups, one pure function each:

1. **Body & phase** — daily weight + 7-day rolling average; weekly change rate = linear fit over the last 21 days; verdict vs phase target: `on_track | fast | slow` (fast/slow = outside ±50% of target rate). Maintenance uses the ± band: inside = on_track.
2. **Strength** — per-exercise **e1RM** via Epley (`w × (1 + reps/30)`), best set per session, for the top 6 most-logged exercises in range; **weekly tonnage** = Σ(weight_kg × reps) across all sets.
3. **Engine** — per-run efficiency = `speed (m/min) ÷ avg HR` for `running` workouts with `distance_m > 0` (elevation gain shown as context badge, not normalized); lifting avg-HR trend across `weightlifting` sessions; 7-day rolling recovery score and HRV.
4. **Load** — weekly training minutes and session count (category = `training`; the `classifyWorkout` commuting/walking classifier moves from `lib/mcp/db.ts` into `lib/trends.ts`, and `lib/mcp/db.ts` re-imports it from there — app code must not import from `lib/mcp`); weekly strain sum from snapshots; training-vs-lifestyle minutes split.

Weekly buckets are Monday-start in `Europe/Berlin` (LIFEOS_TIME_ZONE).

Trendlines render only at **n ≥ 3** points; below that show dots + "collecting data" (existing WhoopTab pattern).

## UI

**Tab bar:** `◐ TODAY · ◆ FOCUS · ▲ WORKOUT · ○ NUTRITION · ~ WHOOP · ∿ TRENDS · € MONEY`. Keyboard shortcuts extend to `1–7`; swipe order matches. Trends sits between Whoop and Money.

**Layout (top → bottom):**

1. **Phase header card** — current phase + duration ("BULK · week 5"), weight rate vs target ("+0.31 kg/wk · on track"), strength chip (↑/→/↓ = median e1RM slope across the top lifts, threshold ±1%/week) and volume chip (mean of last 3 complete weeks' tonnage vs the prior 3, threshold ±5%). No phase set → phase-agnostic display + "set phase" prompt. Phase changes via `.sheet` bottom sheet (phase, start date, optional target rate).
2. **Body** — weight line + 7d rolling average, shaded phase-target band, phase-change markers on x-axis.
3. **Strength** — small-multiple e1RM lines for top 6 lifts (mint trending up, coral down); weekly tonnage bars.
4. **Engine** — running-efficiency points + trendline; lifting avg-HR line; 7d recovery/HRV rolling line.
5. **Load** — weekly training-minutes bars colored by sport, weekly strain overlay, training-vs-lifestyle ratio stat.

**Range selector:** segmented `4W / 12W / 6M / ALL`, default 12W, persisted in `localStorage` (`lifeos-trends-range`).

Aurora rules apply: `.panel` cards, `rounded-2xl`, Geist Mono for numbers, channel colors only (mint/cyan/violet/coral/amber), no emojis, `prefers-reduced-motion` respected.

## Data flow

`useTrends`: on mount + range change, one `Promise.all` over the 4 source queries (filtered `>= range start`; `ALL` applies no date filter) plus `training_phases` (all rows). Computed metrics in `useMemo`. Returns `{ loading, error, metrics, range, setRange, currentPhase, setPhase }`. `setPhase` inserts a `training_phases` row and refreshes.

## Edge cases

- Mixed weight units → normalized at load (see above).
- `weight_lbs = 0` sets (bodyweight/isometric) → excluded from tonnage and e1RM.
- Unscored workouts (null strain/HR) → skipped per-metric, not dropped from other metrics.
- Runs without distance (no GPS) → excluded from efficiency, still count toward load.
- Weight-rate fit needs ≥ 5 weigh-ins in the last 21 days, else "need more data."
- Empty `training_phases` → phase-agnostic mode.
- Division-by-zero guards on HR and distance.

## Testing

Vitest unit tests for `lib/trends.ts`:

- tonnage with mixed units and zero-weight sets
- Epley e1RM + best-set-per-session selection
- rolling average with gaps
- weekly rate + on_track/fast/slow verdicts (incl. maintenance band)
- efficiency math and exclusion rules
- weekly bucketing across month boundaries (Monday-start, Berlin time)

UI verified visually in the dashboard; correctness lives in the pure functions.

## Out of scope (YAGNI)

- Muscle-group mapping/aggregation
- AI insight narratives (future layer on top of these metrics)
- MCP `get_trends` tool (pure functions make it cheap to add later)
- Per-run type tagging (elevation badge covers the confound for now)

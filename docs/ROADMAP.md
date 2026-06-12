# LifeOS — Roadmap: Monthly Review + the next three leverage points

**Date:** 2026-06-11 · Builds on `docs/AI_DAILY_BRIEF_SPEC.md`. Design only — no code yet.

---

## 1. Monthly Review ("was I on point?")

One screen that answers, per day and per month: **were goals, training, and fuel on point — and where did it slip?** All required data already exists; this is an aggregation + UI feature, no new capture.

### 1.1 Scoring model (deterministic, per goal-day)

| Channel | Source | On point | Partial | Off | No data |
|---|---|---|---|---|---|
| **Goals** | `todos` (`day_date`, `done`) | 100% done (≥1 todo) | ≥50% | <50% | no todos that day |
| **Training** | `ai_brief_outcomes.training_adherence`; fallback: `workout_logs` vs `DAY_META`/`workout_sessions` expectation | `followed` | `deviated_easier` / `unknown` | `skipped` / `deviated_harder` | no plan + no logs |
| **Fuel** | `meal_log_item` totals vs `nutrition_day` targets | kcal within ±10% **and** protein ≥90% of target | one of the two | neither | no `nutrition_day` row |

Day score = the three channel states (never collapsed into one number — the point is seeing *which* system slipped). Recovery (`whoop_snapshots.recovery_score`) renders as context, not judgment.

### 1.2 UI

- **Calendar heat grid** (consumer-style): one cell per day, three stacked micro-bars (goals / training / fuel) in channel colors at full/half/faint opacity. Recovery as a thin top hairline tinted by readiness state. Current goal-day ringed.
- **Tap a day** → bottom-sheet detail: that day's brief headline + verdict, todos with done state, logged sets vs prescription, macro bars vs targets, check-in scores.
- **Month header stats:** on-point % per channel, best streak, current streak, avg recovery vs previous month, briefs rated useful %.
- **Entry points:** tap the date eyebrow on Today (mobile), `⌘K → "Monthly review"` + sidebar item (desktop). **Not a 6th tab** — the dock stays 5.
- Swipe/arrow between months. `boot` stagger on the grid, of course.

### 1.3 Architecture

- `lib/review/month.ts` — pure scoring functions (`scoreGoals`, `scoreTraining`, `scoreFuel`, `buildMonthReview(rows…)`) — unit-testable like `lib/readiness.ts`.
- `GET /api/review/month?month=YYYY-MM` — server route assembling one month (≤31 days × 4 queries, fine on the fly; no new tables required).
- Optional later: persist a `day_scores` row during the existing nightly outcomes cron for instant loads and multi-month trends.
- **Phase 2 (AI):** a monthly narrative using the Daily Brief machinery verbatim (context pack → guarded, evidence-cited output, stored + rated). "Three things that worked, one thing to change" — this is opportunity #3 from the original spec landing in its natural home.

### 1.4 Build order

1. `lib/review/month.ts` + tests (pure, fixtures from real months).
2. API route + month grid UI (mobile first) + day detail sheet.
3. Desktop layout + ⌘K entry.
4. Streaks/summary header.
5. AI monthly narrative (reuses brief guards/model/fallback stack).

---

## 2. Smaller additions worth queuing

- **Body-weight log** — the nutrition goal is literally `cut`, but there is no weight table. One `body_metrics` table + a 10-second morning input on Today + trend sparkline vs target. Without it, "was the cut on point?" is unanswerable.
- **Habit streaks on Today** — current/best streak chips for the three channels (data falls out of the monthly scoring).
- **PWA share target / shortcuts** — share a photo or text into LifeOS → meal proposal flow; long-press app icon → "Log meal", "Check in".
- **Voice/photo meal capture** — extend the existing meal-extraction endpoint (same catalog grounding, same confirm-before-write contract).
- **Data export** — one endpoint dumping briefs/outcomes/logs as CSV/JSON. It's your data; lock-in is a smell.

---

## 3. The three improvements I would make

Chosen against the app's actual promise — *a companion that brings the best out of you* — and its current weakest links.

### Improvement 1 — Frictionless hand-off: every artifact is one tap from portable text

Your example, generalized. The Whoop API has no write endpoint for workouts, so the right mechanism is **perfectly formatted copy**:

- **"Copy workout"** after the last set (WorkoutTab/WorkoutDesktop): exercises, sets × reps × kg, RPE, duration, session title — formatted for pasting into Whoop AI, a coach chat, or any LLM. Pure client feature: `lib/share.ts` (`formatWorkoutForWhoop(logs, session)`), `navigator.clipboard` + native `navigator.share` on mobile.
- **"Copy day"** on Today: readiness state + signals, brief verdict, macros vs targets, completed goals — your whole day as a paste-able block for any external conversation.
- **"Copy week"** on the (future) review screen.

Cheap (1–2 days), zero risk, and it makes LifeOS the *source of truth that travels* instead of a silo. Ship first.

### Improvement 2 — A living training block system (kill the dead-plan problem permanently)

The six-week plan expired June 7 and the app now honestly says "no active block" — honest, but a companion shouldn't shrug. The single highest-leverage structural fix:

- **`goals` table** (the spec's unresolved #3): next race + date, target body metrics, weekly training targets. The Daily Brief context pack gets a `standing_goal` section — priorities finally optimize *toward* something.
- **Block builder:** create the next 4–6 week block into the existing `workout_sessions`/`workout_exercises` tables (template from the last block, shifted), with `PLAN_START`/`PLAN_WEEKS` moving from `lib/workout.ts` constants into a `training_blocks` table — plans become data, not code (resolves the CLAUDE.md pending todo).
- **Auto-progression with a readiness brake:** the per-exercise overload suggestion in WorkoutTab already exists; lift it to week-over-week block progression, and let accumulated `recover`/`hardNo` days propose a deload week — as an `ai_proposals`-style confirmation, never auto-applied.

This is the difference between an app that *records* training and a companion that keeps you *in* training.

### Improvement 3 — A personal pattern engine ("what works for *you*", with receipts)

`daily_checkins`, `ai_briefs`, `ai_brief_outcomes`, and 30+ days of Whoop data are quietly accumulating the most valuable dataset you own. Use it:

- **Deterministic correlations first** (`lib/patterns.ts`): lagged comparisons with minimum-N and effect-size guards — "sleep consistency <60% → next-day HRV −12% (n=8)", "protein lands on training days, misses by ~40 g on rest days", "briefs you rated useful were followed 78% vs 31%".
- **Surfaced in three places:** a "Patterns" card in the monthly review, one line in the Daily Brief context pack (`personal_patterns`, evidence-cited like every other input), and the weekly narrative.
- **AI only phrases; statistics decide.** Same epistemic contract as the brief: observation → inference → recommendation, confidence attached, small-N silence rather than small-N stories.

This is the original spec's "learns from outcomes over time" promise actually materializing — and it's what makes the companion feel like it *knows you* rather than knowing sports science.

---

## 4. Suggested sequence

| Order | Item | Size | Why this order |
|---|---|---|---|
| 1 | Copy workout / copy day (Improvement 1) | S | Instant daily value, zero risk |
| 2 | Body-weight log | S | Unblocks cut tracking before more weeks pass |
| 3 | Monthly Review core (§1.1–1.3, no AI) | M | The retrospective backbone; creates the scoring lib everything else reuses |
| 4 | `goals` table + block builder (Improvement 2) | M–L | Ends the dead-plan state; enriches the brief |
| 5 | Pattern engine v1 (Improvement 3) | M | Needs the accumulating data — later is better |
| 6 | Monthly AI narrative + streaks | S–M | Cherry on top of 3 + 5 |

@AGENTS.md

# LifeOS Dashboard

Personal life OS for a hybrid athlete / indie developer. Replaces a fragmented Notion setup. Think cockpit — fast, glanceable, mobile-first.

## Running the project

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve production build
```

> The `.bin/next` symlink is broken in this environment. Scripts are patched to use `node node_modules/next/dist/bin/next` directly — do not change this.

## Stack

- **Next.js 16.2.4** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS v4** — theme tokens live in `app/globals.css` via `@theme`, not `tailwind.config.ts`
- **Supabase** — `@supabase/ssr` for browser/server clients
- **Anthropic SDK** — Claude Haiku for the "Polish & Add" feature

## Environment variables

Copy `.env.local.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_REASONING_MODEL= # optional, defaults to claude-opus-4-8
ANTHROPIC_FALLBACK_MODEL=  # optional, defaults to claude-haiku-4-5
ANTHROPIC_EXTRACTION_MODEL=# optional, defaults to fallback
CRON_SECRET=
LIFEOS_TIME_ZONE=Europe/Berlin
APP_PASSWORD=              # password gate for the app (cookie: lifeos_auth, 90-day TTL)
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
SUPABASE_OWNER_EMAIL=      # Supabase Auth owner account — used to issue authenticated sessions
SUPABASE_OWNER_PASSWORD=   # server-only, never reaches the browser
SUPABASE_SERVICE_ROLE_KEY= # server-only, used by cron/protected APIs
MARKETDATA_PROVIDER=       # finances: "twelvedata" (default) or "finnhub" — ETF/stock quotes
MARKETDATA_API_KEY=        # finances: provider key; crypto uses CoinGecko (keyless). Empty = crypto-only quotes
MARKETDATA_BASE_CURRENCY=  # finances: crypto valuation currency for price-sync cron (default EUR)
```

The app runs without Anthropic access: Daily Brief and meal extraction use deterministic fallbacks, while Polish & Add echoes input. Missing `SUPABASE_OWNER_*` means browser RLS blocks queries.

## Auth

Two-layer auth:

1. **Password gate** — `POST /api/auth` validates `APP_PASSWORD` and sets an `httpOnly` cookie (`lifeos_auth`, 90-day TTL). All routes are protected by `proxy.ts` which checks this cookie on every request.

2. **Supabase session** — on the same login request, the server signs into Supabase with `SUPABASE_OWNER_EMAIL`/`SUPABASE_OWNER_PASSWORD` and writes the session cookies into the response. The browser Supabase client picks these up automatically, so all subsequent queries run as `authenticated` and satisfy RLS.

`proxy.ts` (Next.js 16 middleware convention — `export function proxy`) refreshes the Supabase JWT on every request. If the refresh token has expired (7-day TTL), it silently re-signs-in with the owner credentials — no manual re-login required.

## Design system — "Aurora" (dual theme)

Vibrant consumer UI with **dark and light modes**. Dark: deep blue-black under a soft aurora wash (mint → cyan → violet). Light: airy blue-white with the same hues as pastel washes. Glassy rounded surfaces, vivid per-metric channel colors, springy motion.

**Theming:** every neutral is a CSS variable defined in `app/globals.css` — dark values on `:root`, light overrides on `html.light`. A pre-paint script in `app/layout.tsx` applies the stored choice (`localStorage['lifeos-theme']`) or system preference; `components/ThemeToggle.tsx` flips light ↔ dark in one click (system preference applies only until the first explicit choice). **Never hardcode neutral hexes** — use the tokens:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0b0d12` | `#f3f5fa` | Page background |
| `--surface` | `#14161d` | `#ffffff` | Panel base (prefer `.panel` class) |
| `--surface-2` | `#181b23` | `#eef1f7` | Nested surfaces |
| `--border` | `#232733` | `#e1e6ef` | Default borders |
| `--border-hi` | `#343a4a` | `#c9d1de` | Elevated borders |
| `--text` | `#f4f6f8` | `#14161d` | Primary text |
| `--text-dim` | `#9aa3b2` | `#5b6473` | Labels, secondary text |
| `--text-faint` | `#5d6575` | `#97a0af` | Tertiary / timestamps |
| `--ink-01…08` | white alphas | dark alphas | Subtle fills/hairlines |
| `--chrome` / `--scrim` | dark glass | light glass | Header/dock/overlay backgrounds |
| `--material-thin/regular/thick` | dark alphas | white alphas | Liquid Glass material fills (use via `.glass`/`.glass-thick`) |
| `--glass-edge` | white inset | white inset | Specular top-edge highlight for glass surfaces |
| `--ring-track` / `--shadow-pop` / `--panel-bg` / `--panel-shadow` | — | — | Component plumbing |

Accents stay literal in both themes: `#00d26a` mint (brand), `#38bdf8` cyan, `#a78bfa` violet, `#fb7185` coral (bad), `#fbbf24` amber (warn). **Caution:** components that append alpha to a color prop (`${color}55`) or use it in SVG presentation attributes need literal hexes — pass theme vars only where the component is var-safe (Ring guards this via `isHex`).

**Fonts:** `Geist` for everything textual — weight does the display work (class `.display` adds tight tracking). `Geist Mono` for all numbers and data values (`tabular-nums`). Legacy aliases keep old inline refs working: `--font-inter-tight` → Geist, `--font-jetbrains-mono` → Geist Mono. **Always give `var(--font-*)` references an explicit fallback** (`var(--font-geist-sans, system-ui)`) — an undefined font variable invalidates the whole declaration and drops the page to browser serif.

**Utility classes (globals.css):** `.panel` (gradient card — cheap, default for in-content cards), `.glass` / `.glass-thick` (Liquid Glass: true `backdrop-filter` blur+saturate — reserve for chrome [headers, docks, sidebars], overlays/sheets, and at most one hero card per view; stacking many backdrop-filters kills mobile scroll perf; borders are the caller's job via Tailwind, the classes set none), `.sheet` (Apple-style spring slide-up for bottom sheets/palettes), `.ticks` (gradient halo border), `.boot` (staggered rise-in of direct children), `.flicker` (soft fade-up), `.glint-track` (traveling shimmer on a hairline), `.pulse-dot` (live indicator), `.display` (display type).

**Rules:** No emojis in UI. Gradients as atmosphere and accents only, in brand hues. Soft glow (`box-shadow` with channel-color alpha) is the highlight language. Radii: sheets/docks `rounded-3xl`, cards `rounded-2xl`, controls `rounded-xl`/`rounded-full`. Hairline separators inside cards/sheets use `--ink-06`, not `--border`. Interactive surfaces get `active:scale-[0.95–0.99]` pressed states. All motion respects `prefers-reduced-motion`; glass respects `prefers-reduced-transparency` (both handled globally in globals.css).

## Project structure

```
app/
  layout.tsx              # Root layout — Google Fonts, PWA meta, manifest link
  page.tsx                # Renders <Shell />
  globals.css             # Tailwind @theme tokens + base styles
  login/page.tsx          # Password login page
  callback/route.ts       # Whoop OAuth2 callback — exchanges code, stores token
  api/
    auth/route.ts         # POST { password } → sets lifeos_auth cookie + Supabase session
    polish/route.ts       # POST { text } → { polished } via Claude Haiku
    whoop-status/route.ts # GET → last sync time + token validity
    whoop-sync/route.ts   # POST → triggers whoop-sync Edge Function
    finance/prices/route.ts # POST { instruments } → live ETF/stock/crypto quotes; persists fin_prices via service role

components/
  Shell.tsx               # Tab state (default = 0 / Today), keyboard shortcuts (1–5), swipe navigation
  TabBar.tsx              # Fixed bottom nav — ◐ TODAY · ◆ FOCUS · ▲ WORKOUT · ○ NUTRITION · ~ WHOOP · ∿ TRENDS · € MONEY
  ui/
    Card.tsx              # #1a1a1a bg, #2a2a2a border, rounded-xl wrapper
    charts.tsx            # Shared chart primitives — ChartTitle, AxisRow, BigSpark, DualSpark, BarChart, Legend
    Ring.tsx              # SVG recovery ring (0–100%, configurable size/thickness)
    StatCard.tsx          # Label + big mono number + unit + subtext
    Sparkline.tsx         # SVG polyline from number[]
    ProgressBar.tsx       # 4px horizontal progress bar
  tabs/
    TodayTab.tsx          # Live — reads whoop_snapshots via Supabase realtime; GoalTicker with progress bar
    FocusTab.tsx          # Interactive — todos (Supabase CRUD, inline edit, reorder) + Polish & Add
    WorkoutTab.tsx        # Interactive — plan from DB, set logging, progressive overload suggestions
    NutritionTab.tsx      # Interactive — normalized nutrition plan from DB, meal logging
    WhoopTab.tsx          # Live — reads whoop_snapshots + whoop_workouts, connect/sync controls
    TrendsTab.tsx         # Interactive — phase-aware trends: weight vs target, e1RM/tonnage, run efficiency, weekly load
    FinanceTab.tsx        # Interactive — investments (ETF/stocks/crypto) + cash/fixed savings: net worth, allocation, holdings, P/L (incl. realized); add holding/cash, partial sell, edit balances; swipe-left rows for sell/edit/remove (components/finance/SwipeRow.tsx); sync prices

lib/
  supabase.ts             # Browser client (createBrowserClient)
  trends.ts               # Pure trend math — classify/shape workouts, e1RM, tonnage, run efficiency, weight rate vs phase target
  useTrends.ts            # Client hook — loads trend sources per range, memoizes computed metrics, setPhase
  finance.ts              # Pure portfolio math — buildPositions, summarizePortfolio, valuation, allocation, rollupHoldings, formatting
  finance/import.ts       # Tolerant CSV parsers (Trade Republic / Revolut / crypto) → normalized ParsedTxn[]
  finance/useFinance.ts   # Client hook — loads fin_* tables, computes summary; addHolding / importTransactions / refreshPrices
  supabase-server.ts      # Server client for API routes
  goal-dates.ts           # Local 6 AM goal-day helpers
  types.ts                # TypeScript interfaces for all DB tables
  nutrition.ts            # Nutrition helper types and functions
  whoop-server.ts         # Server-side Whoop API client
  workout.ts              # Shared workout constants — PLAN_START, getCurrentWeek, DAY_META, getTodayKey

proxy.ts                  # Next.js 16 middleware — password gate + Supabase session refresh

supabase/
  migrations/             # Applied in order — see filenames for scope
  functions/
    whoop-auth/index.ts   # Deno Edge Function — OAuth token exchange helper
    whoop-sync/index.ts   # Deno Edge Function — Whoop API poll + upsert
    price-sync/index.ts   # Deno Edge Function — market-data poll → fin_prices (daily pg_cron)

public/
  manifest.json           # PWA manifest
  sw.js                   # Service worker — cache-first for /_next/static + fonts, network-first for navigation, bypass for /api
```

## Database schema

All tables have RLS enabled. Policies require `auth.role() = 'authenticated'` — the browser session is established at login via `SUPABASE_OWNER_*` credentials. `whoop_tokens` is service_role only.

| Table | Purpose |
|---|---|
| `whoop_snapshots` | One row per Whoop recovery cycle — recovery %, HRV, RHR, strain, sleep stages |
| `whoop_workouts` | Whoop-detected workouts — sport, strain, HR zones |
| `whoop_tokens` | OAuth access/refresh tokens for the Whoop API |
| `whoop_body_measurements` | One row per day from the WHOOP body endpoint — weight, height, max HR (service-role writes only) |
| `workout_sessions` | Training plan — week/day/session type, prescribed by the plan |
| `workout_exercises` | Exercises per session — order, sets, reps, weight, RPE targets |
| `workout_logs` | Logged sets — exercise, weight, reps, RPE, refs to session/exercise |
| `nutrition_day_types` | Normalized day type rows (hard_training / moderate_training / rest_easy) with macro targets |
| `nutrition_food_portions` | Food library — portion labels, macros, equivalence groups |
| `nutrition_meal_templates` | Meal structure per day type — ordered meals with default items |
| `meal_logs` | Per-meal logs linked to a nutrition day |
| `meal_log_items` | Individual food items logged within a meal |
| `training_phases` | Phase declarations (bulk/cut/maintenance) — start date + optional target kg/week; latest row = current phase |
| `todos` | Daily goals — text, done flag, `day_date` for daily grouping, `sort_order` for manual reorder |
| `daily_checkins` | Subjective soreness, motivation, energy, mood, symptoms, and notes |
| `ai_briefs` | Replayable context and validated output for each Daily Brief generation |
| `ai_proposals` | User-confirmed mutations proposed by a brief |
| `ai_brief_outcomes` | Usefulness rating, adherence, nutrition actuals, and next-day recovery delta |
| `fin_accounts` | Investment accounts — broker / bank / wallet / manual |
| `fin_instruments` | Securities & coins — symbol, ISIN, asset_class (etf/stock/crypto) |
| `fin_holdings` | Current positions — quantity + avg_cost per account/instrument |
| `fin_transactions` | Buys/sells/dividends/transfers; `external_id` makes CSV re-imports idempotent |
| `fin_prices` | Latest + historical close per instrument (price-sync Edge Function writes via service role) |
| `fin_daily_closes` | View — last price per instrument per day; the client reads this (falls back to `fin_prices` if the migration isn't applied) |

Todos reset by querying the local goal day from `lib/goal-dates.ts`. The goal day flips at 6 AM client-side — new day = new `day_date`, old rows stay in DB.

## Workout plan

The seeded plan started **Monday April 27 2026** and ended after six weeks. Constants live in `lib/workout.ts`:
- `PLAN_START` — anchor date
- `getCurrentWeek()` — returns 1–6 only while the block is active, otherwise `null`
- `getPlanStatus()` — explicitly reports `not_started`, `active`, or `expired`
- `DAY_META` — per-weekday config: `dbKey` (null = no gym session), `restLabel`, `restSub`
- `getTodayKey()` — returns the current weekday string

WorkoutTab uses `lastSets` (filtered to before today) to compute progressive overload suggestions: if last session hit the top of the prescribed rep range, the exercise header shows `→ try Xkg`.

## Whoop data pipeline

OAuth2 authorization code flow. Tokens are stored in `whoop_tokens`. The access token lasts 1 hour; refresh tokens are issued once Whoop approves the app for the `offline` scope (pending review).

```
User → "connect whoop" button → Whoop OAuth → /api/whoop-callback → stores token in whoop_tokens
"sync now" button → /api/whoop-sync → supabase/functions/whoop-sync → whoop_snapshots + whoop_workouts
Hourly cron → whoop-sync Edge Function (pg_cron configured in migrations)
```

**To reconnect when the token expires:** click "reconnect whoop →" in the Whoop tab (shown when last sync is >55 min old).

**To deploy the Edge Functions:**
```bash
supabase functions deploy whoop-sync
supabase functions deploy whoop-auth
supabase secrets set WHOOP_CLIENT_ID=aeb5a295-3c6a-42a9-9657-57227bb0adb7 WHOOP_CLIENT_SECRET=<secret>
```

**Whoop developer app redirect URIs (must be whitelisted in dashboard):**
```
http://localhost:3000/api/whoop-callback
https://lifeos-zeta-three.vercel.app/api/whoop-callback
```

**Whoop `offline` scope:**
- `offline` is already included in `WHOOP_SCOPES` for the app tabs.
- The Edge Function already handles `refresh_token` grant.
- Once Whoop approves the app for offline access, users need to reconnect once to get a refresh token issued.

**Chart visibility:**
- Recovery/HRV/Strain sparklines: appear after 2+ days of synced data (`whoop_snapshots` needs ≥ 2 rows)
- Workouts section: appears immediately after first sync if any workouts are returned

## Tab reference

| # | Name | Default | Status |
|---|---|---|---|
| 0 | Today | **Yes** | Live — Whoop snapshot, GoalTicker with progress bar, day ring |
| 1 | Focus | No | Interactive — todos (inline edit, ↑↓ reorder, Polish & Add), Plan Tomorrow |
| 2 | Workout | No | Interactive — plan from DB, set logging, progressive overload suggestions |
| 3 | Nutrition | No | Interactive — day type from `nutrition_day_types`, meals from `nutrition_meal_templates` |
| 4 | Whoop | No | Live — `whoop_snapshots` + `whoop_workouts`, realtime, connect/sync controls |
| 5 | Trends | No | Interactive — phase-aware trends: weight vs target rate, e1RM + tonnage, run efficiency, weekly load; phase set via `training_phases` |
| 6 | Money | No | Interactive — investments from `fin_*` tables: net worth, allocation, holdings, P/L; add holding/cash, partial sell (realized P/L stored in txn notes), swipe-row actions; `/api/finance/prices` sync |

## Navigation

- **Mobile:** swipe left/right to change tabs (threshold 50px, only fires if horizontal > vertical delta)
- **Desktop:** keys `1–7` switch tabs (suppressed when focus is inside an input)

---

## Pending todos

- [ ] **Next training block source** — the expired plan is now reported honestly; define the next DB-backed block or external source.

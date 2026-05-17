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
APP_PASSWORD=              # password gate for the app (cookie: lifeos_auth, 90-day TTL)
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
SUPABASE_OWNER_EMAIL=      # Supabase Auth owner account — used to issue authenticated sessions
SUPABASE_OWNER_PASSWORD=   # server-only, never reaches the browser
```

The app runs without most of these (graceful fallback), but the Focus tab won't persist, Polish & Add will echo input as-is, and the Whoop pipeline won't function. Missing `SUPABASE_OWNER_*` means RLS will block all queries.

## Auth

Two-layer auth:

1. **Password gate** — `POST /api/auth` validates `APP_PASSWORD` and sets an `httpOnly` cookie (`lifeos_auth`, 90-day TTL). All routes are protected by `proxy.ts` which checks this cookie on every request.

2. **Supabase session** — on the same login request, the server signs into Supabase with `SUPABASE_OWNER_EMAIL`/`SUPABASE_OWNER_PASSWORD` and writes the session cookies into the response. The browser Supabase client picks these up automatically, so all subsequent queries run as `authenticated` and satisfy RLS.

`proxy.ts` (Next.js 16 middleware convention — `export function proxy`) refreshes the Supabase JWT on every request. If the refresh token has expired (7-day TTL), it silently re-signs-in with the owner credentials — no manual re-login required.

## Design tokens

All tokens are defined once in `app/globals.css`:

| Token | Value | Use |
|---|---|---|
| `bg` | `#0e0e0e` | Page background |
| `card` | `#1a1a1a` | Card backgrounds |
| `border` | `#2a2a2a` | Default borders |
| `border-hi` | `#3a3a3a` | Elevated borders |
| `text` | `#ededed` | Primary text |
| `dim` | `#888` | Labels, secondary text |
| `faint` | `#555` | Tertiary / timestamps |
| `accent` | `#00d26a` | Active states, progress, CTA |

**Fonts:** `JetBrains Mono` for all numbers and data values. `Inter Tight` for UI labels and body text. No emojis in UI. No gradients.

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

components/
  Shell.tsx               # Tab state (default = 0 / Today), keyboard shortcuts (1–5), swipe navigation
  TabBar.tsx              # Fixed bottom nav — ◐ TODAY · ◆ FOCUS · ▲ WORKOUT · ○ NUTRITION · ~ WHOOP
  ui/
    Card.tsx              # #1a1a1a bg, #2a2a2a border, rounded-xl wrapper
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

lib/
  supabase.ts             # Browser client (createBrowserClient)
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
| `workout_sessions` | Training plan — week/day/session type, prescribed by the plan |
| `workout_exercises` | Exercises per session — order, sets, reps, weight, RPE targets |
| `workout_logs` | Logged sets — exercise, weight, reps, RPE, refs to session/exercise |
| `nutrition_day_types` | Normalized day type rows (hard_training / moderate_training / rest_easy) with macro targets |
| `nutrition_food_portions` | Food library — portion labels, macros, equivalence groups |
| `nutrition_meal_templates` | Meal structure per day type — ordered meals with default items |
| `meal_logs` | Per-meal logs linked to a nutrition day |
| `meal_log_items` | Individual food items logged within a meal |
| `todos` | Daily goals — text, done flag, `day_date` for daily grouping, `sort_order` for manual reorder |

Todos reset by querying the local goal day from `lib/goal-dates.ts`. The goal day flips at 6 AM client-side — new day = new `day_date`, old rows stay in DB.

## Workout plan

Plan started **Monday April 27 2026**. Constants live in `lib/workout.ts`:
- `PLAN_START` — anchor date
- `getCurrentWeek()` — returns 1–6 based on elapsed time
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

## Navigation

- **Mobile:** swipe left/right to change tabs (threshold 50px, only fires if horizontal > vertical delta)
- **Desktop:** keys `1–5` switch tabs (suppressed when focus is inside an input)

---

## Pending todos

- [ ] **Plan/content architecture** — decide whether training and nutrition plans should stay DB-first, sync from Notion read-only, or use another source-of-truth model.

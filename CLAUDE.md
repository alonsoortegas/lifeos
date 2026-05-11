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
APP_PASSWORD=           # password gate for the app (cookie: lifeos_auth, 90-day TTL)
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
```

The app runs without most of these (graceful fallback), but the Focus tab won't persist, Polish & Add will echo input as-is, and the Whoop pipeline won't function.

## Auth

Simple password gate — no Supabase auth, no magic links. `POST /api/auth` validates `APP_PASSWORD` and sets an `httpOnly` cookie (`lifeos_auth`) that lasts 90 days. Unauthenticated requests are redirected to `/login`.

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
    auth/route.ts         # POST { password } → sets lifeos_auth cookie
    polish/route.ts       # POST { text } → { polished } via Claude Haiku
    whoop-status/route.ts # GET → last sync time + token validity
    whoop-sync/route.ts   # POST → triggers whoop-sync Edge Function

components/
  Shell.tsx               # Tab state (default = 1 / Focus), renders active tab + TabBar
  TabBar.tsx              # Fixed bottom nav — ◐ TODAY · ◆ FOCUS · ▲ WORKOUT · ○ NUTRITION · ~ WHOOP
  ui/
    Card.tsx              # #1a1a1a bg, #2a2a2a border, rounded-xl wrapper
    Ring.tsx              # SVG recovery ring (0–100%, configurable size/thickness)
    StatCard.tsx          # Label + big mono number + unit + subtext
    Sparkline.tsx         # SVG polyline from number[]
    ProgressBar.tsx       # 4px horizontal progress bar
  tabs/
    TodayTab.tsx          # Live — reads whoop_snapshots via Supabase realtime
    FocusTab.tsx          # Interactive — todos (Supabase CRUD) + Polish & Add
    WorkoutTab.tsx        # Interactive — loads plan from DB, logs sets to workout_logs
    NutritionTab.tsx      # Interactive — normalized nutrition plan from DB, meal logging
    WhoopTab.tsx          # Live — reads whoop_snapshots + whoop_workouts, connect/sync controls

  lib/
  supabase.ts             # Browser client (createBrowserClient)
  supabase-server.ts      # Server client for API routes
  goal-dates.ts           # Local 6 AM goal-day helpers
  types.ts                # TypeScript interfaces for all DB tables
  nutrition.ts            # Nutrition helper types and functions
  whoop-server.ts         # Server-side Whoop API client

supabase/
  migrations/             # Applied in order — see filenames for scope
  functions/
    whoop-auth/index.ts   # Deno Edge Function — OAuth token exchange helper
    whoop-sync/index.ts   # Deno Edge Function — Whoop API poll + upsert

public/
  manifest.json           # PWA manifest
  sw.js                   # Service worker stub
```

## Database schema

All tables have RLS enabled (open dev policies — tighten before sharing):

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
| `todos` | Daily goals — text, done flag, `day_date` for daily grouping |

Todos reset by querying the local goal day from `lib/goal-dates.ts`. The goal day flips at 6 AM client-side — new day = new `day_date`, old rows stay in DB.

## Whoop data pipeline

OAuth2 authorization code flow. Tokens are stored in `whoop_tokens`. The access token lasts 1 hour; refresh tokens are issued once Whoop approves the app for the `offline` scope (pending review).

```
User → "connect whoop" button → Whoop OAuth → /callback → stores token in whoop_tokens
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
http://localhost:3000/callback
https://lifeos-zeta-three.vercel.app/callback
```

**Adding `offline` scope (once Whoop approves the app):**
1. Add `offline` to `WHOOP_SCOPES` in `components/tabs/WhoopTab.tsx`
2. The Edge Function already handles `refresh_token` grant — no other changes needed
3. Users will need to reconnect once to get a refresh token issued

**Chart visibility:**
- Recovery/HRV/Strain sparklines: appear after 2+ days of synced data (`whoop_snapshots` needs ≥ 2 rows)
- Workouts section: appears immediately after first sync if any workouts are returned

## Tab reference

| # | Name | Default | Status |
|---|---|---|---|
| 0 | Today | No | Live — reads `whoop_snapshots` via Supabase realtime + `/api/whoop-status` |
| 1 | Focus | **Yes** | Fully interactive — Supabase todos + Claude Haiku polish |
| 2 | Workout | No | Interactive — plan loaded from `workout_sessions`/`workout_exercises`, sets logged to `workout_logs` |
| 3 | Nutrition | No | Interactive — day type from `nutrition_day_types`, meals from `nutrition_meal_templates`, logging to `meal_log_items` |
| 4 | Whoop | No | Live — reads `whoop_snapshots` + `whoop_workouts`, Supabase realtime subscription, connect/sync controls |

---

## Pending todos

### Must-do before this is a real daily driver

- [ ] **Supabase RLS** — tighten RLS policies before sharing the app. Currently open dev policies on all tables.
- [ ] **Notion integration** — read training plan and nutrition plan pages via Notion API. Populate `WorkoutTab` with today's session and `NutritionTab` meal structure. Read-only.
- [ ] **PWA icons** — add actual `icon-192.png` and `icon-512.png` to `public/`. The manifest references them but they don't exist yet.

### FocusTab enhancements

- [ ] **Goal inline editing and reorder** — support editing and reordering items in both Today and Plan Tomorrow lists.
- [ ] **Goal rollover** — on load, find any `todos` rows with `day_date < today` that are `done = false`, push them into today's list (dedup by exact text), then delete the originals. Runs once per session.
- [ ] **Push remaining button** — full-width dashed button below the goal list, visible only when at least one goal is unchecked. On confirm, moves all unchecked goals to the tomorrow list (dedup), removes them from today. Keeps checked goals in place.

### TodayTab enhancements

- [ ] **Day Ring remaining time** — add remaining awake time to the existing Day Ring.

### Nice-to-have

- [ ] **Daily anchor rotation** — store a list of anchors in Supabase or a local JSON file; rotate daily rather than hardcoding one quote.
- [ ] **Workout history** — show last session's sets inline on exercise cards (`last: 225 × 5 @ 8`). Read from `workout_logs` filtered by exercise name.
- [ ] **Service worker caching** — implement a proper offline strategy in `public/sw.js` (cache-first for static assets, network-first for API routes).
- [ ] **Strain live fill** — today's strain card shows `—` until Whoop syncs a workout. Auto-fill once a cycle with strain exists for today.
- [ ] **Keyboard shortcut** — `1–5` keys to switch tabs on desktop.
- [ ] **Swipe navigation** — left/right swipe to change tabs on mobile.

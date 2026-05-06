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
```

The app runs without these (graceful fallback), but the Focus tab won't persist and Polish & Add will echo input as-is.

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
  api/
    polish/route.ts       # POST { text } → { polished } via Claude Haiku

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
    TodayTab.tsx          # Static — recovery ring + 2×2 stat grid
    FocusTab.tsx          # Interactive — todos (Supabase CRUD) + Polish & Add
    WorkoutTab.tsx        # Interactive UI — expand-on-tap exercise cards + set logger
    NutritionTab.tsx      # Interactive UI — day type selector + macro grid + meals
    WhoopTab.tsx          # Static — full recovery breakdown + sleep stages + sparklines

lib/
  supabase.ts             # Browser client (createBrowserClient)
  supabase-server.ts      # Server client for API routes
  types.ts                # TypeScript interfaces for all DB tables

supabase/
  migrations/
    20260505000000_initial.sql   # Schema for all 4 tables
  functions/
    whoop-sync/index.ts          # Deno Edge Function — Whoop OAuth2 + poll + upsert

public/
  manifest.json           # PWA manifest
  sw.js                   # Service worker stub
```

## Database schema

Four tables, all with RLS enabled (open dev policies — tighten before sharing):

| Table | Purpose |
|---|---|
| `whoop_snapshots` | One row per Whoop recovery cycle — recovery %, HRV, RHR, strain, sleep stages |
| `workout_logs` | Individual set logs — exercise, weight, reps, RPE |
| `nutrition_logs` | Quick-log food entries — macros + day type |
| `todos` | Daily goals — text, done flag, `day_date` for daily grouping |

Todos reset by querying `day_date = current_date`. The 6 AM reset is handled client-side — new day = new `day_date`, old rows stay in DB.

## Whoop data pipeline

OAuth2 authorization code flow. The access token lasts 1 hour; there is no refresh token until Whoop approves the app for the `offline` scope (pending review).

```
User → "reconnect whoop" button → Whoop OAuth → /api/whoop-callback → stores token in whoop_tokens
"sync now" button → /api/whoop-sync → supabase/functions/whoop-sync → whoop_snapshots + whoop_workouts
```

**To reconnect when the token expires:** click "reconnect whoop →" in the Whoop tab (shown when last sync is >55 min old).

**To deploy the Edge Function:**
```bash
supabase functions deploy whoop-sync
supabase secrets set WHOOP_CLIENT_ID=aeb5a295-3c6a-42a9-9657-57227bb0adb7 WHOOP_CLIENT_SECRET=<secret>
# Optional cron: */30 * * * * → whoop-sync
```

**Whoop developer app redirect URIs (must be whitelisted in dashboard):**
```
http://localhost:3000/api/whoop-callback
https://lifeos-zeta-three.vercel.app/api/whoop-callback
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
| 0 | Today | No | Static — real Whoop data hardcoded from `whoop-data-dump.json` |
| 1 | Focus | **Yes** | Fully interactive — Supabase todos + Claude Haiku polish |
| 2 | Workout | No | Interactive UI — set logging wired to local state, not yet persisted to DB |
| 3 | Nutrition | No | Interactive UI — day type + macro display, quick log not yet persisted |
| 4 | Whoop | No | Static — real 7-day recovery + HRV from `whoop-data-dump.json` |

---

## Pending todos

### Must-do before this is a real daily driver

- [ ] **Supabase auth** — add user auth so the app is not a public endpoint. Simplest: magic link email auth, gate all DB access behind `auth.uid()` in RLS policies.
- [ ] **Workout logging → DB** — wire `WorkoutTab` set logger to `INSERT INTO workout_logs`. Currently logs to local state only.
- [ ] **Nutrition quick-log → DB** — wire the quick-log form in `NutritionTab` to `INSERT INTO nutrition_logs`.
- [ ] **Whoop live data** — deploy the Edge Function and point `WhoopTab` + `TodayTab` to read from `whoop_snapshots` instead of hardcoded values.
- [ ] **Notion integration** — read training plan and nutrition plan pages via Notion API. Populate `WorkoutTab` with today's session and `NutritionTab` meal structure. Read-only.
- [ ] **PWA icons** — add actual `icon-192.png` and `icon-512.png` to `public/`. The manifest references them but they don't exist yet.

### Nice-to-have

- [ ] **Daily anchor rotation** — store a list of anchors in Supabase or a local JSON file; rotate daily rather than hardcoding one quote.
- [ ] **Workout history** — show last session's sets inline on exercise cards (`last: 225 × 5 @ 8`). Read from `workout_logs` filtered by exercise name.
- [ ] **Nutrition targets from Notion** — replace the hardcoded Hard/Moderate/Rest macro targets with values pulled from the Notion nutrition page.
- [ ] **Service worker caching** — implement a proper offline strategy in `public/sw.js` (cache-first for static assets, network-first for API routes).
- [ ] **Today tab auto-refresh** — poll `whoop_snapshots` on mount and every 30 min to pick up new sync data without a page reload.
- [ ] **Strain live fill** — today's strain card shows `—` until Whoop syncs a workout. Auto-fill once a cycle with strain exists for today.
- [ ] **Keyboard shortcut** — `1–5` keys to switch tabs on desktop.
- [ ] **Swipe navigation** — left/right swipe to change tabs on mobile.

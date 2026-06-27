# LifeOS iOS App — Plan

**Status:** planned (not started) · **Target:** a TestFlight build ~1 week from kickoff
**Branch when we start:** `feat/ios-capacitor` (new, off `main`)

## Context & goal

LifeOS is a polished Next.js 16 PWA on Vercel (6 tabs, Supabase backend, MCP server).
We want a **good iOS app** *and* to **keep the web version**, from **one codebase**,
shippable **soon** (≈1 week to TestFlight), with a path to **monetize**. Decisions
already made:

- **Online-only is acceptable at first** → we do **not** need the local-first
  (PowerSync) foundation yet. Offline becomes a later phase only if monetization
  justifies it.
- **AI chatbot is out of scope for now** (rough idea; the MCP tools already exist
  for when we revisit).
- Connector priority after the app exists: **Apple Health → Strava → (AI later)**.

## Decision: wrap the existing app with Capacitor

Keep the Next.js app exactly as-is on Vercel. Add **Capacitor** to produce a native
iOS shell (Xcode project, App Store binary, native plugins) that renders the existing
UI and bridges to native APIs (HealthKit, haptics, push, status bar). Reuse ~100% of
the current code; the web app is untouched.

**Why this over the alternatives, given the constraints:**
- React Native / SwiftUI both require **rebuilding the UI**; React-Native-Web would
  also mean rebuilding the *web* app — incompatible with "keep web + 1 week."
- The PWA is already very native-feeling (iOS glass, safe-area insets, swipe nav,
  springy tab dock); Capacitor + a few native touches crosses it into "feels like an
  app."
- Monetization (App Store subscriptions/IAP via RevenueCat) plugs into Capacitor.

### How it loads
Next.js App Router (server components, API routes, `proxy.ts` middleware) does **not**
static-export cleanly, so Capacitor points the webview at the **deployed Vercel URL**
via `server.url` rather than bundling a static build. Online-only being acceptable is
what makes this fine.

### Key caveats (accept + mitigate)
1. **Webview, not native rendering.** No-signal = blank screen (acceptable for now).
2. **App Store review, guideline 4.2 (minimum functionality).** Thin webviews can be
   rejected. **Mitigation: the Apple Health integration is the genuine native value
   that makes it a real app.** This is *why* HealthKit is phase 2, not optional.
3. **Auth.** The password gate (`lifeos_auth` httpOnly cookie) + Supabase session
   cookies are set on the Vercel origin; the Capacitor webview runs as that origin, so
   the existing login flow should work unchanged. Verify early.
4. **Remote-URL dependence.** If review pushes back, the fallback is to bundle a thin
   native shell and/or render a few key screens natively later — not for v1.

## Native-detection pattern (progressive enhancement)

Add `lib/native.ts` exposing `isNative()` (checks `Capacitor.isNativePlatform()`),
so native calls (haptics, HealthKit, status bar) are **no-ops on web**. The same code
runs in the browser and the app; native features light up only inside Capacitor. No
forking of components.

---

## Phase 1 — Capacitor scaffold + native shell polish  (Day 1–2)

- Deps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, plus
  `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/haptics`,
  `@capacitor/app`.
- `capacitor.config.ts`: appId (e.g. `com.alonso.lifeos`), appName `LifeOS`,
  `server.url` = Vercel URL, `ios.contentInset`, background color matching `--bg`.
- `npx cap add ios` → generates the `ios/` Xcode project. Run on simulator + device.
- Reuse existing icon/splash assets (`app/icon.png`, `app/apple-icon.png`,
  `public/lifeos-icon.svg`); generate iOS icon set + splash.
- `lib/native.ts` helper; wire:
  - **Status bar** style synced to the theme toggle (dark/light) via `@capacitor/status-bar`.
  - **Haptics** on tab switches and primary buttons (TabBar, key actions) — guarded by `isNative()`.
  - **Splash screen** hide on first paint.
- **Files:** `capacitor.config.ts` (new), `lib/native.ts` (new), small edits to
  `components/TabBar.tsx` / `ThemeToggle.tsx` for haptics + status bar, `package.json`,
  `.gitignore` (ignore `ios/App/Pods`, build artifacts), `ios/` (generated).
- **Do not change** the web build or scripts (`.bin/next` workaround stays).

## Phase 2 — Apple Health connector  (Day 3–5) — the review-passer

- **Plugin:** evaluate a maintained Capacitor HealthKit plugin
  (`@perfood/capacitor-healthkit` or `capacitor-health`); pick by maintenance + sample
  coverage (HR, HRV/SDNN, sleep analysis, workouts, steps, active energy).
- iOS entitlement + `NSHealthShareUsageDescription` privacy strings in the Xcode
  project; request read permissions on first connect.
- **Schema:** new migration `supabase/migrations/<ts>_apple_health.sql` —
  `apple_health_samples` (type, value, unit, start/end, source) and/or a
  `apple_health_daily` rollup; owner-scoped RLS mirroring `20260516000001_rls_owner_scoped.sql`.
  Note overlap with WHOOP (HR/HRV/sleep/workouts) — treat Apple Health as a parallel
  source, not a replacement; tag by `source`.
- **Sync route:** `app/api/health-sync/route.ts` — accepts a batch of samples read on
  device, upserts via service role (mirrors the whoop-sync write pattern). De-dupe by a
  stable external id.
- **UI:** a "Health" connect/sync control (reuse the Whoop tab's connect/sync controls
  pattern), and surface a few Apple Health metrics on Today/Whoop. Read happens in the
  webview via the plugin → POST to the sync route.
- **Files:** new migration, `app/api/health-sync/route.ts`, `lib/health/` (read +
  normalize), a connector UI component, `lib/types.ts` additions.

## Phase 3 — Strava connector  (week 2)

- OAuth2 (works in any path). Generalize toward the connector framework from the broader
  roadmap, or a focused Strava adapter first: `app/callback`-style OAuth, token storage
  (a `connector_tokens` table or per-source like `whoop_tokens`), an Edge Function or API
  route to poll activities → upsert. Surface activities alongside Whoop/Health.

## Phase 4 — AI chatbot  (deferred / rough)

- In-app assistant over the **existing MCP tools** (`lib/mcp/*`) via the Vercel AI SDK,
  streaming + tool-calling. Path-independent — revisit after the app ships. Out of scope
  for the 1-week target.

## Monetization (when ready)

- App Store subscriptions/IAP via **RevenueCat** (Capacitor plugin). Gate premium
  features (e.g. connectors, AI, history depth). Keep the web app's password gate as-is;
  add entitlement checks where needed.

---

## 1-week timeline

| Day | Deliverable |
|---|---|
| 1–2 | Capacitor scaffold, iOS project running on device, native shell polish (icon/splash/status bar/haptics) |
| 3–5 | Apple Health connector: permissions, read, `apple_health_*` schema + sync route, basic UI |
| 6   | TestFlight build, signing, internal testing |
| 7   | Buffer / submit. Strava + AI → week 2 |

## Prerequisites (user)

- **Apple Developer account** ($99/yr) — required for device builds, HealthKit
  entitlement, TestFlight.
- **Xcode** installed (macOS — already on `darwin`).
- App Store Connect app record (bundle id `com.alonso.lifeos`).
- Confirm the **production Vercel URL** to point `server.url` at.

## Open decisions to resolve at kickoff

1. **Bundle id / app name / team** for signing.
2. **HealthKit plugin** choice (after a quick maintenance check) and **which metrics**
   to read first (recommend HRV, resting HR, sleep, workouts, steps, active energy).
3. **Apple Health vs WHOOP** presentation — parallel sources, or prefer one when both
   exist? (Lean: show both, tag by source.)
4. **`server.url` remote-load vs partial bundling** — start remote; revisit only if
   review pushes back.

## Verification

- iOS app launches on a real device, loads the live app, login works (cookies persist).
- Theme toggle drives the native status bar; haptics fire on tab switches (device only);
  web build unchanged (`npm run build` clean, no haptics/status-bar calls on web).
- HealthKit: permission prompt appears; reading a day of samples lands rows in
  `apple_health_*` via `/api/health-sync`; metrics render in-app.
- TestFlight build installs and runs for an internal tester.

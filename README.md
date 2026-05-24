# LifeOS

A personal operating system for a hybrid athlete. Built to replace a fragmented Notion/spreadsheet setup with a single, fast, mobile-first cockpit.

**Live:** [lifeos-zeta-three.vercel.app](https://lifeos-zeta-three.vercel.app)

---

## The Problem

Training, nutrition, recovery data, and daily tasks lived in four different places. Context-switching killed focus. I wanted one glanceable view that answered: *am I recovered? what's the plan today? am I on track?*

## What It Does

Five tabs, each with a single job:

| Tab | Job |
|---|---|
| **Today** | Recovery snapshot from WHOOP, daily goal progress, day ring |
| **Focus** | Todo list with inline edit, manual reorder, and AI-assisted task refinement (Claude Haiku) |
| **Workout** | Training plan from DB, set logging, progressive overload suggestions |
| **Nutrition** | Day-type nutrition plan (hard/moderate/rest), meal logging |
| **Whoop** | Raw WHOOP data — HRV, strain, sleep stages, historical sparklines |

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Supabase** — Postgres, RLS, realtime subscriptions, Edge Functions (Deno)
- **Tailwind CSS v4** — mobile-first, dark, no gradients
- **WHOOP API** — OAuth2, hourly sync via pg_cron + Edge Function
- **Anthropic SDK** — Claude Haiku for the Focus tab "Polish & Add" feature

## Local Dev

```bash
cp .env.local.example .env.local   # fill in values
npm install
npm run dev                         # http://localhost:3000
```

See `.env.local.example` for required variables (Supabase, WHOOP OAuth, Anthropic API key, app password).

## Auth

Two-layer: a password gate (HMAC-signed `httpOnly` cookie) + a Supabase session established server-side at login. All routes protected via Next.js middleware (`proxy.ts`).

## WHOOP Sync Pipeline

```
OAuth connect → /api/whoop-callback → tokens in whoop_tokens
"sync now" → /api/whoop-sync → Edge Function → whoop_snapshots + whoop_workouts
Hourly cron (pg_cron) → same Edge Function
```

## Project Structure

```
app/          API routes, page layouts, tab pages
components/   Shell, TabBar, per-tab components, shared UI (Ring, Sparkline, StatCard)
lib/          Supabase clients, session helpers, workout constants, nutrition types
supabase/     Migrations + Deno Edge Functions (whoop-auth, whoop-sync)
proxy.ts      Next.js middleware — password gate + Supabase JWT refresh
```

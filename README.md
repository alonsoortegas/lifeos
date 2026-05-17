# LifeOS Dashboard

Personal life OS for a hybrid athlete / indie developer. Five-tab mobile-first PWA built on Next.js 16, Supabase, and Tailwind CSS v4.

---

## Local dev

```bash
cp .env.local.example .env.local   # fill in values (see below)
npm install
npm run dev                         # http://localhost:3000
```

Other commands:

```bash
npm run build   # production build
npm run start   # serve production build
npm run lint    # ESLint
npm test        # Vitest unit tests
```

> The `.bin/next` symlink is broken in this environment. Scripts invoke `node node_modules/next/dist/bin/next` directly — do not change this.

---

## Required environment variables

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — server only, never browser |
| `SUPABASE_OWNER_EMAIL` | Email of the single Supabase Auth owner account |
| `SUPABASE_OWNER_PASSWORD` | Password for the owner account — server only |
| `APP_PASSWORD` | Password gate for the whole app. Also used as HMAC signing key for session tokens — keep it long and random |
| `ANTHROPIC_API_KEY` | Claude Haiku for the Focus tab "Polish & Add" feature |
| `WHOOP_CLIENT_ID` | WHOOP developer app client ID |
| `WHOOP_CLIENT_SECRET` | WHOOP developer app secret |

The app starts without most of these (graceful fallback), but the Focus tab won't persist, Polish & Add echoes input as-is, and the WHOOP pipeline won't function. Missing `SUPABASE_OWNER_*` means RLS blocks all queries.

---

## Auth / session

Two-layer auth:

1. **Password gate** — `POST /api/auth` validates `APP_PASSWORD`. On success it issues an HMAC-SHA256 signed session token (using `APP_PASSWORD` as the signing key) stored in an `httpOnly`, `sameSite=strict` cookie (`lifeos_auth`, 90-day TTL). The raw password is **never** stored in the cookie.

2. **Supabase session** — on the same login request the server signs in to Supabase with `SUPABASE_OWNER_EMAIL`/`SUPABASE_OWNER_PASSWORD` and writes the session cookies into the response. The browser Supabase client picks these up, so all subsequent queries run as `authenticated` and satisfy RLS.

`proxy.ts` (Next.js 16 middleware) verifies the session token and refreshes the Supabase JWT on every request. If the refresh token has expired (7-day TTL) it silently re-signs-in with the owner credentials.

---

## Supabase migration workflow

Migrations live in `supabase/migrations/` and are applied in filename order.

```bash
supabase db push           # push migrations to linked project
supabase migration new name # scaffold a new migration
```

### Owner UID — automatic registration

`app/api/auth/route.ts` automatically upserts the Supabase owner UID into `app_config` via the service role client on every successful login. No manual SQL is needed under normal operation.

RLS is **fail-closed**: until `owner_uid` is registered, `is_owner()` returns `false` and all data access is blocked. The first successful login seeds the value and immediately unlocks the app.

**Production-only deploys** (where you push migrations before anyone logs in): seed the UID manually via the Supabase dashboard SQL editor using the service role:

```sql
INSERT INTO public.app_config (key, value)
VALUES ('owner_uid', '<your-supabase-auth-user-uuid>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

## WHOOP OAuth setup

WHOOP uses OAuth2 authorization code flow. Tokens are stored in `whoop_tokens` (service_role only).

### Registered redirect URIs (must be whitelisted in WHOOP developer dashboard)

```
http://localhost:3000/api/whoop-callback
https://lifeos-zeta-three.vercel.app/api/whoop-callback
```

Set `NEXT_PUBLIC_WHOOP_REDIRECT_URI` to the exact URI you are using from the list above. If it is unset, the app falls back to `${window.location.origin}/api/whoop-callback`; that fallback only works when the current origin is already registered in WHOOP.

### Connect flow

```
"connect whoop" button
  → whoopAuthUrl() builds auth URL with redirect_uri=/api/whoop-callback
  → WHOOP OAuth consent screen
  → GET /api/whoop-callback?code=...
  → token exchange via lib/whoop-oauth.ts
  → tokens stored in whoop_tokens
```

`/callback` is kept for backwards compatibility only. The registered WHOOP callback is `/api/whoop-callback`.

### Sync

```bash
# Trigger a manual sync from the Whoop tab UI, or:
curl -X POST http://localhost:3000/api/whoop-sync
```

The Edge Function `supabase/functions/whoop-sync` handles the actual WHOOP API calls.

### Deploy Edge Functions

```bash
supabase functions deploy whoop-sync
supabase functions deploy whoop-auth
supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=...
```

---

## Project structure (quick reference)

```
app/
  api/auth/route.ts        POST login — validates password, issues signed session token
  api/whoop-*/route.ts     WHOOP API relay routes
  callback/route.ts        Canonical WHOOP OAuth callback (canonical redirect_uri)
  login/page.tsx           Password login page
lib/
  session.ts               HMAC-SHA256 session token helpers (create / verify)
  whoop-oauth.ts           Shared WHOOP token exchange + persistence logic
  supabase.ts / -server.ts Browser and server Supabase clients
proxy.ts                   Next.js 16 middleware — password gate + Supabase session refresh
supabase/migrations/       Applied in filename order
supabase/functions/        Deno Edge Functions (whoop-auth, whoop-sync)
__tests__/                 Vitest unit tests
```

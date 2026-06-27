# LifeOS Portable Data Model — Spec

**Status:** v0.1 (draft) · **Scope so far:** Finances

This document is the OSS, versioned contract for the LifeOS data model. The goal
(per the cockpit plan) is a portable schema that can live in the device's local
SQLite DB, sync to Supabase Postgres, and be exported as a file to iCloud / Google
Drive — and that a future iOS app can read directly.

The schema is rolled out module-by-module. Today it documents the **Finances**
tables; existing modules (recovery, workout, nutrition, todos) will be folded in
as they migrate onto the local-first layer (see *Roadmap*).

Semver applies to this document: additive columns are minor; renames/removals are
major.

## Conventions

- All ids are integers (`bigserial` in Postgres / `INTEGER PRIMARY KEY` in SQLite).
- Timestamps are ISO-8601 UTC strings (`timestamptz`).
- Money is stored as plain numerics in the instrument/account currency; no implicit
  base-currency conversion is persisted.
- Single-user: every table is owner-scoped via `is_owner()` RLS in Postgres. In the
  exported file there is exactly one owner, so no `user_id` column exists.

## Finances (v0.1)

| Table | Purpose | Key columns |
|---|---|---|
| `fin_accounts` | Broker/bank/wallet/manual accounts | `name`, `kind ∈ {broker,bank,wallet,manual}`, `currency` |
| `fin_instruments` | Securities & coins | `symbol`, `isin?`, `name?`, `asset_class ∈ {etf,stock,crypto}`, `currency`; unique `(symbol, asset_class)` |
| `fin_holdings` | Current positions | `account_id→fin_accounts`, `instrument_id→fin_instruments`, `quantity`, `avg_cost?`; unique `(account_id, instrument_id)` |
| `fin_transactions` | Buys/sells/dividends/transfers | `type`, `quantity?`, `price?`, `fee`, `amount?`, `traded_at`, `source`, `external_id?` (idempotent imports); unique `(source, external_id)` |
| `fin_prices` | Latest + historical close per instrument | `instrument_id→fin_instruments`, `price`, `currency`, `as_of`, `source`; unique `(instrument_id, as_of)` |

Canonical DDL lives in `supabase/migrations/20260626000000_finances.sql`.

### Derived values (not stored)

Valuation is computed, never persisted, by `lib/finance.ts`:
- `marketValue = price × quantity`
- `unrealizedPL = marketValue − (avg_cost × quantity)`
- `dayChange = (price − prevPrice) × quantity` (prevPrice = second-newest `fin_prices` row)
- allocation = per-`asset_class` share of total market value

## Roadmap

1. **Now:** Finances tables (above) + price-sync.
2. **Next:** local-first layer (PowerSync: device SQLite ⇄ Supabase) — finances are
   the pilot module; this spec becomes the shared schema for web + iOS.
3. **Later:** migrate `todos`, `daily_checkins`, nutrition, workout, and whoop tables
   into this spec; add the iCloud/Drive export of the SQLite file + a JSON dump.

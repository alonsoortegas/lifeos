-- Finances section — investments (ETF / stocks / crypto).
--
-- Single-user app: all tables are owner-scoped via is_owner() (see
-- 20260516000001_rls_owner_scoped.sql). fin_prices is refreshed by the
-- price-sync Edge Function via service_role (which bypasses RLS), so it only
-- needs an owner SELECT policy.

-- ── fin_accounts ────────────────────────────────────────────────────────────
create table if not exists public.fin_accounts (
  id         bigserial primary key,
  name       text not null,
  kind       text not null default 'manual' check (kind in ('broker','bank','wallet','manual')),
  currency   text not null default 'EUR',
  created_at timestamptz not null default now()
);

-- ── fin_instruments ─────────────────────────────────────────────────────────
create table if not exists public.fin_instruments (
  id          bigserial primary key,
  symbol      text not null,
  isin        text,
  name        text,
  asset_class text not null check (asset_class in ('etf','stock','crypto')),
  currency    text not null default 'EUR',
  created_at  timestamptz not null default now(),
  unique (symbol, asset_class)
);

-- ── fin_holdings ────────────────────────────────────────────────────────────
create table if not exists public.fin_holdings (
  id            bigserial primary key,
  account_id    bigint not null references public.fin_accounts(id) on delete cascade,
  instrument_id bigint not null references public.fin_instruments(id) on delete cascade,
  quantity      numeric not null default 0,
  avg_cost      numeric,
  updated_at    timestamptz not null default now(),
  unique (account_id, instrument_id)
);

-- ── fin_transactions ────────────────────────────────────────────────────────
create table if not exists public.fin_transactions (
  id              bigserial primary key,
  account_id      bigint references public.fin_accounts(id) on delete set null,
  instrument_id   bigint references public.fin_instruments(id) on delete set null,
  type            text not null check (type in ('buy','sell','dividend','deposit','withdrawal','fee','transfer')),
  quantity        numeric,
  price           numeric,
  fee             numeric not null default 0,
  amount          numeric,
  currency        text not null default 'EUR',
  traded_at       timestamptz not null default now(),
  source          text not null default 'manual',
  import_batch_id text,
  external_id     text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists fin_transactions_traded_at_idx on public.fin_transactions (traded_at desc);
-- Idempotent imports: a (source, external_id) pair may only appear once.
create unique index if not exists fin_transactions_source_external_idx
  on public.fin_transactions (source, external_id)
  where external_id is not null;

-- ── fin_prices ──────────────────────────────────────────────────────────────
create table if not exists public.fin_prices (
  id            bigserial primary key,
  instrument_id bigint not null references public.fin_instruments(id) on delete cascade,
  price         numeric not null,
  currency      text not null default 'EUR',
  as_of         timestamptz not null default now(),
  source        text,
  unique (instrument_id, as_of)
);
create index if not exists fin_prices_instrument_as_of_idx on public.fin_prices (instrument_id, as_of desc);

-- ── RLS (owner-scoped) ──────────────────────────────────────────────────────
alter table public.fin_accounts     enable row level security;
alter table public.fin_instruments  enable row level security;
alter table public.fin_holdings     enable row level security;
alter table public.fin_transactions enable row level security;
alter table public.fin_prices       enable row level security;

-- Full CRUD for the owner on the editable tables.
do $$
declare t text;
begin
  foreach t in array array['fin_accounts','fin_instruments','fin_holdings','fin_transactions']
  loop
    execute format('drop policy if exists "owner_select_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "owner_insert_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "owner_update_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "owner_delete_%1$s" on public.%1$s', t);
    execute format('create policy "owner_select_%1$s" on public.%1$s for select to authenticated using (is_owner())', t);
    execute format('create policy "owner_insert_%1$s" on public.%1$s for insert to authenticated with check (is_owner())', t);
    execute format('create policy "owner_update_%1$s" on public.%1$s for update to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('create policy "owner_delete_%1$s" on public.%1$s for delete to authenticated using (is_owner())', t);
  end loop;
end $$;

-- Prices: owner reads; writes happen via service_role (price-sync) only.
drop policy if exists "owner_select_fin_prices" on public.fin_prices;
create policy "owner_select_fin_prices" on public.fin_prices
  for select to authenticated using (is_owner());

grant select, insert, update, delete on
  public.fin_accounts, public.fin_instruments, public.fin_holdings, public.fin_transactions
  to authenticated;
grant select on public.fin_prices to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Cash & fixed-rate savings — balances held but not market-invested.
--
-- Counts toward net worth but is kept out of the instrument/price machinery:
-- value is either flat (cash) or accrues analytically from a fixed rate
-- (e.g. Revolut paying 2% p.a.). Owner-scoped RLS like the other fin_* tables.

create table if not exists public.fin_cash (
  id          bigserial primary key,
  account_id  bigint not null references public.fin_accounts(id) on delete cascade,
  kind        text not null default 'cash' check (kind in ('cash','fixed')),
  label       text,
  amount      numeric not null default 0,   -- principal / balance, stored in base currency
  currency    text not null default 'EUR',
  apy         numeric not null default 0,   -- annual rate, 0.02 = 2% p.a. (fixed only)
  started_at  date not null default current_date, -- accrual anchor for 'fixed'
  updated_at  timestamptz not null default now()
);

alter table public.fin_cash enable row level security;

drop policy if exists "owner_select_fin_cash" on public.fin_cash;
drop policy if exists "owner_insert_fin_cash" on public.fin_cash;
drop policy if exists "owner_update_fin_cash" on public.fin_cash;
drop policy if exists "owner_delete_fin_cash" on public.fin_cash;
create policy "owner_select_fin_cash" on public.fin_cash for select to authenticated using (is_owner());
create policy "owner_insert_fin_cash" on public.fin_cash for insert to authenticated with check (is_owner());
create policy "owner_update_fin_cash" on public.fin_cash for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner_delete_fin_cash" on public.fin_cash for delete to authenticated using (is_owner());

grant select, insert, update, delete on public.fin_cash to authenticated;
grant usage on all sequences in schema public to authenticated;

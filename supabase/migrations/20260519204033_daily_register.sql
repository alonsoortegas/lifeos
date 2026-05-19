create table public.daily_register (
  id bigint primary key generated always as identity,
  log_date date not null unique,
  sleep_hours numeric(3,1) not null,
  previous_day_steps int not null,
  previous_day_calories int not null,
  on_period boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_register_sleep_hours_half_step
    check (sleep_hours >= 0 and sleep_hours <= 24 and sleep_hours * 2 = trunc(sleep_hours * 2)),
  constraint daily_register_previous_day_steps_nonnegative
    check (previous_day_steps >= 0),
  constraint daily_register_previous_day_calories_nonnegative
    check (previous_day_calories >= 0)
);

create index daily_register_log_date_idx on public.daily_register (log_date desc);

alter table public.daily_register enable row level security;

grant select, insert, update on public.daily_register to authenticated;
grant usage, select on sequence public.daily_register_id_seq to authenticated;

create policy "owner_select_daily_register" on public.daily_register
  for select to authenticated using (is_owner());
create policy "owner_insert_daily_register" on public.daily_register
  for insert to authenticated with check (is_owner());
create policy "owner_update_daily_register" on public.daily_register
  for update to authenticated using (is_owner()) with check (is_owner());

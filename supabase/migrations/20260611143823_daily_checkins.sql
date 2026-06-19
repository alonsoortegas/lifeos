create table public.daily_checkins (
  id bigint generated always as identity primary key,
  check_date date not null unique,
  soreness int check (soreness between 1 and 5),
  motivation int check (motivation between 1 and 5),
  energy int check (energy between 1 and 5),
  mood int check (mood between 1 and 5),
  symptoms text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger daily_checkins_updated_at before update on public.daily_checkins for each row execute function set_updated_at();
alter table public.daily_checkins enable row level security;
grant select, insert, update on public.daily_checkins to authenticated;
grant usage, select on sequence public.daily_checkins_id_seq to authenticated;
create policy "owner_select_daily_checkins" on public.daily_checkins for select to authenticated using (is_owner());
create policy "owner_insert_daily_checkins" on public.daily_checkins for insert to authenticated with check (is_owner());
create policy "owner_update_daily_checkins" on public.daily_checkins for update to authenticated using (is_owner()) with check (is_owner());;

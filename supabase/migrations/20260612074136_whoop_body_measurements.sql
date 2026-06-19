create table public.whoop_body_measurements (
  id              bigint generated always as identity primary key,
  measured_on     date not null unique,
  weight_kg       numeric(5,2),
  height_m        numeric(4,3),
  max_heart_rate  int,
  created_at      timestamptz not null default now()
);

create index whoop_body_measurements_date_idx
  on public.whoop_body_measurements (measured_on desc);

alter table public.whoop_body_measurements enable row level security;

grant select on public.whoop_body_measurements to authenticated;

create policy "owner_select_whoop_body_measurements" on public.whoop_body_measurements
  for select to authenticated using (is_owner());;

-- Add missing daily metrics to whoop_snapshots
alter table whoop_snapshots
  add column if not exists sleep_consistency_pct numeric(5,2),
  add column if not exists respiratory_rate       numeric(5,2),
  add column if not exists kilojoule              numeric(8,2);

-- Per-workout data from Whoop /v2/activity/workout
create table whoop_workouts (
  id          bigint primary key generated always as identity,
  workout_id  bigint unique not null,
  cycle_id    bigint,
  started_at  timestamptz not null,
  sport_name  text,
  strain      numeric(5,2),
  avg_hr      int,
  max_hr      int,
  zone0_min   numeric(7,2),
  zone1_min   numeric(7,2),
  zone2_min   numeric(7,2),
  zone3_min   numeric(7,2),
  zone4_min   numeric(7,2),
  zone5_min   numeric(7,2),
  raw_json    jsonb,
  created_at  timestamptz default now()
);

create index whoop_workouts_started_idx on whoop_workouts (started_at desc);

alter table whoop_workouts enable row level security;
create policy "anon_read_workouts" on whoop_workouts for select using (true);

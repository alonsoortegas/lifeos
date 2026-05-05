-- whoop_snapshots: one row per recovery cycle from Whoop API
create table whoop_snapshots (
  id                bigint primary key generated always as identity,
  cycle_id          bigint unique not null,
  recorded_at       timestamptz not null,
  recovery_score    int,
  rhr               int,
  hrv_rmssd         numeric(8,3),
  strain            numeric(6,2),
  sleep_score       int,
  sleep_duration_ms bigint,
  sleep_deep_pct    numeric(5,2),
  sleep_rem_pct     numeric(5,2),
  sleep_light_pct   numeric(5,2),
  sleep_awake_pct   numeric(5,2),
  raw_json          jsonb,
  created_at        timestamptz default now()
);

-- workout_logs: individual set logs
create table workout_logs (
  id            bigint primary key generated always as identity,
  logged_at     timestamptz default now(),
  exercise_name text not null,
  set_number    int,
  weight_lbs    numeric(6,1),
  reps          int,
  rpe           numeric(3,1),
  notes         text
);

-- nutrition_logs: quick-log food entries
create table nutrition_logs (
  id            bigint primary key generated always as identity,
  logged_at     timestamptz default now(),
  food_name     text not null,
  protein_g     numeric(6,1),
  carbs_g       numeric(6,1),
  fat_g         numeric(6,1),
  calories      int,
  day_type      text check (day_type in ('Hard', 'Moderate', 'Rest'))
);

-- todos: daily goals, reset at 6 AM
create table todos (
  id            bigint primary key generated always as identity,
  text          text not null,
  done          boolean default false,
  created_at    timestamptz default now(),
  day_date      date not null default current_date
);

-- Index for fetching today's todos efficiently
create index todos_day_date_idx on todos (day_date);

-- Index for whoop lookups by date
create index whoop_snapshots_recorded_at_idx on whoop_snapshots (recorded_at desc);

-- Enable Row Level Security (open for now — lock down with auth later)
alter table whoop_snapshots enable row level security;
alter table workout_logs enable row level security;
alter table nutrition_logs enable row level security;
alter table todos enable row level security;

-- Permissive policies for anon key during development
create policy "anon_all_whoop" on whoop_snapshots for all using (true) with check (true);
create policy "anon_all_workout" on workout_logs for all using (true) with check (true);
create policy "anon_all_nutrition" on nutrition_logs for all using (true) with check (true);
create policy "anon_all_todos" on todos for all using (true) with check (true);

create table public.whoop_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'whoop',
  status text not null default 'running'
    check (status in ('running', 'success', 'error', 'skipped')),
  requested_days int,
  requested_backfill boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  recovery_records_fetched int not null default 0,
  sleep_records_fetched int not null default 0,
  cycle_records_fetched int not null default 0,
  workout_records_fetched int not null default 0,
  snapshots_written int not null default 0,
  snapshot_failures int not null default 0,
  workouts_written int not null default 0,
  body_measurement_synced boolean not null default false,
  latest_recovery_at timestamptz,
  latest_snapshot_recorded_at timestamptz,
  recovery_score int,
  error_code text,
  error_message text,
  first_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index whoop_sync_runs_started_idx
  on public.whoop_sync_runs (started_at desc);

create index whoop_sync_runs_status_started_idx
  on public.whoop_sync_runs (status, started_at desc);

alter table public.whoop_sync_runs enable row level security;

revoke all on table public.whoop_sync_runs from anon, authenticated;
grant select, insert, update on table public.whoop_sync_runs to service_role;

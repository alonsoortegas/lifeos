create table if not exists public.whoop_sync_locks (
  id           text primary key,
  locked_until timestamptz not null,
  lock_token   text,
  updated_at   timestamptz not null default now()
);

alter table public.whoop_sync_locks enable row level security;

revoke all on table public.whoop_sync_locks from anon, authenticated;
grant select, insert, update on table public.whoop_sync_locks to service_role;

insert into public.whoop_sync_locks (id, locked_until)
values ('whoop-sync', 'epoch'::timestamptz)
on conflict (id) do nothing;

select cron.unschedule('whoop-sync-daily-backfill');

select cron.schedule(
  'whoop-sync-daily-backfill',
  '15 9 * * *',
  $$
  select net.http_post(
    url    := 'https://xmvvfamtrungmiqveitk.supabase.co/functions/v1/whoop-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdnZmYW10cnVuZ21pcXZlaXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Njc3ODgsImV4cCI6MjA5MzU0Mzc4OH0.dnd5xupjL5xNtcUG1hcb-Crws6xoW4tcNQv6_e6oox4',
      'Content-Type', 'application/json'
    ),
    body   := '{"backfill": true}'::jsonb
  );
  $$
);

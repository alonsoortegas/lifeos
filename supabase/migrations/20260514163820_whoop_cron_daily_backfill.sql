-- Daily 9 AM cron: checks the last 14 days for missing snapshots and backfills gaps.
select cron.schedule(
  'whoop-sync-daily-backfill',
  '0 9 * * *',
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
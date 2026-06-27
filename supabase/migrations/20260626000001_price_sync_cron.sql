-- Schedule the price-sync Edge Function once a day (08:00 UTC), after markets
-- have settled. Mirrors the whoop-sync cron wiring (net.http_post via pg_cron).
-- Deploy the function first: `supabase functions deploy price-sync`.
select cron.schedule(
  'price-sync-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url    := 'https://xmvvfamtrungmiqveitk.supabase.co/functions/v1/price-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdnZmYW10cnVuZ21pcXZlaXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5Njc3ODgsImV4cCI6MjA5MzU0Mzc4OH0.dnd5xupjL5xNtcUG1hcb-Crws6xoW4tcNQv6_e6oox4',
      'Content-Type', 'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);

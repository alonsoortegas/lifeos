-- 17 public tables (todos, nutrition_*, meal_*, food_*, workout_*) were missing
-- table-level grants for service_role — every server-side admin client
-- (MCP tools, cron, brief generation) got "42501 permission denied" on them,
-- which supabase-js callers silently swallowed as empty results.
-- Supabase's default posture gives service_role full access (it bypasses RLS
-- by design); restore it and make it stick for future tables.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

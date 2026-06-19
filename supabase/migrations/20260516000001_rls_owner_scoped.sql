-- Scope RLS policies to the registered owner UID instead of any authenticated user.
--
-- Strategy: single-user app with no per-row user_id columns. We store the owner's
-- auth.uid() in a lightweight app_config table and check it via is_owner().
--
-- is_owner() is FAIL-CLOSED: if owner_uid is not registered it returns false,
-- blocking all data access. owner_uid is auto-registered by app/api/auth/route.ts
-- on first successful login (via service role). No manual SQL step is needed under
-- normal operation; the README covers the manual fallback for production-only deploys.
--
-- If you are deploying directly to production without a test login, seed owner_uid
-- IMMEDIATELY after pushing this migration using the Supabase dashboard SQL editor
-- (run as service_role):
--   INSERT INTO public.app_config (key, value)
--   VALUES ('owner_uid', '<your-supabase-auth-user-id>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── app_config ─────────────────────────────────────────────────────────────
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
-- No RLS policies: only accessible via service_role or the is_owner() definer function.
revoke all on public.app_config from anon, authenticated;
-- ── is_owner() helper ──────────────────────────────────────────────────────
create or replace function public.is_owner() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  -- Fail-closed: returns false if no owner_uid is registered.
  -- owner_uid is written by the auth API route on first login via service role.
  select auth.uid()::text = (select value from app_config where key = 'owner_uid')
$$;
-- ── todos ──────────────────────────────────────────────────────────────────
drop policy if exists "owner_select_todos" on public.todos;
drop policy if exists "owner_insert_todos" on public.todos;
drop policy if exists "owner_update_todos" on public.todos;
drop policy if exists "owner_delete_todos"  on public.todos;
create policy "owner_select_todos" on public.todos
  for select to authenticated using (is_owner());
create policy "owner_insert_todos" on public.todos
  for insert to authenticated with check (is_owner());
create policy "owner_update_todos" on public.todos
  for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner_delete_todos" on public.todos
  for delete to authenticated using (is_owner());
-- ── whoop_snapshots ────────────────────────────────────────────────────────
drop policy if exists "owner_select_whoop_snapshots" on public.whoop_snapshots;
create policy "owner_select_whoop_snapshots" on public.whoop_snapshots
  for select to authenticated using (is_owner());
-- ── whoop_workouts ─────────────────────────────────────────────────────────
drop policy if exists "owner_select_whoop_workouts" on public.whoop_workouts;
create policy "owner_select_whoop_workouts" on public.whoop_workouts
  for select to authenticated using (is_owner());
-- ── workout_sessions ───────────────────────────────────────────────────────
drop policy if exists "owner_select_workout_sessions" on public.workout_sessions;
create policy "owner_select_workout_sessions" on public.workout_sessions
  for select to authenticated using (is_owner());
-- ── workout_exercises ──────────────────────────────────────────────────────
drop policy if exists "owner_select_workout_exercises" on public.workout_exercises;
drop policy if exists "owner_insert_workout_exercises" on public.workout_exercises;
create policy "owner_select_workout_exercises" on public.workout_exercises
  for select to authenticated using (is_owner());
create policy "owner_insert_workout_exercises" on public.workout_exercises
  for insert to authenticated
  with check (is_owner() and session_id is not null and length(trim(exercise_name)) > 0);
-- ── workout_logs ───────────────────────────────────────────────────────────
drop policy if exists "owner_select_workout_logs" on public.workout_logs;
drop policy if exists "owner_insert_workout_logs" on public.workout_logs;
create policy "owner_select_workout_logs" on public.workout_logs
  for select to authenticated using (is_owner());
create policy "owner_insert_workout_logs" on public.workout_logs
  for insert to authenticated with check (is_owner());
-- ── nutrition_day ──────────────────────────────────────────────────────────
drop policy if exists "owner_select_nutrition_day" on public.nutrition_day;
drop policy if exists "owner_insert_nutrition_day" on public.nutrition_day;
drop policy if exists "owner_update_nutrition_day" on public.nutrition_day;
create policy "owner_select_nutrition_day" on public.nutrition_day
  for select to authenticated using (is_owner());
create policy "owner_insert_nutrition_day" on public.nutrition_day
  for insert to authenticated with check (is_owner());
create policy "owner_update_nutrition_day" on public.nutrition_day
  for update to authenticated using (is_owner()) with check (is_owner());
-- ── meal_log ───────────────────────────────────────────────────────────────
drop policy if exists "owner_select_meal_log" on public.meal_log;
drop policy if exists "owner_insert_meal_log" on public.meal_log;
create policy "owner_select_meal_log" on public.meal_log
  for select to authenticated using (is_owner());
create policy "owner_insert_meal_log" on public.meal_log
  for insert to authenticated with check (is_owner());
-- ── meal_log_item ──────────────────────────────────────────────────────────
drop policy if exists "owner_select_meal_log_item" on public.meal_log_item;
drop policy if exists "owner_insert_meal_log_item" on public.meal_log_item;
drop policy if exists "owner_delete_meal_log_item" on public.meal_log_item;
create policy "owner_select_meal_log_item" on public.meal_log_item
  for select to authenticated using (is_owner());
create policy "owner_insert_meal_log_item" on public.meal_log_item
  for insert to authenticated with check (is_owner());
create policy "owner_delete_meal_log_item" on public.meal_log_item
  for delete to authenticated using (is_owner());
-- ── nutrition reference tables (read-only plan data) ───────────────────────
drop policy if exists "owner_select_nutrition_day_types"        on public.nutrition_day_types;
drop policy if exists "owner_select_nutrition_food_portions"    on public.nutrition_food_portions;
drop policy if exists "owner_select_nutrition_meal_templates"   on public.nutrition_meal_templates;
drop policy if exists "owner_select_nutrition_rules"            on public.nutrition_rules;
drop policy if exists "owner_select_nutrition_equivalence_groups" on public.nutrition_equivalence_groups;
drop policy if exists "owner_select_food_item"                  on public.food_item;
drop policy if exists "owner_select_food_substitution_group"    on public.food_substitution_group;
drop policy if exists "owner_select_food_substitution_group_item" on public.food_substitution_group_item;
create policy "owner_select_nutrition_day_types" on public.nutrition_day_types
  for select to authenticated using (is_owner());
create policy "owner_select_nutrition_food_portions" on public.nutrition_food_portions
  for select to authenticated using (is_owner());
create policy "owner_select_nutrition_meal_templates" on public.nutrition_meal_templates
  for select to authenticated using (is_owner());
create policy "owner_select_nutrition_rules" on public.nutrition_rules
  for select to authenticated using (is_owner());
create policy "owner_select_nutrition_equivalence_groups" on public.nutrition_equivalence_groups
  for select to authenticated using (is_owner());
create policy "owner_select_food_item" on public.food_item
  for select to authenticated using (is_owner());
create policy "owner_select_food_substitution_group" on public.food_substitution_group
  for select to authenticated using (is_owner());
create policy "owner_select_food_substitution_group_item" on public.food_substitution_group_item
  for select to authenticated using (is_owner());
-- ── whoop_tokens: service_role only — no change ───────────────────────────;

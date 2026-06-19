-- Replace all open `using (true)` policies with authenticated-only access.
-- The app signs into Supabase Auth as part of the password-gate flow, so any
-- session that reaches these tables already belongs to the owner account.

grant select on table
  public.todos,
  public.whoop_snapshots,
  public.whoop_workouts,
  public.workout_sessions,
  public.workout_exercises,
  public.workout_logs,
  public.nutrition_day,
  public.food_item,
  public.food_substitution_group,
  public.food_substitution_group_item,
  public.meal_log,
  public.meal_log_item,
  public.nutrition_day_types,
  public.nutrition_food_portions,
  public.nutrition_meal_templates,
  public.nutrition_rules,
  public.nutrition_equivalence_groups
to authenticated;
grant insert on table
  public.todos,
  public.workout_exercises,
  public.workout_logs,
  public.nutrition_day,
  public.meal_log,
  public.meal_log_item
to authenticated;
grant update on table
  public.todos,
  public.nutrition_day
to authenticated;
grant delete on table
  public.todos,
  public.meal_log_item
to authenticated;
grant usage, select on sequence
  public.todos_id_seq,
  public.workout_exercises_id_seq,
  public.workout_logs_id_seq,
  public.nutrition_day_id_seq,
  public.meal_log_id_seq,
  public.meal_log_item_id_seq
to authenticated;
-- ── todos ──────────────────────────────────────────────────────────────────
drop policy if exists "anon_select_todos"  on public.todos;
drop policy if exists "anon_insert_todos"  on public.todos;
drop policy if exists "anon_update_todos"  on public.todos;
drop policy if exists "anon_delete_todos"  on public.todos;
create policy "owner_select_todos" on public.todos
  for select to authenticated using (true);
create policy "owner_insert_todos" on public.todos
  for insert to authenticated with check (true);
create policy "owner_update_todos" on public.todos
  for update to authenticated using (true) with check (true);
create policy "owner_delete_todos" on public.todos
  for delete to authenticated using (true);
-- ── whoop_snapshots ────────────────────────────────────────────────────────
drop policy if exists "anon_select_whoop_snapshots" on public.whoop_snapshots;
create policy "owner_select_whoop_snapshots" on public.whoop_snapshots
  for select to authenticated using (true);
-- INSERT/UPDATE remain service_role only (whoop-sync Edge Function)

-- ── whoop_workouts ─────────────────────────────────────────────────────────
drop policy if exists "anon_select_whoop_workouts" on public.whoop_workouts;
create policy "owner_select_whoop_workouts" on public.whoop_workouts
  for select to authenticated using (true);
-- ── workout_sessions ───────────────────────────────────────────────────────
drop policy if exists "anon_read_sessions"         on public.workout_sessions;
drop policy if exists "anon_select_workout_sessions" on public.workout_sessions;
create policy "owner_select_workout_sessions" on public.workout_sessions
  for select to authenticated using (true);
-- ── workout_exercises ──────────────────────────────────────────────────────
drop policy if exists "anon_read_exercises"          on public.workout_exercises;
drop policy if exists "anon_select_workout_exercises" on public.workout_exercises;
drop policy if exists "anon_insert_exercises"         on public.workout_exercises;
drop policy if exists "anon_insert_workout_exercises" on public.workout_exercises;
create policy "owner_select_workout_exercises" on public.workout_exercises
  for select to authenticated using (true);
create policy "owner_insert_workout_exercises" on public.workout_exercises
  for insert to authenticated
  with check (session_id is not null and length(trim(exercise_name)) > 0);
-- ── workout_logs ───────────────────────────────────────────────────────────
drop policy if exists "anon_select_workout_logs" on public.workout_logs;
drop policy if exists "anon_insert_workout_logs" on public.workout_logs;
create policy "owner_select_workout_logs" on public.workout_logs
  for select to authenticated using (true);
create policy "owner_insert_workout_logs" on public.workout_logs
  for insert to authenticated with check (true);
-- ── nutrition_day ──────────────────────────────────────────────────────────
drop policy if exists "anon_select_nutrition_day" on public.nutrition_day;
drop policy if exists "anon_insert_nutrition_day" on public.nutrition_day;
drop policy if exists "anon_update_nutrition_day" on public.nutrition_day;
create policy "owner_select_nutrition_day" on public.nutrition_day
  for select to authenticated using (true);
create policy "owner_insert_nutrition_day" on public.nutrition_day
  for insert to authenticated with check (true);
create policy "owner_update_nutrition_day" on public.nutrition_day
  for update to authenticated using (true) with check (true);
-- ── meal_log ───────────────────────────────────────────────────────────────
drop policy if exists "anon_select_meal_log" on public.meal_log;
drop policy if exists "anon_insert_meal_log" on public.meal_log;
create policy "owner_select_meal_log" on public.meal_log
  for select to authenticated using (true);
create policy "owner_insert_meal_log" on public.meal_log
  for insert to authenticated with check (true);
-- ── meal_log_item ──────────────────────────────────────────────────────────
drop policy if exists "anon_select_meal_log_item" on public.meal_log_item;
drop policy if exists "anon_insert_meal_log_item" on public.meal_log_item;
drop policy if exists "anon_delete_meal_log_item" on public.meal_log_item;
create policy "owner_select_meal_log_item" on public.meal_log_item
  for select to authenticated using (true);
create policy "owner_insert_meal_log_item" on public.meal_log_item
  for insert to authenticated with check (true);
create policy "owner_delete_meal_log_item" on public.meal_log_item
  for delete to authenticated using (true);
-- ── nutrition reference tables (read-only plan data) ───────────────────────
drop policy if exists "anon_all_nutrition_day_types"        on public.nutrition_day_types;
drop policy if exists "anon_all_nutrition_food_portions"    on public.nutrition_food_portions;
drop policy if exists "anon_all_nutrition_meal_templates"   on public.nutrition_meal_templates;
drop policy if exists "anon_all_nutrition_rules"            on public.nutrition_rules;
drop policy if exists "anon_all_nutrition_equivalence_groups" on public.nutrition_equivalence_groups;
drop policy if exists "anon_select_food_item"               on public.food_item;
drop policy if exists "anon_select_food_substitution_group" on public.food_substitution_group;
drop policy if exists "anon_select_food_substitution_group_item" on public.food_substitution_group_item;
create policy "owner_select_nutrition_day_types" on public.nutrition_day_types
  for select to authenticated using (true);
create policy "owner_select_nutrition_food_portions" on public.nutrition_food_portions
  for select to authenticated using (true);
create policy "owner_select_nutrition_meal_templates" on public.nutrition_meal_templates
  for select to authenticated using (true);
create policy "owner_select_nutrition_rules" on public.nutrition_rules
  for select to authenticated using (true);
create policy "owner_select_nutrition_equivalence_groups" on public.nutrition_equivalence_groups
  for select to authenticated using (true);
create policy "owner_select_food_item" on public.food_item
  for select to authenticated using (true);
create policy "owner_select_food_substitution_group" on public.food_substitution_group
  for select to authenticated using (true);
create policy "owner_select_food_substitution_group_item" on public.food_substitution_group_item
  for select to authenticated using (true);
-- ── whoop_tokens: no change — already service_role only ───────────────────;

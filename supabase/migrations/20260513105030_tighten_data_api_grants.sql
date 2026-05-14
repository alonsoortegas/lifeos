-- Make Data API exposure explicit for Supabase's 2026 public-schema grant change.
-- Start from a deterministic grant state, then opt in only the tables/verbs
-- used by the app.

revoke all on table
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
  public.nutrition_logs,
  public.meal_template,
  public.nutrition_day_types,
  public.nutrition_food_portions,
  public.nutrition_meal_templates,
  public.nutrition_rules,
  public.nutrition_equivalence_groups,
  public.whoop_tokens
from anon, authenticated, service_role;

revoke all on sequence
  public.todos_id_seq,
  public.whoop_snapshots_id_seq,
  public.whoop_workouts_id_seq,
  public.workout_sessions_id_seq,
  public.workout_exercises_id_seq,
  public.workout_logs_id_seq,
  public.nutrition_day_id_seq,
  public.food_item_id_seq,
  public.food_substitution_group_id_seq,
  public.food_substitution_group_item_id_seq,
  public.meal_log_id_seq,
  public.meal_log_item_id_seq,
  public.nutrition_logs_id_seq,
  public.meal_template_id_seq,
  public.nutrition_day_types_id_seq,
  public.nutrition_food_portions_id_seq,
  public.nutrition_meal_templates_id_seq,
  public.nutrition_rules_id_seq,
  public.nutrition_equivalence_groups_id_seq
from anon, authenticated, service_role;

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
  public.meal_log_item
to anon;

grant insert on table
  public.todos,
  public.workout_exercises,
  public.workout_logs,
  public.nutrition_day,
  public.meal_log,
  public.meal_log_item
to anon;

grant update on table
  public.todos,
  public.nutrition_day
to anon;

grant delete on table
  public.todos,
  public.meal_log_item
to anon;

grant usage, select on sequence
  public.todos_id_seq,
  public.workout_exercises_id_seq,
  public.workout_logs_id_seq,
  public.nutrition_day_id_seq,
  public.meal_log_id_seq,
  public.meal_log_item_id_seq
to anon;

grant select, insert, update on table public.whoop_tokens to service_role;
grant select, insert, update on table public.whoop_snapshots to service_role;
grant select, insert, update on table public.whoop_workouts to service_role;

grant usage, select on sequence
  public.whoop_snapshots_id_seq,
  public.whoop_workouts_id_seq
to service_role;

drop policy if exists "anon_all_todos" on public.todos;
drop policy if exists "anon_all_whoop" on public.whoop_snapshots;
drop policy if exists "anon_read_workouts" on public.whoop_workouts;
drop policy if exists "anon_read_sessions" on public.workout_sessions;
drop policy if exists "anon_read_exercises" on public.workout_exercises;
drop policy if exists "anon_insert_exercises" on public.workout_exercises;
drop policy if exists "anon_all_workout" on public.workout_logs;
drop policy if exists "anon_all_nutrition_day" on public.nutrition_day;
drop policy if exists "anon_all_food_item" on public.food_item;
drop policy if exists "anon_all_food_substitution_group" on public.food_substitution_group;
drop policy if exists "anon_all_food_substitution_group_item" on public.food_substitution_group_item;
drop policy if exists "anon_all_meal_log" on public.meal_log;
drop policy if exists "anon_all_meal_log_item" on public.meal_log_item;
drop policy if exists "anon_all_nutrition" on public.nutrition_logs;
drop policy if exists "anon_all_meal_template" on public.meal_template;
drop policy if exists "anon_all_nutrition_day_types" on public.nutrition_day_types;
drop policy if exists "anon_all_nutrition_food_portions" on public.nutrition_food_portions;
drop policy if exists "anon_all_nutrition_meal_templates" on public.nutrition_meal_templates;
drop policy if exists "anon_all_nutrition_rules" on public.nutrition_rules;
drop policy if exists "anon_all_nutrition_equivalence_groups" on public.nutrition_equivalence_groups;
drop policy if exists "service_role_only" on public.whoop_tokens;

create policy "anon_select_todos"
  on public.todos for select
  to anon
  using (true);

create policy "anon_insert_todos"
  on public.todos for insert
  to anon
  with check (true);

create policy "anon_update_todos"
  on public.todos for update
  to anon
  using (true)
  with check (true);

create policy "anon_delete_todos"
  on public.todos for delete
  to anon
  using (true);

create policy "anon_select_whoop_snapshots"
  on public.whoop_snapshots for select
  to anon
  using (true);

create policy "anon_select_whoop_workouts"
  on public.whoop_workouts for select
  to anon
  using (true);

create policy "anon_select_workout_sessions"
  on public.workout_sessions for select
  to anon
  using (true);

create policy "anon_select_workout_exercises"
  on public.workout_exercises for select
  to anon
  using (true);

create policy "anon_insert_workout_exercises"
  on public.workout_exercises for insert
  to anon
  with check (true);

create policy "anon_select_workout_logs"
  on public.workout_logs for select
  to anon
  using (true);

create policy "anon_insert_workout_logs"
  on public.workout_logs for insert
  to anon
  with check (true);

create policy "anon_select_nutrition_day"
  on public.nutrition_day for select
  to anon
  using (true);

create policy "anon_insert_nutrition_day"
  on public.nutrition_day for insert
  to anon
  with check (true);

create policy "anon_update_nutrition_day"
  on public.nutrition_day for update
  to anon
  using (true)
  with check (true);

create policy "anon_select_food_item"
  on public.food_item for select
  to anon
  using (true);

create policy "anon_select_food_substitution_group"
  on public.food_substitution_group for select
  to anon
  using (true);

create policy "anon_select_food_substitution_group_item"
  on public.food_substitution_group_item for select
  to anon
  using (true);

create policy "anon_select_meal_log"
  on public.meal_log for select
  to anon
  using (true);

create policy "anon_insert_meal_log"
  on public.meal_log for insert
  to anon
  with check (true);

create policy "anon_select_meal_log_item"
  on public.meal_log_item for select
  to anon
  using (true);

create policy "anon_insert_meal_log_item"
  on public.meal_log_item for insert
  to anon
  with check (true);

create policy "anon_delete_meal_log_item"
  on public.meal_log_item for delete
  to anon
  using (true);

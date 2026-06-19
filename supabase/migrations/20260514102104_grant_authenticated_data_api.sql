-- Restore Data API table privileges for the authenticated owner session.
-- RLS policies decide row access; these grants decide whether PostgREST can
-- access the tables at all.

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

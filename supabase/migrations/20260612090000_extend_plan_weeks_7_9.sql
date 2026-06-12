-- Extend the training plan through end of June 2026: weeks 7–9 repeat the
-- week 4–6 wave. Week 7 = Jun 8–14, week 8 = Jun 15–21, week 9 = Jun 22–28.
-- Pairs with PLAN_WEEKS = 9 in lib/workout.ts.
-- Idempotent: skips entirely if any week > 6 session already exists.

do $$
begin
  if exists (select 1 from public.workout_sessions where week_number > 6) then
    raise notice 'extension weeks already present, skipping';
    return;
  end if;

  -- Clone sessions 4–6 → 7–9
  insert into public.workout_sessions (week_number, day_of_week, title, session_type, notes)
  select week_number + 3, day_of_week, title, session_type, notes
  from public.workout_sessions
  where week_number between 4 and 6;

  -- Clone their exercises, matching source/target sessions by (week, day)
  insert into public.workout_exercises (
    session_id, order_index, exercise_name, prescribed_sets, prescribed_reps,
    prescribed_weight, weight_unit, target_rpe, notes, modality
  )
  select
    target.id, e.order_index, e.exercise_name, e.prescribed_sets, e.prescribed_reps,
    e.prescribed_weight, e.weight_unit, e.target_rpe, e.notes, e.modality
  from public.workout_sessions source
  join public.workout_exercises e on e.session_id = source.id
  join public.workout_sessions target
    on target.week_number = source.week_number + 3
   and target.day_of_week = source.day_of_week
  where source.week_number between 4 and 6;
end
$$;

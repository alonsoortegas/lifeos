-- Weeks 5–6 were the race taper (Race Specificity / Taper / Drop Session) —
-- repeating them post-race makes no sense. Rebuild weeks 8–9 as copies of
-- week 4, the last full training week (week 7 already equals week 4).

do $$
begin
  -- Remove the taper clones (no logs reference these sessions yet)
  delete from public.workout_exercises
  where session_id in (select id from public.workout_sessions where week_number in (8, 9));
  delete from public.workout_sessions where week_number in (8, 9);

  -- Weeks 8 and 9 = copies of week 4
  insert into public.workout_sessions (week_number, day_of_week, title, session_type, notes)
  select w.target_week, s.day_of_week, s.title, s.session_type, s.notes
  from public.workout_sessions s
  cross join (values (8), (9)) as w(target_week)
  where s.week_number = 4;

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
    on target.week_number in (8, 9)
   and target.day_of_week = source.day_of_week
  where source.week_number = 4;
end
$$;;

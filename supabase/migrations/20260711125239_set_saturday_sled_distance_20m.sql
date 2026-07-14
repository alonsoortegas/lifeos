-- Set the Saturday sled prescription in the active bulk-summer-2026 block to
-- 20 m per set. Distance is carried in prescribed_reps (matching the sled rows
-- in the hyrox-spring-2026 block), so the prescription renders as "3x20m".
-- Set counts are restored to the plan's original volume (3 working sets, 2 in
-- the week-11 deload) so the result is deterministic regardless of whether the
-- earlier, never-applied 20260710000000 migration ran.
update public.workout_exercises as exercise
set
  prescribed_reps = '20m',
  prescribed_sets = case when session.week_number = 11 then 2 else 3 end,
  notes = 'Hard but controlled. No form breakdown.'
from public.workout_sessions as session
where exercise.session_id = session.id
  and session.block_slug = 'bulk-summer-2026'
  and session.day_of_week = 'saturday'
  and exercise.exercise_name in ('Sled Push', 'Sled Pull');

update public.workout_exercises as exercise
set
  prescribed_sets = 1,
  notes = '20 m. Hard but controlled. No form breakdown.'
from public.workout_sessions as session
where exercise.session_id = session.id
  and session.block_slug = 'bulk-summer-2026'
  and session.day_of_week = 'saturday'
  and exercise.exercise_name in ('Sled Push', 'Sled Pull');

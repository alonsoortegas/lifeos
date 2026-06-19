-- Update Wednesday Week 2 session to Upper Body + Zone 2 plan

-- Update session title and notes
update workout_sessions
set title = 'Upper Body + Zone 2',
    notes = '35 min Zone 2 run first. Pull + push block. Sauna after — 2-3 rounds of 10-12 min. Nothing here should leave you sore by Saturday simulation.'
where week_number = 2 and day_of_week = 'wednesday';
-- Remove old exercises for week 2 wednesday
delete from workout_exercises
where session_id = (
  select id from workout_sessions where week_number = 2 and day_of_week = 'wednesday'
);
-- Insert new exercises
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Zone 2 Run', 1, '35 min', null::numeric, 'kg', null, 'Treadmill, conversational pace, HR under ~145 bpm. Add ~100m extra at the end.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 1, 'Pull-ups', 4, '6-8', null::numeric, 'kg', null, 'Full dead hang to chin over bar, controlled descent — lat-driven, no kip'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 2, 'Cable Seated Row', 3, '10', null::numeric, 'kg', null, 'Hip hinge at catch, lean-back on pull — sled pattern'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 3, 'Face Pulls', 3, '15', null::numeric, 'kg', null, 'Shoulder health, external rotation — elbows high'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 4, 'Rope Straight-Arm Pulldown', 2, '12', null::numeric, 'kg', null, 'Finisher — pure lat activation'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 5, 'Incline Dumbbell Press', 3, '10', null::numeric, 'kg', '7', '~RPE 7, not max effort'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 6, 'Dips or Push-ups', 3, '12-15', null::numeric, 'kg', null, 'Bodyweight only — shoulder stability over load'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday'
union all
select s.id, 7, 'Lateral Raises', 3, '15', null::numeric, 'kg', null, 'Light, controlled'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'wednesday';

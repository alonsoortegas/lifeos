-- Update Thursday AM Week 2 to Activation + Pyramid Intervals plan

update workout_sessions
set title = 'Activation + Pyramid Intervals',
    notes = 'Block 1: ~25 min activation at 50–60% load — priming, not training. Block 2: hydrate + HR recovery. Block 3: ~25 min treadmill pyramid intervals, RPE 7–8 on fast efforts.'
where week_number = 2 and day_of_week = 'thursday_am';
delete from workout_exercises
where session_id = (
  select id from workout_sessions where week_number = 2 and day_of_week = 'thursday_am'
);
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
-- Block 1: Activation
select s.id, 0, 'SkiErg Technique', 5, '10–15 strokes', null::numeric, 'kg', null,
  'Slow, deliberate — lat-driven, not arm pull. Hinge at hip on pull. Target ~2:00/500m. Full stop between sets.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 1, 'Arm-Only Sled Pull', 4, '15–20m', 45, 'kg', null,
  'Upright posture, no leg drive — pure arm-over-arm. Drill rope changeover rhythm. Full rest between sets.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 2, 'Lat Pulldown', 2, '10', null::numeric, 'kg', null,
  'Light (~60% of Wed load) — finisher, pure lat activation. No failure.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
-- Block 3: Pyramid Intervals (each row = one fast+easy pair, labelled by fast duration)
union all
select s.id, 3, 'Treadmill Intervals — 1 min fast', 1, '1 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Fast: RPE 7–8, comfortably hard. Easy: RPE 3–4, jog/walk recovery.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 4, 'Treadmill Intervals — 2 min fast', 1, '2 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Fast: RPE 7–8. Easy: RPE 3–4.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 5, 'Treadmill Intervals — 3 min fast', 1, '3 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Peak of pyramid. Fast: RPE 7–8. Easy: RPE 3–4.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 6, 'Treadmill Intervals — 4 min fast', 1, '4 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Top of pyramid. Fast: RPE 7–8. Easy: RPE 3–4.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 7, 'Treadmill Intervals — 3 min fast', 1, '3 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Descending. Fast: RPE 7–8. Easy: RPE 3–4.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 8, 'Treadmill Intervals — 2 min fast', 1, '2 min fast / 1 min easy', null::numeric, 'kg', '7–8',
  'Descending. Fast: RPE 7–8. Easy: RPE 3–4.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am'
union all
select s.id, 9, 'Treadmill Intervals — 1 min fast', 1, '1 min fast', null::numeric, 'kg', '7–8',
  'Final effort. RPE 7–8.'
from workout_sessions s where s.week_number = 2 and s.day_of_week = 'thursday_am';

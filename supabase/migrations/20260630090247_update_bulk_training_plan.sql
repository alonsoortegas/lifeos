update public.workout_sessions
set
  title = case day_of_week
    when 'monday' then 'Day 1 - Upper Pump / Chest-Arms Bias'
    when 'wednesday' then 'Day 2 - Lower Hypertrophy'
    when 'friday' then 'Day 3 - Upper Heavy'
    when 'saturday' then 'Day 4 - Lower Strength + HYROX'
    else title
  end,
  session_type = case
    when week_number = 11 then 'deload'
    when day_of_week = 'saturday' then 'conditioning'
    else 'strength'
  end,
  notes = case day_of_week
    when 'monday' then 'Chest and arms biased pump session. Optional Z2 bike for 15-20 min after lifting. Skip the bike if running three times this week.'
    when 'wednesday' then 'Lower hypertrophy day. No extra cardio. Brace hard on hinges and reduce load immediately if the back twinges.'
    when 'friday' then 'Upper heavy session with lower-volume arm work. Optional Z2 bike for 15-20 min after lifting. Skip the bike if running three times this week.'
    when 'saturday' then 'Lower strength plus HYROX-flavoured conditioning. Keep sleds and carries hard but controlled with no form breakdown. Core is one movement only.'
    else notes
  end || case
    when week_number = 11 then ' Deload: use roughly half the normal sets while keeping technique and load controlled.'
    else ''
  end
where block_slug = 'bulk-summer-2026'
  and day_of_week in ('monday', 'wednesday', 'friday', 'saturday');

delete from public.workout_exercises
where session_id in (
  select id
  from public.workout_sessions
  where block_slug = 'bulk-summer-2026'
);

with exercise_template (day_of_week, order_index, exercise_name, prescribed_sets, prescribed_reps, modality, notes) as (
  values
    ('monday', 0, 'Incline Bench Press (DB)', 4, '8-10', 'strength', 'Target RIR: 1-2.'),
    ('monday', 1, 'Low-to-high Cable Fly or Incline Machine Press', 2, '12-15', 'strength', 'Chest-biased accessory. Keep tension controlled.'),
    ('monday', 2, 'Lat Pulldown (Cable)', 3, '10-12', 'strength', 'Target RIR: 1-2.'),
    ('monday', 3, 'Iso-Lateral Row (Machine)', 3, '10-12', 'strength', 'Target RIR: 1-2.'),
    ('monday', 4, 'Seated Shoulder Press (Machine)', 3, '10-12', 'strength', 'Target RIR: 1-2.'),
    ('monday', 5, 'Lateral Raise (DB)', 4, '12-20', 'strength', 'Target RIR: 0-1.'),
    ('monday', 6, 'Rear Delt Fly', 3, '15-20', 'strength', 'Target RIR: 0-1.'),
    ('monday', 7, 'DB Curl', 3, '10-15', 'strength', 'Superset with Rope Pushdown. Target RIR: 0-1.'),
    ('monday', 8, 'Rope Pushdown', 3, '10-15', 'strength', 'Superset with DB Curl. Target RIR: 0-1.'),

    ('wednesday', 0, 'Leg Press (Machine)', 4, '12', 'strength', 'Target RIR: 1-2.'),
    ('wednesday', 1, 'Hip Thrust (Barbell)', 4, '10', 'strength', 'Target RIR: 1-2.'),
    ('wednesday', 2, 'Romanian Deadlift (DB)', 3, '10', 'strength', 'Target RIR: 2.'),
    ('wednesday', 3, 'Seated Leg Curl (Machine)', 4, '15', 'strength', 'Target RIR: 0-1.'),
    ('wednesday', 4, 'Standing Calf Raise', 4, '15', 'strength', 'Target RIR: 0-1.'),
    ('wednesday', 5, 'Side Plank', 2, 'near-fail hold', 'bodyweight', 'Hold to near failure.'),
    ('wednesday', 6, 'Toes to Bar', 3, '10', 'bodyweight', 'Target RIR: 1-2.'),

    ('friday', 0, 'Incline Bench Press (DB)', 4, '6-8', 'strength', 'Target RIR: 1-2.'),
    ('friday', 1, 'Bench Press (Barbell)', 3, '5', 'strength', 'Target RIR: 2-3.'),
    ('friday', 2, 'Pull Up (Weighted)', 4, '5', 'strength', 'Target RIR: 2-3.'),
    ('friday', 3, 'Iso-Lateral Row (Machine)', 4, '8', 'strength', 'Target RIR: 1-2.'),
    ('friday', 4, 'Shoulder Press (DB)', 3, '8', 'strength', 'Target RIR: 1-2.'),
    ('friday', 5, 'Cable Lateral Raise', 4, '12-15', 'strength', 'Target RIR: 0-1.'),
    ('friday', 6, 'Face Pull', 3, '15', 'strength', 'Target RIR: 0-1.'),
    ('friday', 7, 'Incline Curl', 3, '10-15', 'strength', 'Superset with Overhead Cable Triceps Extension. Target RIR: 0-1.'),
    ('friday', 8, 'Overhead Cable Triceps Extension', 3, '10-15', 'strength', 'Superset with Incline Curl. Target RIR: 0-1.'),

    ('saturday', 0, 'Leg Press (Machine)', 4, '8', 'strength', 'Target RIR: 2.'),
    ('saturday', 1, 'Bulgarian Split Squat', 3, '8', 'strength', 'Target RIR: 1-2.'),
    ('saturday', 2, 'Sled Push', 3, '1 set', 'carry', 'Hard but controlled. No form breakdown.'),
    ('saturday', 3, 'Sled Pull', 3, '1 set', 'carry', 'Hard but controlled. No form breakdown.'),
    ('saturday', 4, 'Seated Leg Curl (Machine)', 3, '8-12', 'strength', 'Target RIR: 1-2.'),
    ('saturday', 5, 'Farmers Walk', 3, '1 set', 'carry', 'Heavy with no form loss.'),
    ('saturday', 6, 'Toes to Bar', 3, '10', 'bodyweight', 'Core: one movement only. Target RIR: 1-2.')
)
insert into public.workout_exercises (
  session_id, order_index, exercise_name, prescribed_sets, prescribed_reps,
  prescribed_weight, weight_unit, target_rpe, notes, modality
)
select
  session.id,
  template.order_index,
  template.exercise_name,
  case when session.week_number = 11 then greatest(1, ceil(template.prescribed_sets / 2.0)::int) else template.prescribed_sets end,
  template.prescribed_reps,
  null,
  'kg',
  null,
  template.notes,
  template.modality
from public.workout_sessions session
join exercise_template template using (day_of_week)
where session.block_slug = 'bulk-summer-2026';

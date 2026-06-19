alter table public.workout_sessions
  add column if not exists block_slug text;

update public.workout_sessions
set block_slug = 'hyrox-spring-2026'
where block_slug is null;

alter table public.workout_sessions
  alter column block_slug set not null;

create unique index if not exists workout_sessions_block_week_day_idx
  on public.workout_sessions (block_slug, week_number, day_of_week);

insert into public.workout_sessions (
  block_slug, week_number, day_of_week, title, session_type, notes
)
select
  'bulk-summer-2026', weeks.week_number, sessions.day_of_week,
  case when weeks.week_number = 11 then sessions.title || ' — Deload' else sessions.title end,
  case when weeks.week_number = 11 then 'deload' else sessions.session_type end,
  case when weeks.week_number = 11
    then sessions.notes || ' Deload: use roughly half the normal sets while keeping technique and load controlled.'
    else sessions.notes end
from generate_series(1, 11) as weeks(week_number)
cross join (
  values
    ('monday', 'Day 1 — Upper (Moderate / Pump)', 'strength', 'Optional Z2 bike for 15–20 min after lifting. Skip the bike if running three times this week.'),
    ('wednesday', 'Day 2 — Lower (Hypertrophy + Core)', 'strength', 'No extra cardio. Brace hard on hinges and reduce load immediately if the back twinges.'),
    ('friday', 'Day 3 — Upper (Heavy / Strength)', 'strength', 'Optional Z2 bike for 15–20 min after lifting. Skip the bike if running three times this week.'),
    ('saturday', 'Day 4 — Lower (Strength + Conditioning)', 'conditioning', 'HYROX-flavoured conditioning is built in. Keep sleds and carries hard but controlled with no form breakdown.')
) as sessions(day_of_week, title, session_type, notes)
on conflict (block_slug, week_number, day_of_week) do nothing;

with exercise_template (day_of_week, order_index, exercise_name, prescribed_sets, prescribed_reps, modality, notes) as (
  values
    ('monday', 0, 'Incline Bench Press (DB)', 4, '10', 'strength', 'Target RIR: 1–2.'),
    ('monday', 1, 'Lat Pulldown (Cable)', 4, '12', 'strength', 'Target RIR: 1–2.'),
    ('monday', 2, 'Iso-Lateral Row (Machine)', 4, '12', 'strength', 'Target RIR: 1–2.'),
    ('monday', 3, 'Seated Shoulder Press (Machine)', 3, '12', 'strength', 'Target RIR: 1–2.'),
    ('monday', 4, 'Lateral Raise (DB)', 5, '15', 'strength', 'Target RIR: 0–1.'),
    ('monday', 5, 'Rear Delt Reverse Fly (DB)', 4, '15', 'strength', 'Target RIR: 0–1.'),
    ('monday', 6, 'Bicep Curl (DB)', 3, '12', 'strength', 'Superset with Triceps Rope Pushdown. Target RIR: 0–1.'),
    ('monday', 7, 'Triceps Rope Pushdown', 3, '12', 'strength', 'Superset with Bicep Curl (DB). Target RIR: 0–1.'),
    ('wednesday', 0, 'Leg Press (Machine)', 4, '12', 'strength', 'Target RIR: 1–2.'),
    ('wednesday', 1, 'Hip Thrust (Barbell)', 4, '10', 'strength', 'Target RIR: 1–2.'),
    ('wednesday', 2, 'Romanian Deadlift (DB)', 3, '10', 'strength', 'Target RIR: 2.'),
    ('wednesday', 3, 'Seated Leg Curl (Machine)', 4, '15', 'strength', 'Target RIR: 0–1.'),
    ('wednesday', 4, 'Standing Calf Raise', 4, '15', 'strength', 'Target RIR: 0–1.'),
    ('wednesday', 5, 'Side Plank', 2, 'near-fail hold', 'bodyweight', 'Hold to near failure.'),
    ('wednesday', 6, 'Toes to Bar', 3, '10', 'bodyweight', 'Target RIR: 1–2.'),
    ('friday', 0, 'Incline Bench Press (DB)', 4, '8', 'strength', 'Target RIR: 1–2.'),
    ('friday', 1, 'Bench Press (Barbell)', 3, '5', 'strength', 'Target RIR: 2–3.'),
    ('friday', 2, 'Pull Up (Weighted)', 4, '5', 'strength', 'Target RIR: 2–3.'),
    ('friday', 3, 'Iso-Lateral Row (Machine)', 4, '8', 'strength', 'Target RIR: 1–2.'),
    ('friday', 4, 'Shoulder Press (DB)', 3, '8', 'strength', 'Target RIR: 1–2.'),
    ('friday', 5, 'Single Arm Lateral Raise (Cable)', 4, '12', 'strength', 'Target RIR: 0–1.'),
    ('friday', 6, 'Face Pull', 3, '15', 'strength', 'Target RIR: 0–1.'),
    ('saturday', 0, 'Leg Press (Machine)', 4, '8', 'strength', 'Target RIR: 2.'),
    ('saturday', 1, 'Bulgarian Split Squat', 3, '8', 'strength', 'Target RIR: 1–2.'),
    ('saturday', 2, 'Sled Push', 3, '1 set', 'carry', 'Hard but controlled. No form breakdown.'),
    ('saturday', 3, 'Sled Pull', 3, '1 set', 'carry', 'Hard but controlled. No form breakdown.'),
    ('saturday', 4, 'Lunge (Barbell)', 3, '10', 'strength', 'Target RIR: 1–2.'),
    ('saturday', 5, 'Seated Leg Curl (Machine)', 3, '8', 'strength', 'Target RIR: 1–2.'),
    ('saturday', 6, 'Farmers Walk', 3, '1 set', 'carry', 'Heavy with no form loss.'),
    ('saturday', 7, 'Toes to Bar', 3, '10', 'bodyweight', 'Target RIR: 1–2.'),
    ('saturday', 8, 'Side Plank', 2, 'near-fail hold', 'bodyweight', 'Hold to near failure.')
)
insert into public.workout_exercises (
  session_id, order_index, exercise_name, prescribed_sets, prescribed_reps,
  prescribed_weight, weight_unit, target_rpe, notes, modality
)
select
  session.id, template.order_index, template.exercise_name,
  case when session.week_number = 11 then greatest(1, ceil(template.prescribed_sets / 2.0)::int) else template.prescribed_sets end,
  template.prescribed_reps, null, 'kg', null, template.notes, template.modality
from public.workout_sessions session
join exercise_template template using (day_of_week)
where session.block_slug = 'bulk-summer-2026'
  and not exists (
    select 1 from public.workout_exercises existing
    where existing.session_id = session.id and existing.order_index = template.order_index
  );;

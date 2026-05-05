-- Add weight_unit to existing workout_logs
alter table workout_logs add column weight_unit text not null default 'kg';

-- Planned sessions from the training program
create table workout_sessions (
  id            bigint primary key generated always as identity,
  week_number   int not null,
  day_of_week   text not null,   -- 'monday' | 'wednesday' | 'thursday_am'
  title         text not null,
  session_type  text not null,   -- 'strength' | 'activation'
  notes         text
);

-- Prescribed exercises within a session
create table workout_exercises (
  id                bigint primary key generated always as identity,
  session_id        bigint references workout_sessions(id) on delete cascade,
  order_index       int not null default 0,
  exercise_name     text not null,
  prescribed_sets   int,
  prescribed_reps   text,
  prescribed_weight numeric(6,2),
  weight_unit       text default 'kg',
  target_rpe        text,
  notes             text
);

create index workout_sessions_week_day_idx on workout_sessions (week_number, day_of_week);
create index workout_exercises_session_idx on workout_exercises (session_id, order_index);

alter table workout_sessions enable row level security;
alter table workout_exercises enable row level security;
create policy "anon_read_sessions"  on workout_sessions  for select using (true);
create policy "anon_read_exercises" on workout_exercises for select using (true);

-- ============================================================
-- SEED: 18 sessions across 6 weeks × 3 gym days
-- ============================================================

insert into workout_sessions (week_number, day_of_week, title, session_type, notes) values
  -- Week 1
  (1, 'monday',      'Lower Body Strength',       'strength',   'No sled available — KB Gorilla Rows as sled sub. No HYROX shoes.'),
  (1, 'wednesday',   'Upper Body Pulling',         'strength',   'Lat focus + shoulder stability. No leg work.'),
  (1, 'thursday_am', 'Activation + Machine Work',  'activation', 'SkiErg technique focus. 45 min max. Legs stay fresh for evening intervals.'),
  -- Week 2
  (2, 'monday',      'Lower Body Strength + Sled', 'strength',   'Sled available. Time trial after sled sets. Wall balls as fatigued finisher.'),
  (2, 'wednesday',   'Upper Body Pulling',         'strength',   'Lat focus + shoulder stability. No leg work.'),
  (2, 'thursday_am', 'Activation + Machine Work',  'activation', 'SkiErg technique focus. 45 min max.'),
  -- Week 3
  (3, 'monday',      'Lower Body + Compromised Sled', 'strength', '1km run → sled pull → repeat. Race fatigue simulation.'),
  (3, 'wednesday',   'Upper Body Pulling',            'strength', 'Reduce calisthenics this week — protect Thursday intervals.'),
  (3, 'thursday_am', 'Activation + Machine Work',     'activation', 'SkiErg technique. Legs stay fresh.'),
  -- Week 4
  (4, 'monday',      'Lower Body + Race-Weight Sled', 'strength',   'Sled at race weight (152kg). Time trial. Run pace drop must be <15 sec/km.'),
  (4, 'wednesday',   'Upper Body Pulling',             'strength',   'Reduce volume — protect Thursday intervals.'),
  (4, 'thursday_am', 'Activation + Machine Work',      'activation', 'Light activation only. 45 min max.'),
  -- Week 5
  (5, 'monday',      'Lower Body — Race Specificity', 'strength',   'Reduce volume, keep intensity. Final simulation ~10 days out.'),
  (5, 'wednesday',   'Upper Body Pulling — Taper',    'strength',   'Reduced sets. Maintain technique.'),
  (5, 'thursday_am', 'Light Activation',              'activation', 'SkiErg only. No heavy pulling.'),
  -- Week 6
  (6, 'monday',      'Lower Body — Taper',          'strength', 'No heavy sled last 5 days. Light deadlifts only.'),
  (6, 'wednesday',   'Upper Body Pulling — Taper',  'strength', 'Minimal volume. Maintain movement patterns.'),
  (6, 'thursday_am', 'Rest — Drop Session',         'activation', 'Thursday AM dropped entirely in Week 6. Protect legs for race.');


-- ============================================================
-- EXERCISES — inserted via subquery on (week_number, day_of_week)
-- ============================================================

-- Helper macro: we use a series of INSERT ... SELECT statements
-- Each exercise row references its session via subquery

-- WEEK 1 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Deadlift', 4, '4-5', 95, 'kg', '8-8.5', null from workout_sessions s where s.week_number=1 and s.day_of_week='monday'
union all
select s.id, 1, 'RDL', 3, '8', 52, 'kg', null, 'Controlled descent' from workout_sessions s where s.week_number=1 and s.day_of_week='monday'
union all
select s.id, 2, 'Bulgarian Split Squat', 3, '8/leg', 20, 'kg', null, null from workout_sessions s where s.week_number=1 and s.day_of_week='monday'
union all
select s.id, 3, 'KB Gorilla Rows', 3, '10/arm', 26, 'kg', null, 'Sled sub — no HYROX shoes' from workout_sessions s where s.week_number=1 and s.day_of_week='monday'
union all
select s.id, 4, 'Wall Balls', 3, '25 unbroken', 9, 'kg', null, 'Finisher' from workout_sessions s where s.week_number=1 and s.day_of_week='monday';

-- WEEK 2 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Deadlift', 4, '4-5', 90, 'kg', null, 'Dropped from 95kg — maintaining load in caloric deficit' from workout_sessions s where s.week_number=2 and s.day_of_week='monday'
union all
select s.id, 1, 'RDL', 3, '8', 60, 'kg', null, 'Up from 55kg — controlled descent' from workout_sessions s where s.week_number=2 and s.day_of_week='monday'
union all
select s.id, 2, 'Bulgarian Split Squat', 3, '8/leg', 22, 'kg', null, 'Up from 20kg' from workout_sessions s where s.week_number=2 and s.day_of_week='monday'
union all
select s.id, 3, 'Sled Pull Sets', 3, '15-20m', 102, 'kg', null, 'Lean-back hip drive, rope changeover rhythm' from workout_sessions s where s.week_number=2 and s.day_of_week='monday'
union all
select s.id, 4, 'Sled Pull Time Trial', 1, '50m', 102, 'kg', null, 'Time + stops — Week 2 Priority 1 baseline' from workout_sessions s where s.week_number=2 and s.day_of_week='monday'
union all
select s.id, 5, 'Wall Balls', 3, '25 unbroken', 9, 'kg', null, 'Finisher when already fatigued' from workout_sessions s where s.week_number=2 and s.day_of_week='monday';

-- WEEK 3 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Compromised Run + Sled', 3, '1km run → sled', 102, 'kg', null, 'Run first, then station — race day order' from workout_sessions s where s.week_number=3 and s.day_of_week='monday'
union all
select s.id, 1, 'Deadlift', 4, '4', 85, 'kg', null, 'Maintained load with added run fatigue' from workout_sessions s where s.week_number=3 and s.day_of_week='monday'
union all
select s.id, 2, 'RDL', 3, '8', 60, 'kg', null, null from workout_sessions s where s.week_number=3 and s.day_of_week='monday'
union all
select s.id, 3, 'Bulgarian Split Squat', 3, '8/leg', 22, 'kg', null, null from workout_sessions s where s.week_number=3 and s.day_of_week='monday'
union all
select s.id, 4, 'Wall Balls', 3, '25 unbroken', 9, 'kg', null, 'End of session — simulate race fatigue' from workout_sessions s where s.week_number=3 and s.day_of_week='monday';

-- WEEK 4 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Compromised Run + Sled', 3, '1km run → sled', 102, 'kg', null, 'Run first, then sled — race pace runs' from workout_sessions s where s.week_number=4 and s.day_of_week='monday'
union all
select s.id, 1, 'Sled Pull Time Trial', 1, '50m', 152, 'kg', null, 'Race weight. Both pulls target <0:45. Run pace drop must be <15 sec/km' from workout_sessions s where s.week_number=4 and s.day_of_week='monday'
union all
select s.id, 2, 'Deadlift', 4, '4', 82.5, 'kg', null, 'Progressive taper begins' from workout_sessions s where s.week_number=4 and s.day_of_week='monday'
union all
select s.id, 3, 'RDL', 3, '8', 60, 'kg', null, null from workout_sessions s where s.week_number=4 and s.day_of_week='monday'
union all
select s.id, 4, 'Bulgarian Split Squat', 3, '8/leg', 22, 'kg', null, null from workout_sessions s where s.week_number=4 and s.day_of_week='monday'
union all
select s.id, 5, 'Wall Balls', 3, '25 unbroken', 9, 'kg', null, 'Finisher' from workout_sessions s where s.week_number=4 and s.day_of_week='monday';

-- WEEK 5 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Deadlift', 3, '4', 80, 'kg', null, 'Reduced volume, keep intensity' from workout_sessions s where s.week_number=5 and s.day_of_week='monday'
union all
select s.id, 1, 'RDL', 3, '8', 55, 'kg', null, null from workout_sessions s where s.week_number=5 and s.day_of_week='monday'
union all
select s.id, 2, 'Sled Pull', 2, '20m', 102, 'kg', null, 'Reduced volume — stay sharp not fatigued' from workout_sessions s where s.week_number=5 and s.day_of_week='monday'
union all
select s.id, 3, 'Wall Balls', 2, '25 unbroken', 9, 'kg', null, null from workout_sessions s where s.week_number=5 and s.day_of_week='monday';

-- WEEK 6 MONDAY
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Deadlift', 2, '4', 75, 'kg', null, 'Taper week — protect legs for race' from workout_sessions s where s.week_number=6 and s.day_of_week='monday'
union all
select s.id, 1, 'RDL', 2, '8', 50, 'kg', null, null from workout_sessions s where s.week_number=6 and s.day_of_week='monday'
union all
select s.id, 2, 'Wall Balls', 2, '25 unbroken', 9, 'kg', null, 'Light finisher only' from workout_sessions s where s.week_number=6 and s.day_of_week='monday';

-- WEDNESDAY WEEKS 1-4 (upper body pulling)
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Lat Pulldown', 3, '10', 60, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (1,2,3,4)
union all
select s.id, 1, 'Seated Cable Row', 3, '10', 60, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (1,2,3,4)
union all
select s.id, 2, 'Rope Face Pull', 3, '15', 25, 'kg', null, 'Shoulder stability' from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (1,2,3,4)
union all
select s.id, 3, 'Shoulder Press', 3, '8', 40, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (1,2,3,4);

-- WEDNESDAY WEEKS 5-6 (reduced volume)
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'Lat Pulldown', 2, '10', 55, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (5,6)
union all
select s.id, 1, 'Seated Cable Row', 2, '10', 55, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (5,6)
union all
select s.id, 2, 'Rope Face Pull', 2, '15', 25, 'kg', null, null from workout_sessions s where s.day_of_week='wednesday' and s.week_number in (5,6);

-- THURSDAY AM WEEKS 1-4 (activation)
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'SkiErg', 3, '200m', null, 'kg', null, 'Technique focus — lat pull not arm pull. Even split.' from workout_sessions s where s.day_of_week='thursday_am' and s.week_number in (1,2,3,4)
union all
select s.id, 1, 'Lat Pulldown', 2, '10', 50, 'kg', null, null from workout_sessions s where s.day_of_week='thursday_am' and s.week_number in (1,2,3,4)
union all
select s.id, 2, 'Rope Pulls', 2, '15', 20, 'kg', null, null from workout_sessions s where s.day_of_week='thursday_am' and s.week_number in (1,2,3,4);

-- THURSDAY AM WEEK 5 (light)
insert into workout_exercises (session_id, order_index, exercise_name, prescribed_sets, prescribed_reps, prescribed_weight, weight_unit, target_rpe, notes)
select s.id, 0, 'SkiErg', 2, '200m', null, 'kg', null, 'Light technique only' from workout_sessions s where s.day_of_week='thursday_am' and s.week_number=5
union all
select s.id, 1, 'Lat Pulldown', 2, '10', 45, 'kg', null, null from workout_sessions s where s.day_of_week='thursday_am' and s.week_number=5;

-- THURSDAY AM WEEK 6: no exercises — session exists as placeholder but is dropped per plan

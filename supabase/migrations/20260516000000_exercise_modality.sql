-- Add modality classification to exercises and distance/duration fields to logs
alter table workout_exercises
  add column modality text not null default 'strength';
alter table workout_logs
  add column distance_m   int,
  add column duration_s   int;
-- Classify known erg and bodyweight exercises
update workout_exercises
  set modality = 'erg'
  where lower(exercise_name) like '%ski%'
     or lower(exercise_name) like '%row%'
     or lower(exercise_name) like '%erg%';
update workout_exercises
  set modality = 'carry'
  where lower(exercise_name) like '%carry%'
     or lower(exercise_name) like '%farmers%'
     or lower(exercise_name) like '%yoke%';
update workout_exercises
  set modality = 'bodyweight'
  where lower(exercise_name) in ('pull-up', 'push-up', 'dip', 'chin-up', 'pull up', 'push up');

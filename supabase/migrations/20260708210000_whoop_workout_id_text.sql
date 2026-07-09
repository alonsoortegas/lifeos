-- WHOOP API v2 returns UUID workout IDs (v1 used numeric IDs). The whoop_workouts.workout_id
-- column was bigint, so every workout upsert in whoop-sync failed with a type error
-- (22P02 invalid input syntax for type bigint) — silently, since the loop only console.warn'd.
-- Result: workouts were fetched every run but never written, leaving the table empty.
-- Switch workout_id to text so it accepts UUIDs. The UNIQUE(workout_id) constraint is preserved.
alter table whoop_workouts
  alter column workout_id type text using workout_id::text;

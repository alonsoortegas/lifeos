-- Recovered from the remote migration history (applied 2026-06-29 directly to
-- the database, never committed): per-exercise rest prescription and superset
-- grouping for the workout plan.

alter table public.workout_exercises
  add column if not exists rest_s int,
  add column if not exists superset_group text;

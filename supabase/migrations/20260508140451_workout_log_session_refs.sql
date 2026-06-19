alter table workout_logs
  add column workout_session_id bigint references workout_sessions(id) on delete set null,
  add column workout_exercise_id bigint references workout_exercises(id) on delete set null;
create index workout_logs_session_logged_at_idx on workout_logs (workout_session_id, logged_at desc);
create index workout_logs_exercise_logged_at_idx on workout_logs (workout_exercise_id, logged_at desc);

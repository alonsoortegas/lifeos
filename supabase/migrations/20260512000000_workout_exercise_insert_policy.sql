create policy "anon_insert_exercises"
on workout_exercises
for insert
with check (
  session_id is not null
  and length(trim(exercise_name)) > 0
);

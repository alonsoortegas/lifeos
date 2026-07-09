-- Training phase declarations (bulk / cut / maintenance).
-- Setting a phase inserts a new row; history is preserved.
-- Current phase = row with the latest started_on.
create table training_phases (
  id          bigint primary key generated always as identity,
  phase       text not null check (phase in ('bulk','cut','maintenance')),
  started_on  date not null,
  target_rate_kg_per_week numeric(4,2),  -- null = phase default
  notes       text,
  created_at  timestamptz default now()
);
alter table training_phases enable row level security;
create policy "authenticated_all_training_phases" on training_phases
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

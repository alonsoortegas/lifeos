create table public.ai_brief_outcomes (
  id                         bigint generated always as identity primary key,
  brief_id                   bigint not null references public.ai_briefs(id) on delete cascade,
  user_rating                text check (user_rating in ('useful', 'not_useful')),
  user_note                  text,
  training_adherence         text check (
    training_adherence in ('followed', 'deviated_harder', 'deviated_easier', 'skipped', 'unknown')
  ),
  nutrition_day_type_actual text,
  next_day_recovery_delta   numeric,
  computed_at               timestamptz,
  created_at                timestamptz not null default now(),
  unique (brief_id)
);

alter table public.ai_brief_outcomes enable row level security;

grant select, insert, update on public.ai_brief_outcomes to authenticated;
grant usage, select on sequence public.ai_brief_outcomes_id_seq to authenticated;

create policy "owner_select_ai_brief_outcomes" on public.ai_brief_outcomes
  for select to authenticated using (is_owner());
create policy "owner_insert_ai_brief_outcomes" on public.ai_brief_outcomes
  for insert to authenticated with check (is_owner());
create policy "owner_update_ai_brief_outcomes" on public.ai_brief_outcomes
  for update to authenticated using (is_owner()) with check (is_owner());

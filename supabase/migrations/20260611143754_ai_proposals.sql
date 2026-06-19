create table public.ai_proposals (
  id bigint generated always as identity primary key,
  brief_id bigint not null references public.ai_briefs(id) on delete cascade,
  kind text not null check (kind in ('set_nutrition_day_type', 'modify_session', 'skip_session', 'add_todo', 'reorder_todos')),
  payload jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_proposals_brief_status_idx on public.ai_proposals (brief_id, status);
alter table public.ai_proposals enable row level security;
grant select, insert, update on public.ai_proposals to authenticated;
grant usage, select on sequence public.ai_proposals_id_seq to authenticated;
create policy "owner_select_ai_proposals" on public.ai_proposals for select to authenticated using (is_owner());
create policy "owner_insert_ai_proposals" on public.ai_proposals for insert to authenticated with check (is_owner());
create policy "owner_update_ai_proposals" on public.ai_proposals for update to authenticated using (is_owner()) with check (is_owner());;

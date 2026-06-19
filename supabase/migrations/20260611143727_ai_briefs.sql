create table public.ai_briefs (
  id bigint generated always as identity primary key,
  brief_date date not null,
  generation int not null default 1 check (generation > 0),
  readiness_state text not null,
  input_hash text not null,
  context_json jsonb not null,
  output_json jsonb not null,
  model text not null,
  prompt_version text not null,
  fallback_level int not null default 0 check (fallback_level between 0 and 2),
  latency_ms int,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  unique (brief_date, generation)
);
create index ai_briefs_date_created_idx on public.ai_briefs (brief_date desc, created_at desc);
create index ai_briefs_input_hash_idx on public.ai_briefs (input_hash);
alter table public.ai_briefs enable row level security;
grant select, insert on public.ai_briefs to authenticated;
grant usage, select on sequence public.ai_briefs_id_seq to authenticated;
create policy "owner_select_ai_briefs" on public.ai_briefs for select to authenticated using (is_owner());
create policy "owner_insert_ai_briefs" on public.ai_briefs for insert to authenticated with check (is_owner());;

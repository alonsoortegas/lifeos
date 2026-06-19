revoke all on table public.ai_briefs, public.ai_proposals, public.ai_brief_outcomes, public.daily_checkins from anon, authenticated;
grant select, insert on public.ai_briefs to authenticated;
grant select, insert, update on public.ai_proposals to authenticated;
grant select, insert, update on public.ai_brief_outcomes to authenticated;
grant select, insert, update on public.daily_checkins to authenticated;
revoke all on sequence public.ai_briefs_id_seq, public.ai_proposals_id_seq, public.ai_brief_outcomes_id_seq, public.daily_checkins_id_seq from anon, authenticated;
grant usage, select on sequence public.ai_briefs_id_seq, public.ai_proposals_id_seq, public.ai_brief_outcomes_id_seq, public.daily_checkins_id_seq to authenticated;
alter function public.set_updated_at() set search_path = public;;

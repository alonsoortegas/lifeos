-- Single-row token store for Whoop OAuth2 refresh token
create table whoop_tokens (
  id              int primary key default 1,
  access_token    text,
  refresh_token   text not null,
  expires_at      timestamptz,
  updated_at      timestamptz default now()
);

-- Only one row ever exists (id = 1), enforced by primary key
-- Service role only — no anon access
alter table whoop_tokens enable row level security;
create policy "service_role_only" on whoop_tokens using (false);

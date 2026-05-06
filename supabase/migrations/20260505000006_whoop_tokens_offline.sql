alter table whoop_tokens
  add column if not exists token_type      text,
  add column if not exists scope           text,
  add column if not exists reauth_required boolean not null default false;

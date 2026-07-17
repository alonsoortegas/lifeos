create table public.saved_food_portion (
  id              bigint primary key generated always as identity,
  normalized_name text not null,
  name            text not null,
  calories        integer not null,
  protein_g       numeric(7,1) not null,
  carbs_g         numeric(7,1) not null,
  fat_g           numeric(7,1) not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (normalized_name),
  constraint saved_food_portion_name_present_check
    check (length(btrim(name)) > 0 and length(normalized_name) > 0),
  constraint saved_food_portion_normalized_name_check
    check (
      normalized_name = lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    ),
  constraint saved_food_portion_nonnegative_macros_check
    check (
      calories >= 0
      and protein_g >= 0
      and carbs_g >= 0
      and fat_g >= 0
      and (calories > 0 or protein_g > 0 or carbs_g > 0 or fat_g > 0)
    )
);

create trigger saved_food_portion_updated_at
before update on public.saved_food_portion
for each row execute function public.set_updated_at();

alter table public.saved_food_portion enable row level security;

create policy "owner_select_saved_food_portion" on public.saved_food_portion
  for select to authenticated using (is_owner());
create policy "owner_insert_saved_food_portion" on public.saved_food_portion
  for insert to authenticated with check (is_owner());
create policy "owner_update_saved_food_portion" on public.saved_food_portion
  for update to authenticated using (is_owner()) with check (is_owner());

grant select, insert, update on table public.saved_food_portion to authenticated;
grant usage, select on sequence public.saved_food_portion_id_seq to authenticated;

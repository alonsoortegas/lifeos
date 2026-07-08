alter table public.meal_log_item
  alter column food_item_id drop not null;

alter table public.meal_log_item
  add column if not exists custom_food_name text,
  add column if not exists source text not null default 'catalog';

alter table public.meal_log_item
  drop constraint if exists meal_log_item_source_check,
  add constraint meal_log_item_source_check
  check (source in ('catalog', 'custom'));

alter table public.meal_log_item
  drop constraint if exists meal_log_item_catalog_or_custom_check,
  add constraint meal_log_item_catalog_or_custom_check
  check (
    (
      source = 'catalog'
      and food_item_id is not null
      and custom_food_name is null
    )
    or
    (
      source = 'custom'
      and food_item_id is null
      and nullif(btrim(custom_food_name), '') is not null
    )
  );

alter table public.meal_log_item
  drop constraint if exists meal_log_item_nonnegative_macros_check,
  add constraint meal_log_item_nonnegative_macros_check
  check (
    quantity > 0
    and calories >= 0
    and protein_g >= 0
    and carbs_g >= 0
    and fat_g >= 0
  );

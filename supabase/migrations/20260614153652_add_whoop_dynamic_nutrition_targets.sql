alter table public.whoop_snapshots
  add column if not exists cycle_start timestamptz,
  add column if not exists cycle_end timestamptz,
  add column if not exists cycle_timezone_offset text;

update public.whoop_snapshots
set
  cycle_start = coalesce(cycle_start, nullif(raw_json->'cycle'->>'start', '')::timestamptz),
  cycle_end = coalesce(cycle_end, nullif(raw_json->'cycle'->>'end', '')::timestamptz),
  cycle_timezone_offset = coalesce(cycle_timezone_offset, nullif(raw_json->'cycle'->>'timezone_offset', ''))
where raw_json->'cycle' is not null;

create index if not exists whoop_snapshots_cycle_end_idx
  on public.whoop_snapshots (cycle_end desc)
  where cycle_end is not null;

alter table public.nutrition_day
  add column if not exists base_calories_target int,
  add column if not exists whoop_calories_baseline int,
  add column if not exists whoop_calories_recent int,
  add column if not exists whoop_calorie_adjustment int not null default 0,
  add column if not exists calorie_target_method text not null default 'static';

alter table public.nutrition_day
  drop constraint if exists nutrition_day_calorie_target_method_check;

alter table public.nutrition_day
  add constraint nutrition_day_calorie_target_method_check
  check (calorie_target_method in ('static', 'whoop_rolling_v1'));

update public.nutrition_day
set base_calories_target = calories_target
where base_calories_target is null;;

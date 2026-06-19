alter table public.nutrition_day_types
  add column if not exists base_kcal_target int,
  add column if not exists base_carbs_g numeric(6,1);

update public.nutrition_day_types
set
  base_kcal_target = case key
    when 'hard_training' then 2800
    when 'moderate_training' then 2650
    when 'rest_easy' then 2450
    else kcal_target
  end,
  base_carbs_g = case key
    when 'hard_training' then 360
    when 'moderate_training' then 323
    when 'rest_easy' then 273
    else carbs_g
  end;

alter table public.nutrition_day_types
  alter column base_kcal_target set not null,
  alter column base_carbs_g set not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.populate_whoop_cycle_bounds()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  new.cycle_start := coalesce(
    new.cycle_start,
    nullif(new.raw_json->'cycle'->>'start', '')::timestamptz
  );
  new.cycle_end := coalesce(
    new.cycle_end,
    nullif(new.raw_json->'cycle'->>'end', '')::timestamptz
  );
  new.cycle_timezone_offset := coalesce(
    new.cycle_timezone_offset,
    nullif(new.raw_json->'cycle'->>'timezone_offset', '')
  );
  return new;
end;
$$;

revoke all on function private.populate_whoop_cycle_bounds() from public, anon, authenticated;

drop trigger if exists populate_whoop_cycle_bounds on public.whoop_snapshots;
create trigger populate_whoop_cycle_bounds
before insert or update of raw_json, cycle_start, cycle_end, cycle_timezone_offset
on public.whoop_snapshots
for each row
execute function private.populate_whoop_cycle_bounds();

create or replace function private.refresh_whoop_nutrition_targets()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  completed_cycle_count int;
  baseline_calories numeric;
  recent_calories numeric;
  calorie_adjustment int := 0;
begin
  with normalized as (
    select
      cycle_end,
      (kilojoule / 4.184)
        * (24 / (extract(epoch from (cycle_end - cycle_start)) / 3600))
        as calories_24h
    from public.whoop_snapshots
    where kilojoule is not null
      and cycle_start is not null
      and cycle_end is not null
      and extract(epoch from (cycle_end - cycle_start)) / 3600 between 16 and 36
  ),
  latest as (
    select
      calories_24h,
      row_number() over (order by cycle_end desc) as recency_rank
    from normalized
    where calories_24h between 1000 and 5000
    order by cycle_end desc
    limit 28
  )
  select
    count(*)::int,
    percentile_cont(0.5) within group (order by calories_24h),
    percentile_cont(0.5) within group (order by calories_24h)
      filter (where recency_rank <= 7)
  into completed_cycle_count, baseline_calories, recent_calories
  from latest;

  if completed_cycle_count >= 14 then
    calorie_adjustment := greatest(
      -200,
      least(
        300,
        (round(((recent_calories - baseline_calories) * 0.75) / 50) * 50)::int
      )
    );
  end if;

  update public.nutrition_day_types
  set
    kcal_target = base_kcal_target + calorie_adjustment,
    carbs_g = greatest(0, base_carbs_g + calorie_adjustment / 4.0);
end;
$$;

revoke all on function private.refresh_whoop_nutrition_targets()
from public, anon, authenticated;

create or replace function private.refresh_whoop_nutrition_targets_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.refresh_whoop_nutrition_targets();
  return null;
end;
$$;

revoke all on function private.refresh_whoop_nutrition_targets_trigger()
from public, anon, authenticated;

drop trigger if exists refresh_nutrition_targets_after_whoop_insert
on public.whoop_snapshots;
create trigger refresh_nutrition_targets_after_whoop_insert
after insert on public.whoop_snapshots
for each statement
execute function private.refresh_whoop_nutrition_targets_trigger();

drop trigger if exists refresh_nutrition_targets_after_whoop_update
on public.whoop_snapshots;
create trigger refresh_nutrition_targets_after_whoop_update
after update of kilojoule, cycle_start, cycle_end, raw_json
on public.whoop_snapshots
for each statement
execute function private.refresh_whoop_nutrition_targets_trigger();

select private.refresh_whoop_nutrition_targets();;

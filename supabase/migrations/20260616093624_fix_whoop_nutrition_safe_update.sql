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
    carbs_g = greatest(0, base_carbs_g + calorie_adjustment / 4.0)
  where key in ('hard_training', 'moderate_training', 'rest_easy');
end;
$$;

revoke all on function private.refresh_whoop_nutrition_targets()
from public, anon, authenticated;

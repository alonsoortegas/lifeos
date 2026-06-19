alter table public.nutrition_day
  drop constraint if exists nutrition_day_goal_check;

alter table public.nutrition_day
  add constraint nutrition_day_goal_check
  check (goal in ('cut', 'maintenance', 'bulk', 'race_week'));

alter table public.nutrition_day
  alter column goal set default 'bulk';

update public.nutrition_day_types
set
  label = 'Lift / Conditioning',
  description = 'Higher-carbohydrate lean-bulk target for lifting and conditioning days.',
  kcal_target = 2800,
  protein_g = 160,
  carbs_g = 360,
  fat_g = 80,
  examples = array['upper-body lift', 'lower-body lift', 'strength + conditioning'],
  notes = array[
    'Starting target for the summer bulk.',
    'Prioritize carbohydrates around training.',
    'Adjust all day types by 150 kcal if average bodyweight is flat for two weeks.'
  ]
where key = 'hard_training';

update public.nutrition_day_types
set
  label = 'Easy Cardio',
  description = 'Lean-bulk target for Zone 2 running, easy cycling, or normal active days.',
  kcal_target = 2650,
  protein_g = 160,
  carbs_g = 323,
  fat_g = 80,
  examples = array['Zone 2 run', 'easy bike', 'normal active day'],
  notes = array[
    'Keep cardio conversational and fuel the work.',
    'Do not subtract exercise calories from this target.'
  ]
where key = 'moderate_training';

update public.nutrition_day_types
set
  label = 'Rest / Recovery',
  description = 'Slightly lower-carbohydrate lean-bulk target for full rest and recovery days.',
  kcal_target = 2450,
  protein_g = 160,
  carbs_g = 273,
  fat_g = 80,
  examples = array['full rest', 'walking only', 'recovery day'],
  notes = array[
    'This remains a surplus-oriented recovery target, not a cutting day.',
    'Keep protein stable and reduce carbohydrates rather than protein.'
  ]
where key = 'rest_easy';

update public.nutrition_rules
set rule_text = case sort_order
  when 10 then 'Protein stays near 160g; carbohydrates scale with training load.'
  when 11 then 'Lifting and conditioning days use the highest lean-bulk target.'
  when 12 then 'Rest days remain adequately fueled; they are not deficit days.'
  else rule_text
end
where sort_order in (10, 11, 12);;

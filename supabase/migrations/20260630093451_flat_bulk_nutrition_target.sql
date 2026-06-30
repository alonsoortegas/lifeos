update public.nutrition_day_types
set
  label = 'Bulk Target',
  description = 'Flat daily lean-bulk target used every day, regardless of training load.',
  kcal_target = 2700,
  protein_g = 160,
  carbs_g = 335,
  fat_g = 80,
  examples = array['lifting day', 'cardio day', 'rest day'],
  notes = array[
    'Daily flat target: 2700 kcal, 160g protein, 335g carbs, 80g fat.',
    'Use one target every day; adjust food portions rather than switching day types.',
    'Track rice dry and meat raw.'
  ],
  base_kcal_target = 2700,
  base_carbs_g = 335
where key in ('hard_training', 'moderate_training', 'rest_easy');

update public.nutrition_day
set
  day_type = 'hard',
  goal = 'bulk',
  calories_target = 2700,
  protein_target = 160,
  carbs_target = 335,
  fat_target = 80,
  base_calories_target = 2700,
  whoop_calorie_adjustment = 0,
  calorie_target_method = 'static',
  updated_at = now()
where goal = 'bulk'
  and date >= date '2026-06-29';

update public.nutrition_rules
set rule_text = case sort_order
  when 10 then 'Protein stays near 160g every day.'
  when 11 then 'Use the same 2700 kcal lean-bulk target on lifting, cardio, and rest days.'
  when 12 then 'Adjust portions inside the flat template; do not switch day-type targets.'
  else rule_text
end
where sort_order in (10, 11, 12);

delete from public.nutrition_meal_templates
where day_type_key in ('hard_training', 'moderate_training', 'rest_easy');

with day_types(day_type_key) as (
  values ('hard_training'), ('moderate_training'), ('rest_easy')
),
templates(meal_key, meal_label, sort_order, default_items, notes) as (
  values
    (
      'breakfast',
      'Breakfast',
      10,
      '[
        {"label": "4 eggs", "food_key": "eggs_1", "quantity": 4},
        {"label": "60g oats", "food_key": "oats_60g", "quantity": 1},
        {"label": "berries", "food_key": "berries_1_cup", "quantity": 1}
      ]'::jsonb,
      array['Flat bulk template; adjust portions based on remaining macros.']
    ),
    (
      'midday',
      'Midday',
      20,
      '[
        {"label": "250g skyr/magerquark", "food_key": "skyr_magerquark_250g", "quantity": 1},
        {"label": "banana", "food_key": "banana_1_medium", "quantity": 1},
        {"label": "60g oats", "food_key": "oats_60g", "quantity": 1},
        {"label": "berries", "food_key": "berries_1_cup", "quantity": 1}
      ]'::jsonb,
      array['Protein fixed; carbohydrates support the daily flat target.']
    ),
    (
      'pre_session',
      'Pre-session',
      30,
      '[
        {"label": "banana", "food_key": "banana_1_medium", "quantity": 1},
        {"label": "2 rice cakes", "food_key": "rice_cakes_2", "quantity": 1, "alternatives": ["2 amaranth cakes"]}
      ]'::jsonb,
      array['Use before training when useful; keep the same daily target on non-training days.']
    ),
    (
      'post_session',
      'Post-session',
      40,
      '[
        {"label": "protein shake", "food_key": "protein_shake_1_scoop", "quantity": 1},
        {"label": "banana", "food_key": "banana_1_medium", "quantity": 1, "alternatives": ["2 rice cakes", "2 amaranth cakes"]}
      ]'::jsonb,
      array['Use after training, or move these portions elsewhere on rest days.']
    ),
    (
      'dinner',
      'Dinner',
      50,
      '[
        {"label": "270g raw chicken/turkey", "food_key": "chicken_270g_raw", "quantity": 1, "alternatives": ["270g raw turkey breast", "220g raw lean beef", "tuna"]},
        {"label": "100g dry rice", "food_key": "rice_100g_dry", "quantity": 1},
        {"label": "vegetables", "freeform": true},
        {"label": "15ml olive oil", "food_key": "olive_oil_15ml", "quantity": 1}
      ]'::jsonb,
      array['Track rice dry and meat raw.']
    ),
    (
      'snack',
      'Snack',
      60,
      '[
        {"label": "30g mixed nuts", "food_key": "mixed_nuts_25g", "quantity": 1.3},
        {"label": "1 slice bread", "food_key": "bread_1_slice", "quantity": 1}
      ]'::jsonb,
      array['Use small carb/fat portions to finish the daily flat target.']
    )
)
insert into public.nutrition_meal_templates (
  day_type_key, meal_key, meal_label, sort_order, default_items, notes
)
select
  day_types.day_type_key,
  templates.meal_key,
  templates.meal_label,
  templates.sort_order,
  templates.default_items,
  templates.notes
from day_types
cross join templates;

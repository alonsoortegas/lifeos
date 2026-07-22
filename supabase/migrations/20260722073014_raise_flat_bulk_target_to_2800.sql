update public.nutrition_day_types
set
  kcal_target = 2800,
  protein_g = 160,
  carbs_g = 360,
  fat_g = 80,
  notes = array[
    'Daily flat target: 2800 kcal, 160g protein, 360g carbs, 80g fat.',
    'Use one target every day; adjust food portions rather than switching day types.',
    'Track rice dry and meat raw.'
  ],
  base_kcal_target = 2800,
  base_carbs_g = 360
where key in ('hard_training', 'moderate_training', 'rest_easy');

update public.nutrition_day
set
  calories_target = 2800,
  protein_target = 160,
  carbs_target = 360,
  fat_target = 80,
  base_calories_target = 2800,
  whoop_calorie_adjustment = 0,
  calorie_target_method = 'static',
  updated_at = now()
where goal = 'bulk'
  and date >= current_date;

update public.nutrition_rules
set rule_text = 'Use the same 2800 kcal lean-bulk target on lifting, cardio, and rest days.'
where sort_order = 11;

with templates(meal_key, default_items, notes) as (
  values
    (
      'breakfast',
      '[
        {"label": "4 eggs", "food_key": "eggs_1", "quantity": 4},
        {"label": "3 slices Vollkornbrot", "food_key": "vollkornbrot_1_slice", "quantity": 3}
      ]'::jsonb,
      array['Flat bulk template; app and DB reference totals align to roughly 2800 kcal.']
    ),
    (
      'midday',
      '[
        {"label": "1 cup skyr/magerquark", "food_key": "skyr_magerquark_245g", "quantity": 1},
        {"label": "1 banana", "food_key": "banana_1_medium", "quantity": 1},
        {"label": "3/4 cup dry oats", "food_key": "oats_60g", "quantity": 1},
        {"label": "berries", "food_key": "berries_1_cup", "quantity": 1}
      ]'::jsonb,
      array['Protein fixed; carbohydrates support the daily flat target.']
    ),
    (
      'pre_session',
      '[
        {"label": "1 banana", "food_key": "banana_1_medium", "quantity": 1},
        {"label": "2 rice cakes", "food_key": "rice_cakes_2", "quantity": 1, "alternatives": ["2 amaranth cakes"]}
      ]'::jsonb,
      array['Use before training when useful; move these portions elsewhere on non-training days.']
    ),
    (
      'post_session',
      '[
        {"label": "1 scoop protein", "food_key": "protein_shake_1_scoop", "quantity": 1},
        {"label": "1 banana", "food_key": "banana_1_medium", "quantity": 1, "alternatives": ["2 rice cakes", "2 amaranth cakes"]}
      ]'::jsonb,
      array['Use after training, or move these portions elsewhere on rest days.']
    ),
    (
      'dinner',
      '[
        {"label": "270g raw chicken/turkey", "food_key": "chicken_270g_raw", "quantity": 1, "alternatives": ["270g raw turkey breast", "220g raw lean beef", "tuna"]},
        {"label": "1/2 cup dry rice, 100g dry pasta, or 420g raw potatoes", "food_key": "rice_100g_dry", "quantity": 1, "alternatives": ["100g dry pasta", "420g raw potatoes"]},
        {"label": "vegetables", "food_key": "vegetables_1_serving", "quantity": 1},
        {"label": "15ml olive oil", "food_key": "olive_oil_15ml", "quantity": 1}
      ]'::jsonb,
      array['Track rice and pasta dry; track potatoes and meat raw.']
    ),
    (
      'snack',
      '[
        {"label": "30g mixed nuts", "food_key": "mixed_nuts_25g", "quantity": 1.3},
        {"label": "1/4 cup granola", "food_key": "granola_30g", "quantity": 1},
        {"label": "1 slice bread", "food_key": "bread_1_slice", "quantity": 1},
        {"label": "2 rice cakes", "food_key": "rice_cakes_2", "quantity": 1}
      ]'::jsonb,
      array['Use small carb/fat portions to finish the daily flat target.']
    )
)
update public.nutrition_meal_templates as meal
set
  default_items = templates.default_items,
  notes = templates.notes
from templates
where meal.day_type_key in ('hard_training', 'moderate_training', 'rest_easy')
  and meal.meal_key = templates.meal_key;

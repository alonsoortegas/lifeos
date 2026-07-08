insert into public.food_item (
  name, category, portion_label, grams, calories, protein_g, carbs_g, fat_g, tracking_unit, notes
) values
  (
    'Dry pasta 100g',
    'carb',
    '100g dry',
    100,
    360,
    13,
    75,
    1.5,
    'grams',
    'Large starchy carb block; dinner equivalent for 1/2 cup dry rice.'
  ),
  (
    'Raw potatoes 250g',
    'carb',
    '250g raw',
    250,
    190,
    5,
    43,
    0,
    'grams',
    'Use 1.67 portions for roughly 420g raw potatoes, equivalent to the dinner rice block.'
  )
on conflict (name) do update set
  category = excluded.category,
  portion_label = excluded.portion_label,
  grams = excluded.grams,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  tracking_unit = excluded.tracking_unit,
  notes = excluded.notes;

insert into public.food_substitution_group (name, macro_type, target_macro_g, notes) values
  (
    'carb_70g_starchy',
    'carb',
    72,
    'Large starchy carb block: 1/2 cup dry rice, 100g dry pasta, 420g raw potatoes, or 1 1/4 cups dry oats. Does not include single bananas.'
  )
on conflict (name) do update set
  macro_type = excluded.macro_type,
  target_macro_g = excluded.target_macro_g,
  notes = excluded.notes;

insert into public.food_substitution_group_item (substitution_group_id, food_item_id, quantity, label)
select g.id, f.id, v.quantity, v.label
from (values
  ('Dry pasta 100g', 1::numeric, '100g dry pasta'),
  ('Raw potatoes 250g', 1.67::numeric, '420g raw potatoes')
) as v(food_name, quantity, label)
join public.food_substitution_group g on g.name = 'carb_70g_starchy'
join public.food_item f on f.name = v.food_name
on conflict (substitution_group_id, food_item_id, label) do update set
  quantity = excluded.quantity;

insert into public.nutrition_food_portions (
  food_key, label, portion_label, raw_weight_g, cooked_weight_g, protein_g, carbs_g, fat_g, notes, equivalence_group
) values
  ('eggs_1', 'Whole egg', '1 whole egg', 50, null, 6, 0.4, 5, null, 'fats'),
  ('protein_shake_1_scoop', 'Protein shake', '1 scoop', 30, null, 25, 2, 1.5, null, 'protein_dairy'),
  ('skyr_magerquark_245g', 'Skyr or Magerquark', '245g skyr/magerquark', 245, null, 22, 10, 0.5, null, 'protein_dairy'),
  ('oats_60g', 'Oats dry', '60g dry oats', 60, null, 7.5, 45, 4.5, null, 'carbs_starchy'),
  ('rice_100g_dry', 'Rice dry', '1/2 cup dry rice', 100, null, 6, 72, 1, 'Track dry, before cooking.', 'carbs_starchy'),
  ('pasta_100g_dry', 'Pasta dry', '100g dry pasta', 100, null, 13, 75, 1.5, 'Track dry, before cooking. Dinner equivalent for 100g dry rice.', 'carbs_starchy'),
  ('potatoes_420g_raw', 'Potatoes', '420g raw potatoes', 420, null, 8, 72, 0, 'Track raw weight. Dinner equivalent for 100g dry rice.', 'carbs_starchy'),
  ('vollkornbrot_1_slice', 'Vollkornbrot', '1 slice Vollkornbrot', 45, null, 3, 13, 1.5, null, 'carbs_starchy'),
  ('bread_1_slice', 'Bread', '1 slice bread', 35, null, 3, 15, 1, null, 'carbs_starchy'),
  ('banana_1_medium', 'Banana', '1 medium banana', 120, null, 1.3, 27, 0.4, null, 'carbs_fast'),
  ('rice_cakes_2', 'Rice cakes', '2 rice cakes', 18, null, 1.4, 15, 0.5, null, 'carbs_fast'),
  ('berries_1_cup', 'Berries', '1 cup berries', 140, null, 1, 17, 0.5, null, 'fruit'),
  ('chicken_270g_raw', 'Chicken breast', '270g raw chicken breast', 270, 200, 50, 0, 6, 'Track raw, using package weight.', 'lean_protein'),
  ('mixed_nuts_25g', 'Mixed nuts', '25g mixed nuts', 25, null, 5, 5, 15, null, 'fats'),
  ('granola_30g', 'Granola', '30g granola', 30, null, 3, 20, 5, null, 'carbs_starchy'),
  ('vegetables_1_serving', 'Vegetables', '1 serving vegetables', 180, null, 3, 12, 0.5, 'Loose tracking portion for dinner vegetables.', 'carbs_starchy'),
  ('olive_oil_15ml', 'Olive oil', '15ml olive oil', 14, null, 0, 0, 14, null, 'fats')
on conflict (food_key) do update set
  label = excluded.label,
  portion_label = excluded.portion_label,
  raw_weight_g = excluded.raw_weight_g,
  cooked_weight_g = excluded.cooked_weight_g,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  notes = excluded.notes,
  equivalence_group = excluded.equivalence_group;

update public.nutrition_equivalence_groups
set
  examples = array['rice', 'pasta', 'potatoes', 'oats', 'bread', 'Vollkornbrot'],
  notes = array['When swapping starchy carbs, match primarily by carbs_g. Track rice, pasta, and oats dry; track potatoes raw.']
where key = 'carbs_starchy';

with templates(meal_key, default_items, notes) as (
  values
    (
      'breakfast',
      '[
        {"label": "4 eggs", "food_key": "eggs_1", "quantity": 4},
        {"label": "3 slices Vollkornbrot", "food_key": "vollkornbrot_1_slice", "quantity": 3}
      ]'::jsonb,
      array['Flat bulk template; app and DB reference totals align to roughly 2700 kcal.']
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
        {"label": "1 slice bread", "food_key": "bread_1_slice", "quantity": 1}
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

update public.food_item
set
  name = 'Dry pasta 125g',
  portion_label = '125g dry',
  grams = 125,
  calories = 450,
  protein_g = 16.3,
  carbs_g = 93.8,
  fat_g = 1.9,
  notes = 'Dinner pasta portion. Track dry, before cooking.'
where name = 'Dry pasta 100g';

update public.food_substitution_group_item as item
set label = '125g dry pasta'
from public.food_substitution_group as group_row,
  public.food_item as food
where item.substitution_group_id = group_row.id
  and food.id = item.food_item_id
  and group_row.name = 'carb_70g_starchy'
  and food.name = 'Dry pasta 125g';

update public.food_substitution_group
set notes = 'Dinner carb choices: 1/2 cup dry rice, 125g dry pasta, 420g raw potatoes, or 1 1/4 cups dry oats. Does not include single bananas.'
where name = 'carb_70g_starchy';

update public.nutrition_food_portions
set
  food_key = 'pasta_125g_dry',
  label = 'Pasta dry',
  portion_label = '125g dry pasta',
  raw_weight_g = 125,
  protein_g = 16.3,
  carbs_g = 93.8,
  fat_g = 1.9,
  notes = 'Track dry, before cooking. Dinner pasta portion.'
where food_key = 'pasta_100g_dry';

update public.nutrition_meal_templates
set default_items = jsonb_set(
  jsonb_set(
    default_items,
    '{1,label}',
    to_jsonb('1/2 cup dry rice, 125g dry pasta, or 420g raw potatoes'::text),
    true
  ),
  '{1,alternatives}',
  '["125g dry pasta", "420g raw potatoes"]'::jsonb,
  true
)
where meal_key = 'dinner'
  and default_items -> 1 ->> 'food_key' = 'rice_100g_dry';

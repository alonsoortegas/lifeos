delete from nutrition_meal_templates;
delete from nutrition_rules;
delete from nutrition_food_portions;
delete from nutrition_equivalence_groups;
delete from nutrition_day_types;
insert into nutrition_day_types (key, label, description, kcal_target, protein_g, carbs_g, fat_g, examples, notes) values
  (
    'hard_training',
    'Hard Training',
    'High-load carb cycling day for HYROX, intervals, long runs, and simulations.',
    2500,
    165,
    285,
    75,
    array['HYROX', 'intervals', 'long run', 'simulation'],
    array['Do not aggressively cut on this day.']
  ),
  (
    'moderate_training',
    'Moderate Training',
    'Moderate carb day for strength, easy gym, and normal active days.',
    2250,
    165,
    220,
    75,
    array['strength', 'easy gym', 'normal active day'],
    array['Moderate carbs, protein fixed.']
  ),
  (
    'rest_easy',
    'Rest / Easy',
    'Lower carb day for rest, walking-only days, or easy runs.',
    1950,
    165,
    150,
    70,
    array['rest day', 'walking only', 'easy run'],
    array['This is where most of the weekly deficit happens, but not zero-carb.']
  );
insert into nutrition_equivalence_groups (key, label, compare_macro, examples, notes) values
  ('carbs_fast', 'Fast carbs', 'carbs', array['banana', 'rice cakes', 'amaranth cakes'], array['When swapping fast carbs, match primarily by carbs_g.']),
  ('carbs_starchy', 'Starchy carbs', 'carbs', array['rice', 'oats', 'bread', 'tortillas', 'potatoes'], array['When swapping starchy carbs, match primarily by carbs_g. Track rice dry, before cooking.']),
  ('lean_protein', 'Lean protein', 'protein', array['chicken breast', 'turkey breast', 'lean beef', 'tuna'], array['When swapping lean proteins, match primarily by protein_g. Track meat raw, using package weight.']),
  ('protein_dairy', 'Protein / dairy', 'protein', array['skyr', 'magerquark', 'protein shake'], array['Use to close protein gaps.']),
  ('fats', 'Fats', 'fat', array['olive oil', 'mixed nuts', 'avocado', 'whole eggs'], array['When swapping fats, match primarily by fat_g. Account for nuts and eggs also adding protein/carbs.']),
  ('fruit', 'Fruit', 'carbs', array['berries', 'banana'], array['Template fruit portions; compare mainly by carbs_g.']);
insert into nutrition_food_portions (
  food_key, label, portion_label, raw_weight_g, cooked_weight_g, protein_g, carbs_g, fat_g, notes, equivalence_group
) values
  ('eggs_1', 'Whole egg', '1 whole egg', 50, null, 6, 0, 5, null, 'fats'),
  ('protein_shake_1_scoop', 'Protein shake', '1 scoop', 30, null, 25, 3, 2, null, 'protein_dairy'),
  ('skyr_magerquark_250g', 'Skyr or Magerquark', '250g skyr/magerquark', 250, null, 25, 11, 0, null, 'protein_dairy'),
  ('skyr_magerquark_125g', 'Skyr or Magerquark', '125g skyr/magerquark', 125, null, 12.5, 5.5, 0, 'Optional half portion if protein is low.', 'protein_dairy'),
  ('oats_20g', 'Oats dry', '20g dry oats', 20, null, 3, 15, 2, null, 'carbs_starchy'),
  ('oats_40g', 'Oats dry', '40g dry oats', 40, null, 5, 27, 3, null, 'carbs_starchy'),
  ('oats_60g', 'Oats dry', '60g dry oats', 60, null, 8, 40, 4, null, 'carbs_starchy'),
  ('rice_65g_dry', 'Rice dry', '65g dry rice', 65, null, 5, 47, 1, 'Track dry, before cooking.', 'carbs_starchy'),
  ('rice_100g_dry', 'Rice dry', '100g dry rice', 100, null, 7, 72, 1, 'Track dry, before cooking.', 'carbs_starchy'),
  ('bread_1_slice', 'Bread', '1 slice bread', 35, null, 3, 15, 1, null, 'carbs_starchy'),
  ('tortilla_1_small', 'Tortilla', '1 small tortilla', 35, null, 3, 15, 2, null, 'carbs_starchy'),
  ('potatoes_250g_raw', 'Potatoes', '250g raw potatoes', 250, null, 5, 43, 0, null, 'carbs_starchy'),
  ('banana_1_medium', 'Banana', '1 medium banana', 120, null, 1, 27, 0, null, 'carbs_fast'),
  ('rice_cakes_2', 'Rice cakes', '2 rice cakes', 18, null, 1, 15, 0, null, 'carbs_fast'),
  ('amaranth_cakes_2', 'Amaranth cakes', '2 amaranth cakes', 18, null, 2, 14, 1, null, 'carbs_fast'),
  ('berries_1_cup', 'Berries', '1 cup berries', 140, null, 1, 14, 0, null, 'fruit'),
  ('chicken_270g_raw', 'Chicken breast', '270g raw chicken breast', 270, 200, 50, 0, 8, 'Track raw, using package weight.', 'lean_protein'),
  ('chicken_250g_raw', 'Chicken breast', '250g raw chicken breast', 250, 185, 46, 0, 7, 'Track raw, using package weight.', 'lean_protein'),
  ('turkey_270g_raw', 'Turkey breast', '270g raw turkey breast', 270, 200, 50, 0, 4, 'Track raw, using package weight.', 'lean_protein'),
  ('lean_beef_220g_raw', 'Lean beef', '220g raw lean beef', 220, 175, 45, 0, 12, 'Track raw, using package weight.', 'lean_protein'),
  ('tuna_1_can', 'Tuna', '1 drained can tuna', 140, null, 32, 0, 1, null, 'lean_protein'),
  ('mixed_nuts_25g', 'Mixed nuts', '25g mixed nuts', 25, null, 5, 5, 15, null, 'fats'),
  ('olive_oil_15ml', 'Olive oil', '15ml olive oil', 14, null, 0, 0, 14, null, 'fats'),
  ('avocado_100g', 'Avocado', '100g avocado', 100, null, 2, 9, 15, null, 'fats');
insert into nutrition_meal_templates (day_type_key, meal_key, meal_label, sort_order, default_items, notes) values
  (
    'rest_easy',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":4,"label":"4 eggs"},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake"},
      {"food_key":"oats_20g","quantity":1,"label":"20g oats"},
      {"food_key":"berries_1_cup","quantity":1,"label":"berries"}
    ]'::jsonb,
    array['Template only; adjust portions based on remaining macros.']
  ),
  (
    'rest_easy',
    'lunch',
    'Lunch',
    20,
    '[
      {"food_key":"skyr_magerquark_250g","quantity":1,"label":"250g skyr/magerquark"},
      {"food_key":"banana_1_medium","quantity":1,"label":"banana"},
      {"food_key":"mixed_nuts_25g","quantity":1,"label":"25g mixed nuts"}
    ]'::jsonb,
    array['Not zero-carb; keep protein high.']
  ),
  (
    'rest_easy',
    'dinner',
    'Dinner',
    30,
    '[
      {"food_key":"chicken_250g_raw","quantity":1,"label":"250-270g raw chicken","alternatives":["270g raw chicken breast","270g raw turkey breast","220g raw lean beef","tuna"]},
      {"food_key":"rice_65g_dry","quantity":1,"label":"65g dry rice"},
      {"label":"vegetables","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil"}
    ]'::jsonb,
    array['Track rice dry and meat raw.']
  ),
  (
    'rest_easy',
    'optional',
    'Optional',
    40,
    '[
      {"food_key":"skyr_magerquark_125g","quantity":1,"label":"extra magerquark","optional":true},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"protein shake","optional":true}
    ]'::jsonb,
    array['Use only if protein is low.']
  ),
  (
    'moderate_training',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":4,"label":"4 eggs"},
      {"food_key":"oats_40g","quantity":1,"label":"40g oats"},
      {"food_key":"berries_1_cup","quantity":1,"label":"berries"}
    ]'::jsonb,
    array['Template only; adjust portions based on remaining macros.']
  ),
  (
    'moderate_training',
    'lunch',
    'Lunch',
    20,
    '[
      {"food_key":"skyr_magerquark_250g","quantity":1,"label":"250g skyr/magerquark"},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"protein shake"},
      {"food_key":"banana_1_medium","quantity":1,"label":"banana"},
      {"food_key":"bread_1_slice","quantity":1,"label":"bread or tortillas","alternatives":["1 small tortilla"]}
    ]'::jsonb,
    array['Moderate carbs, protein fixed.']
  ),
  (
    'moderate_training',
    'snack',
    'Snack',
    30,
    '[{"food_key":"mixed_nuts_25g","quantity":1,"label":"25g mixed nuts"}]'::jsonb,
    '{}'::text[]
  ),
  (
    'moderate_training',
    'dinner',
    'Dinner',
    40,
    '[
      {"food_key":"chicken_250g_raw","quantity":1,"label":"250-270g raw chicken","alternatives":["270g raw chicken breast","270g raw turkey breast","220g raw lean beef","tuna"]},
      {"food_key":"rice_65g_dry","quantity":1,"label":"65-100g dry rice","alternatives":["100g dry rice depending remaining carbs"]},
      {"label":"vegetables","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil"}
    ]'::jsonb,
    array['Track rice dry and meat raw.']
  ),
  (
    'moderate_training',
    'optional',
    'Optional',
    50,
    '[{"food_key":"protein_shake_1_scoop","quantity":1,"label":"post-session protein shake","optional":true}]'::jsonb,
    array['Use after training if protein is low.']
  ),
  (
    'hard_training',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":5,"label":"5 eggs"},
      {"food_key":"oats_60g","quantity":1,"label":"60g oats"},
      {"food_key":"berries_1_cup","quantity":1,"label":"berries"}
    ]'::jsonb,
    array['Do not aggressively cut on hard days.']
  ),
  (
    'hard_training',
    'lunch_pre_training',
    'Lunch / pre-training meal',
    20,
    '[
      {"food_key":"skyr_magerquark_250g","quantity":1,"label":"250g skyr/magerquark"},
      {"food_key":"rice_100g_dry","quantity":1,"label":"100g dry rice or equivalent carbs","alternatives":["oats","bread","tortillas","potatoes"]}
    ]'::jsonb,
    array['Prioritize carbs before hard sessions.']
  ),
  (
    'hard_training',
    'pre_session',
    'Pre-session',
    30,
    '[
      {"food_key":"banana_1_medium","quantity":1,"label":"banana","alternatives":["2 rice cakes","2 amaranth cakes"]}
    ]'::jsonb,
    array['Use 60-90 minutes before training.']
  ),
  (
    'hard_training',
    'post_session',
    'Post-session',
    40,
    '[
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"protein shake"},
      {"food_key":"banana_1_medium","quantity":1,"label":"banana","alternatives":["2 rice cakes","2 amaranth cakes"]}
    ]'::jsonb,
    array['Use after hard sessions.']
  ),
  (
    'hard_training',
    'dinner',
    'Dinner',
    50,
    '[
      {"food_key":"chicken_250g_raw","quantity":1,"label":"250-270g raw chicken","alternatives":["270g raw chicken breast","270g raw turkey breast","220g raw lean beef","tuna"]},
      {"food_key":"rice_100g_dry","quantity":1,"label":"100g dry rice"},
      {"label":"vegetables","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil"}
    ]'::jsonb,
    array['Track rice dry and meat raw.']
  );
insert into nutrition_rules (sort_order, rule_text) values
  (1, 'Track rice dry, before cooking.'),
  (2, 'Track meat raw, using package weight.'),
  (3, 'Let users swap foods inside the same equivalence group.'),
  (4, 'When swapping carbs, match primarily by carbs_g.'),
  (5, 'When swapping proteins, match primarily by protein_g.'),
  (6, 'When swapping fats, match primarily by fat_g.'),
  (7, 'Show remaining protein, carbs, fat, and calories after each logged meal.'),
  (8, 'Do not hard-code sample days as exact required meals.'),
  (9, 'Use sample days as templates only.'),
  (10, 'Protein stays fixed; carbs scale with training load.'),
  (11, 'Hard training days are not aggressive deficit days.'),
  (12, 'Rest/easy days create most of the weekly deficit, but are not zero-carb.');

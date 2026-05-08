create table if not exists nutrition_day_types (
  id            bigint primary key generated always as identity,
  key           text not null unique,
  label         text not null,
  description   text,
  kcal_target   int not null,
  protein_g     numeric(6,1) not null,
  carbs_g       numeric(6,1) not null,
  fat_g         numeric(6,1) not null,
  examples      text[] not null default '{}',
  notes         text[] not null default '{}'
);

create table if not exists nutrition_food_portions (
  id                  bigint primary key generated always as identity,
  food_key            text not null unique,
  label               text not null,
  portion_label       text not null,
  raw_weight_g        numeric(7,1),
  cooked_weight_g     numeric(7,1),
  protein_g           numeric(6,1) not null default 0,
  carbs_g             numeric(6,1) not null default 0,
  fat_g               numeric(6,1) not null default 0,
  notes               text,
  equivalence_group   text not null
);

create table if not exists nutrition_meal_templates (
  id             bigint primary key generated always as identity,
  day_type_key   text not null references nutrition_day_types(key) on delete cascade,
  meal_key       text not null,
  meal_label     text not null,
  sort_order     int not null,
  default_items  jsonb not null default '[]'::jsonb,
  notes          text[] not null default '{}',
  unique (day_type_key, meal_key)
);

create table if not exists nutrition_rules (
  id          bigint primary key generated always as identity,
  sort_order  int not null unique,
  rule_text   text not null
);

create table if not exists nutrition_equivalence_groups (
  id             bigint primary key generated always as identity,
  key            text not null unique,
  label          text not null,
  compare_macro  text not null check (compare_macro in ('protein', 'carbs', 'fat')),
  examples       text[] not null default '{}',
  notes          text[] not null default '{}'
);

alter table nutrition_day_types enable row level security;
alter table nutrition_food_portions enable row level security;
alter table nutrition_meal_templates enable row level security;
alter table nutrition_rules enable row level security;
alter table nutrition_equivalence_groups enable row level security;

drop policy if exists "anon_all_nutrition_day_types" on nutrition_day_types;
drop policy if exists "anon_all_nutrition_food_portions" on nutrition_food_portions;
drop policy if exists "anon_all_nutrition_meal_templates" on nutrition_meal_templates;
drop policy if exists "anon_all_nutrition_rules" on nutrition_rules;
drop policy if exists "anon_all_nutrition_equivalence_groups" on nutrition_equivalence_groups;

create policy "anon_all_nutrition_day_types" on nutrition_day_types for all using (true) with check (true);
create policy "anon_all_nutrition_food_portions" on nutrition_food_portions for all using (true) with check (true);
create policy "anon_all_nutrition_meal_templates" on nutrition_meal_templates for all using (true) with check (true);
create policy "anon_all_nutrition_rules" on nutrition_rules for all using (true) with check (true);
create policy "anon_all_nutrition_equivalence_groups" on nutrition_equivalence_groups for all using (true) with check (true);

insert into nutrition_day_types (key, label, description, kcal_target, protein_g, carbs_g, fat_g, examples, notes) values
  (
    'hard_training',
    'Hard Training',
    'High-load training day where the deficit should not be forced.',
    2500,
    165,
    290,
    65,
    array['Tue PM HYROX', 'Thu intervals', 'Sat simulation or long run'],
    array[
      'Eat close to maintenance.',
      'Prioritize carbs before and after training.',
      'Do not create the deficit on hard training days.'
    ]
  ),
  (
    'moderate_training',
    'Moderate Training',
    'Normal strength or lower-load training day with moderate carbs.',
    2200,
    165,
    220,
    65,
    array['Mon strength', 'Wed strength', 'Thu AM gym'],
    array[
      'Moderate carbs.',
      'Post-session protein is enough for normal strength days.',
      'Pre-session banana is optional, not required.'
    ]
  ),
  (
    'rest_easy',
    'Rest / Easy',
    'Rest, easy run, or low-load day where most weekly deficit is created.',
    1950,
    165,
    160,
    60,
    array['Sunday', 'easy run only', 'low-load days'],
    array[
      'Build most of the weekly deficit here.',
      'Keep protein high.',
      'Do not let fat drop below 50g/day.',
      'Carbs are lower than training days but should not be extremely low.'
    ]
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  kcal_target = excluded.kcal_target,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  examples = excluded.examples,
  notes = excluded.notes;

insert into nutrition_food_portions (
  food_key, label, portion_label, raw_weight_g, cooked_weight_g, protein_g, carbs_g, fat_g, notes, equivalence_group
) values
  ('eggs_1', 'Egg', '1 whole egg', 50, null, 6, 0, 5, null, 'protein_fat'),
  ('protein_shake_1_scoop', 'Protein shake', '1 scoop', 30, null, 25, 3, 2, null, 'protein'),
  ('oats_20g', 'Oats dry', '1/4 cup dry oats', 20, null, 3, 15, 2, null, 'carbs_starchy'),
  ('oats_40g', 'Oats dry', '1/2 cup dry oats', 40, null, 5, 27, 3, null, 'carbs_starchy'),
  ('oats_60g', 'Oats dry', '3/4 cup dry oats', 60, null, 8, 40, 4, null, 'carbs_starchy'),
  ('rice_65g_dry', 'Rice dry', '1/3 cup dry rice', 65, null, 5, 47, 1, 'Track dry, before cooking.', 'carbs_starchy'),
  ('rice_100g_dry', 'Rice dry', '1/2 cup dry rice', 100, null, 7, 72, 1, 'Track dry, before cooking.', 'carbs_starchy'),
  ('skyr_220g', 'Skyr or Magerquark', '1 cup', 220, null, 22, 10, 0, null, 'protein'),
  ('chicken_270g_raw', 'Chicken breast', '270g raw chicken breast', 270, 200, 50, 0, 8, 'Track raw package weight.', 'lean_protein'),
  ('chicken_200g_raw', 'Chicken breast', '200g raw chicken breast', 200, 150, 38, 0, 6, 'Track raw package weight.', 'lean_protein'),
  ('lean_beef_220g_raw', 'Lean beef', '220g raw lean beef', 220, 175, 45, 0, 12, 'Track raw package weight.', 'lean_protein'),
  ('banana_1_medium', 'Banana', '1 medium banana', 120, null, 1, 27, 0, null, 'carbs_fast'),
  ('berries_1_cup', 'Berries', '1 cup berries', 140, null, 1, 14, 0, null, 'fruit'),
  ('mixed_nuts_25g', 'Mixed nuts', '25g mixed nuts', 25, null, 5, 5, 15, null, 'fats'),
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

insert into nutrition_equivalence_groups (key, label, compare_macro, examples, notes) values
  ('carbs_fast', 'Fast carbs', 'carbs', array['banana', 'rice cakes'], array['Compare mainly by carbs.']),
  ('carbs_starchy', 'Starchy carbs', 'carbs', array['rice', 'oats', 'bread', 'tortilla', 'potatoes'], array['If replacing rice with tortilla or bread, match mainly by carbs.']),
  ('lean_protein', 'Lean protein', 'protein', array['chicken breast', 'turkey breast', 'lean beef', 'tuna'], array['If replacing chicken with tuna, match mainly by protein.']),
  ('protein', 'Protein', 'protein', array['skyr', 'magerquark', 'protein shake'], array['Use when the goal is to close a protein gap.']),
  ('fats', 'Fats', 'fat', array['olive oil', 'nuts', 'avocado'], array['If replacing olive oil with nuts, match mainly by fat but account for nuts also adding protein/carbs.']),
  ('fruit', 'Fruit', 'carbs', array['berries', 'banana'], array['Compare mainly by carbs, but berries are lower and more flexible.']),
  ('protein_fat', 'Protein plus fat', 'protein', array['eggs'], array['Eggs count toward both protein and fat.'])
on conflict (key) do update set
  label = excluded.label,
  compare_macro = excluded.compare_macro,
  examples = excluded.examples,
  notes = excluded.notes;

insert into nutrition_meal_templates (day_type_key, meal_key, meal_label, sort_order, default_items, notes) values
  (
    'hard_training',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":5,"label":"5 eggs"},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake"},
      {"food_key":"oats_60g","quantity":1,"label":"60g dry oats"},
      {"food_key":"berries_1_cup","quantity":1,"label":"1 cup berries"}
    ]'::jsonb,
    '{}'::text[]
  ),
  (
    'hard_training',
    'midday',
    'Midday',
    20,
    '[
      {"food_key":"skyr_220g","quantity":1,"label":"1 cup skyr or magerquark"},
      {"food_key":"rice_65g_dry","quantity":1,"label":"65g dry rice","alternatives":["1 banana + 1/4 cup granola"]},
      {"label":"salad/raw veggies","freeform":true}
    ]'::jsonb,
    '{}'::text[]
  ),
  (
    'hard_training',
    'pre_session',
    'Pre-session',
    30,
    '[
      {"food_key":"banana_1_medium","quantity":1,"label":"1 banana","alternatives":["2 rice cakes"]}
    ]'::jsonb,
    array['Eat 60-90 min before a hard session.']
  ),
  (
    'hard_training',
    'post_session',
    'Post-session',
    40,
    '[
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake"},
      {"food_key":"banana_1_medium","quantity":1,"label":"1 banana","alternatives":["2 rice cakes"]}
    ]'::jsonb,
    array['Use within 45 min after hard sessions.']
  ),
  (
    'hard_training',
    'dinner',
    'Dinner',
    50,
    '[
      {"food_key":"chicken_270g_raw","quantity":1,"label":"270g raw chicken breast","alternatives":["220g raw lean beef"]},
      {"food_key":"rice_100g_dry","quantity":1,"label":"100g dry rice"},
      {"label":"roasted veggies","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil","optional":true}
    ]'::jsonb,
    array['Use olive oil if fat target is not reached.']
  ),
  (
    'moderate_training',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":4,"label":"4 eggs"},
      {"food_key":"oats_40g","quantity":1,"label":"40g dry oats"},
      {"food_key":"berries_1_cup","quantity":1,"label":"1 cup berries"}
    ]'::jsonb,
    '{}'::text[]
  ),
  (
    'moderate_training',
    'midday',
    'Midday',
    20,
    '[
      {"food_key":"skyr_220g","quantity":1,"label":"1 cup skyr or magerquark"},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake"},
      {"food_key":"banana_1_medium","quantity":1,"label":"1 banana"},
      {"label":"salad/raw veggies","freeform":true}
    ]'::jsonb,
    '{}'::text[]
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
    'post_session',
    'Post-session',
    40,
    '[{"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake","optional":true}]'::jsonb,
    array['Use if protein target is not reached.']
  ),
  (
    'moderate_training',
    'dinner',
    'Dinner',
    50,
    '[
      {"food_key":"chicken_270g_raw","quantity":1,"label":"270g raw chicken breast","alternatives":["220g raw lean beef"]},
      {"food_key":"rice_65g_dry","quantity":1,"label":"65g dry rice","alternatives":["100g dry rice depending remaining carbs"]},
      {"label":"roasted veggies","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil","optional":true}
    ]'::jsonb,
    array['Use olive oil if fat target is not reached.']
  ),
  (
    'rest_easy',
    'breakfast',
    'Breakfast',
    10,
    '[
      {"food_key":"eggs_1","quantity":4,"label":"4 eggs"},
      {"food_key":"protein_shake_1_scoop","quantity":1,"label":"1 protein shake"},
      {"food_key":"oats_20g","quantity":1,"label":"20g dry oats"}
    ]'::jsonb,
    '{}'::text[]
  ),
  (
    'rest_easy',
    'midday',
    'Midday',
    20,
    '[
      {"food_key":"skyr_220g","quantity":1,"label":"1 cup skyr or magerquark"},
      {"food_key":"berries_1_cup","quantity":1,"label":"1 cup berries"},
      {"food_key":"rice_65g_dry","quantity":1,"label":"65g dry rice","optional":true}
    ]'::jsonb,
    array['Add rice only if carbs are too low.']
  ),
  (
    'rest_easy',
    'snack',
    'Snack',
    30,
    '[
      {"food_key":"mixed_nuts_25g","quantity":1,"label":"25g mixed nuts"},
      {"food_key":"skyr_220g","quantity":0.5,"label":"extra 1/2 cup magerquark","optional":true}
    ]'::jsonb,
    array['Use extra magerquark if protein is too low.']
  ),
  (
    'rest_easy',
    'dinner',
    'Dinner',
    40,
    '[
      {"food_key":"chicken_270g_raw","quantity":1,"label":"270g raw chicken breast","alternatives":["220g raw lean beef"]},
      {"label":"roasted veggies","freeform":true},
      {"food_key":"olive_oil_15ml","quantity":1,"label":"15ml olive oil","optional":true}
    ]'::jsonb,
    array['Use olive oil if fat is below 50g.']
  )
on conflict (day_type_key, meal_key) do update set
  meal_label = excluded.meal_label,
  sort_order = excluded.sort_order,
  default_items = excluded.default_items,
  notes = excluded.notes;

insert into nutrition_rules (sort_order, rule_text) values
  (1, 'Protein target is fixed every day: 160-170g minimum.'),
  (2, 'Carbs scale with training load.'),
  (3, 'Hard training days should not be aggressive deficit days.'),
  (4, 'Rest/easy days create most of the weekly deficit.'),
  (5, 'Fat should not go below 50g/day.'),
  (6, 'Rice must be tracked dry, before cooking.'),
  (7, 'Meat must be tracked raw, using package weight.'),
  (8, 'Race week: remove the deficit and target practical maintenance, around 2600-2800 kcal/day.'),
  (9, 'Pre hard session: 1 banana or 2 rice cakes 60-90 min before.'),
  (10, 'Post hard session: protein shake plus banana or rice cakes within 45 min.')
on conflict (sort_order) do update set
  rule_text = excluded.rule_text;

create table nutrition_day (
  id                bigint primary key generated always as identity,
  date              date not null unique,
  day_type          text not null check (day_type in ('hard', 'moderate', 'rest')),
  goal              text not null default 'cut' check (goal in ('cut', 'maintenance', 'race_week')),
  calories_target   int not null,
  protein_target    int not null default 165,
  carbs_target      int not null,
  fat_target        int not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table meal_template (
  id            bigint primary key generated always as identity,
  name          text not null check (name in ('breakfast', 'midday', 'pre_workout', 'post_workout', 'dinner', 'snack')),
  day_type      text not null check (day_type in ('hard', 'moderate', 'rest', 'all')),
  default_time  time,
  notes         text
);

create table food_item (
  id              bigint primary key generated always as identity,
  name            text not null unique,
  category        text not null check (category in ('protein', 'carb', 'fat', 'mixed', 'veg')),
  portion_label   text not null,
  grams           numeric(7,1),
  calories        int not null default 0,
  protein_g       numeric(6,1) not null default 0,
  carbs_g         numeric(6,1) not null default 0,
  fat_g           numeric(6,1) not null default 0,
  tracking_unit   text not null check (tracking_unit in ('piece', 'cup', 'grams', 'scoop', 'slice')),
  notes           text
);

create table food_substitution_group (
  id                 bigint primary key generated always as identity,
  name               text not null unique,
  macro_type         text not null check (macro_type in ('carb', 'protein')),
  target_macro_g     numeric(6,1) not null,
  notes              text
);

create table food_substitution_group_item (
  id                    bigint primary key generated always as identity,
  substitution_group_id bigint not null references food_substitution_group(id) on delete cascade,
  food_item_id          bigint not null references food_item(id) on delete cascade,
  quantity              numeric(7,2) not null default 1,
  label                 text not null,
  unique (substitution_group_id, food_item_id, label)
);

create table meal_log (
  id                bigint primary key generated always as identity,
  nutrition_day_id  bigint not null references nutrition_day(id) on delete cascade,
  meal_name         text not null check (meal_name in ('breakfast', 'midday', 'pre_workout', 'post_workout', 'dinner', 'snack')),
  logged_at         timestamptz not null default now(),
  notes             text
);

create table meal_log_item (
  id                  bigint primary key generated always as identity,
  meal_log_id          bigint not null references meal_log(id) on delete cascade,
  food_item_id         bigint not null references food_item(id),
  quantity             numeric(7,2) not null default 1,
  calories             int not null default 0,
  protein_g            numeric(6,1) not null default 0,
  carbs_g              numeric(6,1) not null default 0,
  fat_g                numeric(6,1) not null default 0,
  substitution_group   text
);

create index nutrition_day_date_idx on nutrition_day (date desc);
create index meal_log_day_idx on meal_log (nutrition_day_id, meal_name);
create index meal_log_item_log_idx on meal_log_item (meal_log_id);
create index food_substitution_group_item_food_idx on food_substitution_group_item (food_item_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger nutrition_day_updated_at
before update on nutrition_day
for each row execute function set_updated_at();

alter table nutrition_day enable row level security;
alter table meal_template enable row level security;
alter table food_item enable row level security;
alter table food_substitution_group enable row level security;
alter table food_substitution_group_item enable row level security;
alter table meal_log enable row level security;
alter table meal_log_item enable row level security;

create policy "anon_all_nutrition_day" on nutrition_day for all using (true) with check (true);
create policy "anon_all_meal_template" on meal_template for all using (true) with check (true);
create policy "anon_all_food_item" on food_item for all using (true) with check (true);
create policy "anon_all_food_substitution_group" on food_substitution_group for all using (true) with check (true);
create policy "anon_all_food_substitution_group_item" on food_substitution_group_item for all using (true) with check (true);
create policy "anon_all_meal_log" on meal_log for all using (true) with check (true);
create policy "anon_all_meal_log_item" on meal_log_item for all using (true) with check (true);

insert into food_item (name, category, portion_label, grams, calories, protein_g, carbs_g, fat_g, tracking_unit, notes) values
  ('Egg', 'protein', '1 egg', 50, 72, 6, 0.4, 5, 'piece', 'Whole egg'),
  ('Protein powder', 'protein', '1 scoop', 32, 120, 25, 2, 1.5, 'scoop', 'Whey or similar'),
  ('Skyr / magerquark', 'protein', '1 cup', 245, 150, 22, 10, 0.5, 'cup', 'High-protein dairy'),
  ('Raw chicken breast', 'protein', '270g raw', 270, 300, 50, 0, 6, 'grams', 'Chicken or turkey breast'),
  ('Raw lean beef', 'protein', '220g raw', 220, 330, 45, 0, 14, 'grams', 'Lean beef portion'),
  ('Banana', 'carb', '1 medium', 118, 105, 1.3, 27, 0.4, 'piece', 'Fast carb'),
  ('Rice cakes', 'carb', '2 cakes', 18, 70, 1.4, 15, 0.5, 'piece', 'Approximate two-cake carb portion'),
  ('Bread', 'carb', '1 slice', 35, 80, 3, 15, 1, 'slice', 'Simple carb swap'),
  ('Small tortilla', 'carb', '1 tortilla', 35, 90, 3, 15, 2, 'piece', 'Simple carb swap'),
  ('Dry oats 1/4 cup', 'carb', '1/4 cup dry', 20, 75, 2.5, 15, 1.5, 'cup', 'Oat carb block'),
  ('Dry oats 1/2 cup', 'carb', '1/2 cup dry', 40, 150, 5, 30, 3, 'cup', 'Moderate breakfast oats'),
  ('Dry oats 3/4 cup', 'carb', '3/4 cup dry', 60, 225, 7.5, 45, 4.5, 'cup', 'Hard day breakfast oats'),
  ('Dry rice 1/3 cup', 'carb', '1/3 cup dry', 62, 220, 4, 47, 0.5, 'cup', 'Smaller rice serving'),
  ('Dry rice 1/2 cup', 'carb', '1/2 cup dry', 93, 335, 6, 72, 1, 'cup', 'Larger rice serving'),
  ('Granola', 'mixed', '1/4 cup', 30, 140, 3, 20, 5, 'cup', 'Use with banana as a rice alternative'),
  ('Berries', 'carb', '1 cup', 140, 70, 1, 17, 0.5, 'cup', 'Low-friction fruit'),
  ('Salad / raw veggies', 'veg', '1 serving', 150, 35, 2, 7, 0, 'cup', 'Loose tracking only'),
  ('Vegetables', 'veg', '1 serving', 180, 60, 3, 12, 0.5, 'cup', 'Loose tracking only');

insert into food_substitution_group (name, macro_type, target_macro_g, notes) values
  ('carb_15g', 'carb', 15, 'Small carb block for bread, tortilla, oats, rice cakes'),
  ('carb_27g', 'carb', 27, 'Medium banana-sized carb block'),
  ('carb_45_50g', 'carb', 47, 'Mid-sized rice or oats block'),
  ('carb_70g', 'carb', 72, 'Large rice block'),
  ('protein_25g', 'protein', 25, 'Protein shake or dairy block'),
  ('protein_45_50g', 'protein', 50, 'Dinner protein block');

insert into food_substitution_group_item (substitution_group_id, food_item_id, quantity, label)
select g.id, f.id, v.quantity, v.label
from (values
  ('carb_15g', 'Rice cakes', 1, '2 rice cakes'),
  ('carb_15g', 'Bread', 1, '1 slice bread'),
  ('carb_15g', 'Small tortilla', 1, '1 small tortilla'),
  ('carb_15g', 'Dry oats 1/4 cup', 1, '1/4 cup dry oats'),
  ('carb_27g', 'Banana', 1, '1 medium banana'),
  ('carb_27g', 'Dry oats 1/4 cup', 2, '1/2 cup dry oats'),
  ('carb_45_50g', 'Dry rice 1/3 cup', 1, '1/3 cup dry rice'),
  ('carb_45_50g', 'Dry oats 3/4 cup', 1, '3/4 cup dry oats'),
  ('carb_45_50g', 'Banana', 1, 'banana plus small carb add-on'),
  ('carb_70g', 'Dry rice 1/2 cup', 1, '1/2 cup dry rice'),
  ('carb_70g', 'Banana', 2.5, '2-3 bananas equivalent'),
  ('protein_25g', 'Protein powder', 1, '1 scoop protein'),
  ('protein_25g', 'Skyr / magerquark', 1, '1 cup skyr/magerquark'),
  ('protein_45_50g', 'Raw chicken breast', 1, '270g raw chicken/turkey'),
  ('protein_45_50g', 'Raw lean beef', 1, '220g raw lean beef'),
  ('protein_45_50g', 'Protein powder', 2, '2 scoops protein')
) as v(group_name, food_name, quantity, label)
join food_substitution_group g on g.name = v.group_name
join food_item f on f.name = v.food_name;

insert into meal_template (name, day_type, default_time, notes) values
  ('breakfast', 'hard', '07:30', '5 eggs, 1 scoop protein, 3/4 cup oats, berries'),
  ('midday', 'hard', '12:30', 'Skyr/magerquark, 1/2 cup dry rice or banana plus granola, salad/raw veggies'),
  ('pre_workout', 'hard', '16:00', 'Banana or 2 rice cakes'),
  ('post_workout', 'hard', '18:00', '1 scoop protein, banana or 2 rice cakes'),
  ('dinner', 'hard', '20:00', 'Chicken/turkey or lean beef, 1/2 cup dry rice, vegetables'),
  ('breakfast', 'moderate', '07:30', '4-5 eggs, 1 scoop protein, 1/2 cup oats, berries'),
  ('midday', 'moderate', '12:30', 'Skyr/magerquark, banana, salad/raw veggies'),
  ('pre_workout', 'moderate', '16:00', 'No default fuel for moderate days'),
  ('post_workout', 'moderate', '18:00', 'No default fuel for moderate days'),
  ('dinner', 'moderate', '19:30', 'Chicken/turkey or lean beef, 1/2 cup dry rice, vegetables'),
  ('breakfast', 'rest', '08:00', '4 eggs, 1 scoop protein, 1/4 cup oats'),
  ('midday', 'rest', '12:30', 'Skyr/magerquark, berries'),
  ('pre_workout', 'rest', '16:00', 'No default fuel for rest days'),
  ('post_workout', 'rest', '18:00', 'No default fuel for rest days'),
  ('dinner', 'rest', '19:30', 'Chicken/turkey or lean beef, vegetables only');

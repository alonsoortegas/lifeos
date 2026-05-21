insert into food_item (name, category, portion_label, grams, calories, protein_g, carbs_g, fat_g, tracking_unit, notes) values
  ('Vollkornbrot', 'carb', '1 slice', 45, 75, 3, 13, 1.5, 'slice', 'Whole-grain bread; user reference: 13g carbs per slice')
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

insert into food_substitution_group_item (substitution_group_id, food_item_id, quantity, label)
select g.id, f.id, 3, '3 slices Vollkornbrot'
from food_substitution_group g
join food_item f on f.name = 'Vollkornbrot'
where g.name = 'carb_45_50g'
on conflict (substitution_group_id, food_item_id, label) do update set
  quantity = excluded.quantity;

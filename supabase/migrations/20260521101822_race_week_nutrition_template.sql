insert into food_item (name, category, portion_label, grams, calories, protein_g, carbs_g, fat_g, tracking_unit, notes) values
  ('Mixed nuts', 'fat', '25g mixed nuts', 25, 175, 5, 5, 15, 'grams', 'Race-week snack fat block'),
  ('Olive oil', 'fat', '15ml olive oil', 14, 120, 0, 0, 14, 'grams', 'Use with dinner when fat target is low')
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

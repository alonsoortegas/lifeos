insert into food_substitution_group (name, macro_type, target_macro_g, notes) values
  ('carb_70g_starchy', 'carb', 72, 'Large starchy carb block: 1/2 cup dry rice or 1 1/4 cups dry oats. Does not include single bananas.')
on conflict (name) do update set
  macro_type = excluded.macro_type,
  target_macro_g = excluded.target_macro_g,
  notes = excluded.notes;

insert into food_substitution_group_item (substitution_group_id, food_item_id, quantity, label)
select g.id, f.id, v.quantity, v.label
from (values
  ('Dry rice 1/2 cup', 1::numeric, '1/2 cup dry rice'),
  ('Dry oats 1/4 cup', 5::numeric, '1 1/4 cups dry oats')
) as v(food_name, quantity, label)
join food_substitution_group g on g.name = 'carb_70g_starchy'
join food_item f on f.name = v.food_name
on conflict (substitution_group_id, food_item_id, label) do update set
  quantity = excluded.quantity;;

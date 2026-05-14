-- Add sort_order to todos for manual reordering within a day.
-- Existing rows are initialised from their creation order per day.

alter table public.todos add column if not exists sort_order int not null default 0;

-- Initialise existing rows: sort_order = position within the day by created_at
update public.todos t
set sort_order = sub.rn
from (
  select id,
         row_number() over (partition by day_date order by created_at) as rn
  from public.todos
) sub
where t.id = sub.id;

-- Index for the common query pattern: todos for a day, ordered
create index if not exists todos_day_sort_idx on public.todos (day_date, sort_order);

-- Reorder operations update sort_order — covered by the existing owner_update_todos policy
grant update (sort_order) on public.todos to authenticated;

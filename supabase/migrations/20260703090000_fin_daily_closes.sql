-- One close per instrument per day — the last synced price of that day.
--
-- The app previously read raw fin_prices with a global row limit, so manual
-- intraday syncs pushed older days out of the window and the net-worth history
-- shortened unevenly. This view collapses syncs to daily closes; the client
-- reads it instead of the raw table (fin_prices stays the write target).
--
-- security_invoker makes the underlying fin_prices RLS policy apply to the
-- caller, matching the owner-scoped model of the other fin_* tables.

create or replace view public.fin_daily_closes
with (security_invoker = true) as
select distinct on (instrument_id, (as_of at time zone 'utc')::date)
  instrument_id,
  price,
  currency,
  as_of
from public.fin_prices
order by instrument_id, (as_of at time zone 'utc')::date desc, as_of desc;

grant select on public.fin_daily_closes to authenticated;

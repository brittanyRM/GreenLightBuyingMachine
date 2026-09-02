-- ============================================================
-- 034 — Room rates on the record
--
-- Rates lived in two places, neither of them the record: on each drawn
-- room in deal_rooms, or on the ZIP market row. So the rent depended
-- on the sketch, and a house priced above or below its ZIP had nowhere
-- to say so.
--
-- These are the rates this deal is underwritten at. They beat the
-- market row and are beaten only by an explicit per-room rate, which
-- is how a corner room with a bigger closet gets its own number.
-- ============================================================

alter table public.deals
  add column if not exists shared_weekly_rate  numeric(10,2),
  add column if not exists ensuite_weekly_rate numeric(10,2);

comment on column public.deals.shared_weekly_rate is
  'Weekly rate for a shared-bath room on this deal. Null uses the ZIP market rate.';
comment on column public.deals.ensuite_weekly_rate is
  'Weekly rate for an ensuite room on this deal. Null uses the ZIP market rate.';

-- Rollback:
--   alter table public.deals
--     drop column if exists shared_weekly_rate,
--     drop column if exists ensuite_weekly_rate;

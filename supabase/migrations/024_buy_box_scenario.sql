-- ============================================================
-- 024 — Which case a buy box's yield floors must hold in
--
-- "DSCR 1.25" is meaningless without saying when. Base case is the
-- ordinary reading; bear is the institutional one — the floor has to
-- survive the downside, not just the pitch.
--
-- Only the yield criteria (DSCR, cap rate) use this. Beds, price and
-- geography are properties of the house and don't vary by scenario.
-- ============================================================

alter table public.buyer_buy_boxes
  add column if not exists scenario text not null default 'base';

alter table public.buyer_buy_boxes
  drop constraint if exists buyer_buy_boxes_scenario_check;

alter table public.buyer_buy_boxes
  add constraint buyer_buy_boxes_scenario_check
  check (scenario in ('bear', 'base', 'bull'));

comment on column public.buyer_buy_boxes.scenario is
  'Which case min_dscr and min_cap_rate are tested against: bear | base | bull.';

-- Rollback:
--   alter table public.buyer_buy_boxes drop column if exists scenario;

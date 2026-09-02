-- ============================================================
-- 028 — Down payment tiers
--
-- Rate depends on equity, so one "from" figure understates the choice
-- a buyer actually has. Tiers are stored per option and priced against
-- the specific property, the same way the deal-page pro forma does it.
--
-- [{ "down_pct": 15, "rate_pct": 7.75 }, ...]
-- ============================================================

alter table public.deal_financing_options
  add column if not exists tiers jsonb not null default '[]'::jsonb,
  add column if not exists closing_cost_pct numeric(5,3);

comment on column public.deal_financing_options.tiers is
  'Down payment tiers: [{down_pct, rate_pct}]. Empty falls back to rate_from_pct.';
comment on column public.deal_financing_options.closing_cost_pct is
  'Buyer closing costs as a percent of price. Null uses 1%.';

update public.deal_financing_options
set tiers = '[{"down_pct":15,"rate_pct":7.750},{"down_pct":20,"rate_pct":6.625},{"down_pct":25,"rate_pct":6.500}]'::jsonb,
    closing_cost_pct = 1.0
where tiers = '[]'::jsonb
  and lender_name ilike '%homeowners%';

-- Rollback:
--   alter table public.deal_financing_options
--     drop column if exists tiers, drop column if exists closing_cost_pct;

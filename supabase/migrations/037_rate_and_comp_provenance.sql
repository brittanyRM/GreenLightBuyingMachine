-- ============================================================
-- 037 — Room rates on the record, provenance on comps
--
-- Two problems, one root.
--
-- 1. shared_weekly_rate / ensuite_weekly_rate were null on every deal
--    but one. roomRate() falls back to the ZIP market row when they
--    are, which is correct behaviour — but it means a flyer prints
--    PadSplit's ZIP average as though it were the rate this house is
--    offered at. The market row should seed the record once, then the
--    record is authoritative and the flyer says so.
--
-- 2. deal_comps records where a comp came from nowhere. An MLS export
--    and a buyer's pasted list land in the same columns, and re-running
--    an import duplicates every row.
-- ============================================================

-- ---------- comps: where did this row come from ----------

alter table public.deal_comps
  add column if not exists source      text,
  add column if not exists observed_on date;

comment on column public.deal_comps.source is
  'Where this comp came from, e.g. ''ARMLS flexmls export'', ''buyer paste''. '
  'Null means an import that predates provenance tracking.';

comment on column public.deal_comps.observed_on is
  'The date the source was pulled. Comps go stale; a sold price from '
  'February read in August is still February''s market.';

-- Re-importing the same export should update, not duplicate. Partial
-- index because a hand-entered comp has no MLS number and several of
-- those on one deal is legitimate.
create unique index if not exists deal_comps_deal_mls_uniq
  on public.deal_comps (deal_id, mls_number)
  where mls_number is not null;

-- ---------- deals: seed room rates from the ZIP, once ----------

update public.deals d
set shared_weekly_rate  = coalesce(d.shared_weekly_rate,  m.shared_weekly),
    ensuite_weekly_rate = coalesce(d.ensuite_weekly_rate, m.private_weekly),
    assumption_overrides =
      coalesce(d.assumption_overrides, '{}'::jsonb)
      || jsonb_build_object(
           'rate_source', 'padsplit_market_seed',
           'rate_seeded_from_zip', m.zip,
           'rate_seeded_at', to_char(now(), 'YYYY-MM-DD')
         )
from public.padsplit_market m
where m.zip = d.zip
  and (d.shared_weekly_rate is null or d.ensuite_weekly_rate is null)
  and (m.shared_weekly is not null or m.private_weekly is not null);

comment on column public.deals.shared_weekly_rate is
  'The rate this house is underwritten at for a shared-bath room. '
  'Seeded from the ZIP market row at creation, then owned by the deal. '
  'Null makes roomRate() fall back to the ZIP average, which then '
  'appears on buyer documents as though it were this property''s rate.';

comment on column public.deals.ensuite_weekly_rate is
  'As shared_weekly_rate, for a private-bath room.';

-- ---------- what is still blank ----------
--
-- Run after applying. Any row returned has no market row for its ZIP,
-- so the seed could not fill it and the flyer will still fall through.
--
--   select id, slug, zip, shared_weekly_rate, ensuite_weekly_rate
--   from public.deals
--   where shared_weekly_rate is null or ensuite_weekly_rate is null;
--
-- Once that returns nothing, make it impossible to regress:
--
--   alter table public.deals
--     alter column shared_weekly_rate  set not null,
--     alter column ensuite_weekly_rate set not null;
--
-- Not done here because it fails while any deal is still blank, and a
-- migration that fails halfway is worse than one that leaves a query
-- to run.

-- ---------- rollback ----------
--
--   drop index if exists public.deal_comps_deal_mls_uniq;
--   alter table public.deal_comps
--     drop column if exists source,
--     drop column if exists observed_on;
--
-- The rate seed is not reversible: once a rate is on the record there
-- is no way to tell a seeded value from one someone typed. Check
-- assumption_overrides->>'rate_source' before assuming.

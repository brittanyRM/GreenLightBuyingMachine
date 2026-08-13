-- ============================================================
-- 030 — Per-deal assumption overrides
--
-- org_assumptions holds the standard; this holds what a particular
-- house actually costs. A real tax bill, a quoted insurance premium, a
-- measured utility spend — set once on the record and every document
-- reads it.
--
-- Resolution order everywhere: deal override, then org_assumptions,
-- then the built-in default. Null means "use the standard", so a blank
-- field is not zero.
--
-- jsonb rather than a column each: the set of assumptions changes, and
-- a blob doesn't need a migration every time it does.
-- ============================================================

alter table public.deals
  add column if not exists assumption_overrides jsonb not null default '{}'::jsonb;

comment on column public.deals.assumption_overrides is
  'Per-deal overrides keyed the same as org_assumptions. Null or absent means use the standard.';

-- Rollback:
--   alter table public.deals drop column if exists assumption_overrides;

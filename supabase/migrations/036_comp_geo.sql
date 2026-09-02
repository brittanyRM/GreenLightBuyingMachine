-- ============================================================
-- 036 — Coordinates for comps
--
-- deal_comps held an address string and nothing to place it with, so
-- comps couldn't go on the map. Geocoded once and stored, rather than
-- looked up every time a buyer opens the sheet.
-- ============================================================

alter table public.deal_comps
  add column if not exists latitude   numeric(10,7),
  add column if not exists longitude  numeric(10,7),
  add column if not exists geocoded_at timestamptz;

comment on column public.deal_comps.latitude is
  'Geocoded from address. Null keeps this comp off the map.';

-- Rollback:
--   alter table public.deal_comps
--     drop column if exists latitude, drop column if exists longitude,
--     drop column if exists geocoded_at;

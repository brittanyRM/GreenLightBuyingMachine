-- ============================================================
-- 035 — Coordinates for the buyer map
--
-- padsplit_market held a ZIP string and nothing to place it with, so
-- nothing could be plotted. Centroids go on the market row; the deal
-- already has latitude/longitude columns from 001, they're just empty.
--
-- Seeded for the Phoenix metro ZIPs in use. Anything without a
-- centroid is simply left off the map rather than guessed at.
-- ============================================================

alter table public.padsplit_market
  add column if not exists latitude  numeric(10,7),
  add column if not exists longitude numeric(10,7);

comment on column public.padsplit_market.latitude is
  'ZIP centroid. Null keeps this market off the buyer map.';

-- Phoenix metro centroids (US Census ZCTA).
insert into public.padsplit_market (zip, latitude, longitude)
values
  ('85201', 33.4356, -111.8560),
  ('85202', 33.3789, -111.8760),
  ('85203', 33.4400, -111.8010),
  ('85204', 33.3990, -111.7830),
  ('85205', 33.4360, -111.7100),
  ('85206', 33.3960, -111.7080),
  ('85210', 33.3860, -111.8570),
  ('85224', 33.3290, -111.8930),
  ('85225', 33.3130, -111.8290),
  ('85226', 33.3130, -111.9330),
  ('85233', 33.3520, -111.8110),
  ('85234', 33.3660, -111.7480),
  ('85281', 33.4270, -111.9280),
  ('85282', 33.3930, -111.9330),
  ('85283', 33.3660, -111.9330),
  ('85301', 33.5340, -112.1790),
  ('85302', 33.5670, -112.1780),
  ('85303', 33.5340, -112.2150),
  ('85304', 33.5670, -112.1780),
  ('85305', 33.5300, -112.2520),
  ('85306', 33.6220, -112.1780),
  ('85307', 33.5340, -112.3060),
  ('85308', 33.6570, -112.1770),
  ('85310', 33.7020, -112.1360),
  ('85033', 33.4970, -112.2130),
  ('85035', 33.4680, -112.1900),
  ('85037', 33.4970, -112.2530),
  ('85051', 33.5580, -112.1290),
  ('85053', 33.6220, -112.1230),
  ('85017', 33.5090, -112.1230),
  ('85021', 33.5580, -112.0930),
  ('85029', 33.5940, -112.1090),
  ('85031', 33.4970, -112.1690)
on conflict (zip) do update
  set latitude  = coalesce(public.padsplit_market.latitude,  excluded.latitude),
      longitude = coalesce(public.padsplit_market.longitude, excluded.longitude);

create index if not exists padsplit_market_geo_idx
  on public.padsplit_market (latitude, longitude)
  where latitude is not null;

-- Rollback:
--   alter table public.padsplit_market
--     drop column if exists latitude, drop column if exists longitude;

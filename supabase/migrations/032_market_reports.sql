-- ============================================================
-- 032 — City market reports
--
-- Demographics behind a deal. A buyer looking at one house in Gilbert
-- wants to know whether Gilbert itself is growing — population, the
-- direction of travel, and what a conventional rental costs, which is
-- the number co-living has to beat to make sense to a tenant.
--
-- Keyed by city and state, not per deal: every Gilbert property shares
-- the same market. Optional ZIP for a narrower cut.
-- ============================================================

create table if not exists public.market_reports (
  id                  uuid primary key default gen_random_uuid(),

  city                text not null,
  state               text not null,
  zip                 text,

  population          int,
  population_prior    int,
  population_year     int,

  households          int,
  median_household_income numeric(12,2),
  median_age          numeric(4,1),
  renter_share        numeric(5,4),

  -- What a conventional rental costs. The bar co-living has to clear.
  median_rent_1br     numeric(10,2),
  median_rent_2br     numeric(10,2),
  median_rent_3br     numeric(10,2),
  rent_yoy            numeric(6,4),

  median_home_value   numeric(12,2),
  home_value_yoy      numeric(6,4),

  major_employers     text[] not null default '{}',
  source              text,
  as_of               date,

  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists market_reports_place_key
  on public.market_reports (lower(city), lower(state), coalesce(zip, ''));

alter table public.market_reports enable row level security;

drop policy if exists team_all_market_reports on public.market_reports;
create policy team_all_market_reports on public.market_reports
  for all to authenticated using (true) with check (true);

-- Buyers reach this through /api/buyer/* with the service role, so no
-- anon policy is needed.

create or replace function public.market_reports_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists market_reports_touch on public.market_reports;
create trigger market_reports_touch
  before update on public.market_reports
  for each row execute function public.market_reports_touch();

comment on table public.market_reports is
  'City-level demographics shown on the buyer sheet. One row per city, or per ZIP for a narrower cut.';

-- Rollback:
--   drop trigger if exists market_reports_touch on public.market_reports;
--   drop function if exists public.market_reports_touch();
--   drop table if exists public.market_reports cascade;

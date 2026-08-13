-- ============================================================
-- 023 — Buyer buy boxes
--
-- What each buyer is actually looking for, so the portal can lead
-- with what fits them rather than listing everything, and so a new
-- deal can be checked against every buyer at once.
--
-- Typed columns rather than a jsonb blob: matching runs in SQL or in
-- JS depending on where it's needed, and a typo in a key can't
-- silently stop a criterion from applying.
--
-- Null means "no constraint" on every field. A buy box with nothing
-- set matches everything, which is the right default for a buyer who
-- hasn't told us yet.
-- ============================================================

create table if not exists public.buyer_buy_boxes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.buyer_orgs (id) on delete cascade,

  label         text not null default 'Primary',
  active        boolean not null default true,

  min_price     numeric(12,2),
  max_price     numeric(12,2),

  min_bedrooms  int,
  min_bathrooms numeric(4,1),
  min_sqft      int,
  max_year_built int,
  min_year_built int,

  -- Empty array means no geographic constraint.
  cities        text[] not null default '{}',
  zips          text[] not null default '{}',
  states        text[] not null default '{}',

  -- Yield floors, checked against the pro forma rather than the record.
  min_cap_rate  numeric(5,2),
  min_dscr      numeric(5,2),

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists buyer_buy_boxes_org_idx on public.buyer_buy_boxes (org_id);

alter table public.buyer_buy_boxes enable row level security;
-- No policies: service role only, same as the rest of the buyer tables.

comment on table public.buyer_buy_boxes is
  'Per-buyer acquisition criteria. Null or empty means no constraint on that field.';

create or replace function public.buyer_buy_boxes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buyer_buy_boxes_touch on public.buyer_buy_boxes;
create trigger buyer_buy_boxes_touch
  before update on public.buyer_buy_boxes
  for each row execute function public.buyer_buy_boxes_touch();

-- Rollback:
--   drop trigger if exists buyer_buy_boxes_touch on public.buyer_buy_boxes;
--   drop function if exists public.buyer_buy_boxes_touch();
--   drop table if exists public.buyer_buy_boxes cascade;

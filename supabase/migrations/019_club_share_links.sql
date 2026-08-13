-- ============================================================
-- 019 — Shareable club pro forma links
--
-- Deliberately NOT built on deals.visibility + the anon RLS path.
-- The existing deals_public_read policy grants anon the entire deals
-- row, purchase_price and rehab_budget included, so flipping a deal
-- to 'buyer_link' to share a pro forma would publish our basis.
--
-- These links are served instead by /api/club-share/[token], which
-- reads with the service role and applies the same field whitelist as
-- the buyer portal. deals.visibility is never touched.
--
-- RLS on, no policies: anon and authenticated are both denied and only
-- the service role can reach these rows.
-- ============================================================

create table if not exists public.club_share_links (
  token          text primary key,
  deal_id        uuid not null references public.deals (id) on delete cascade,

  -- Frozen at creation so a recipient sees what was sent, not whatever
  -- the deal looks like when they get round to opening it.
  scenario       text not null default 'base',
  hold_years     int  not null default 10,

  label          text,
  recipient      text,

  expires_at     timestamptz,
  revoked_at     timestamptz,

  view_count     int not null default 0,
  last_viewed_at timestamptz,

  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists club_share_deal_idx on public.club_share_links (deal_id);
create index if not exists club_share_created_idx on public.club_share_links (created_at desc);

alter table public.club_share_links enable row level security;

comment on table public.club_share_links is
  'Public pro forma links. Served only via /api/club-share/*; no RLS policies by design.';

-- Counter bump. Service role only, same as the table.
create or replace function public.club_share_mark_viewed(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.club_share_links
     set view_count = view_count + 1,
         last_viewed_at = now()
   where token = p_token;
$$;

-- Rollback:
--   drop function if exists public.club_share_mark_viewed(text);
--   drop table if exists public.club_share_links cascade;

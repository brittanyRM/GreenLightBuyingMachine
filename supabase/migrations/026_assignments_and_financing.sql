-- ============================================================
-- 026 — Deal assignment and buyer-facing financing
--
-- Two additions.
--
-- deal_assignments allocates a property to a buyer without sending a
-- link: it appears in their portal marked as theirs, optionally
-- exclusively, optionally with a deadline.
--
-- deal_financing_options is what a BUYER can borrow — lender, terms,
-- contact. It is not deal_financing, which holds our own acquisition
-- gap funding and is team-only. Different table on purpose: two
-- similar names sharing one table is how the wrong number ends up in
-- front of the wrong person.
-- ============================================================

create table if not exists public.deal_assignments (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  org_id      uuid not null references public.buyer_orgs (id) on delete cascade,

  -- offered   : visible to them, still open to others
  -- exclusive : visible to them, hidden from everyone else
  -- reserved  : they've accepted, off the market
  -- released  : no longer theirs
  status      text not null default 'offered',

  -- After this, an exclusive quietly reverts to ordinary visibility.
  expires_at  timestamptz,

  note        text,
  assigned_by uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists deal_assignments_unique
  on public.deal_assignments (deal_id, org_id);
create index if not exists deal_assignments_org_idx on public.deal_assignments (org_id);
create index if not exists deal_assignments_deal_idx on public.deal_assignments (deal_id);

alter table public.deal_assignments enable row level security;
-- Service role only, same as the other buyer tables.

-- ---------- what a buyer can borrow ----------

create table if not exists public.deal_financing_options (
  id            uuid primary key default gen_random_uuid(),

  -- Null deal_id means it applies to every property.
  deal_id       uuid references public.deals (id) on delete cascade,

  label         text not null,
  lender_name   text,
  loan_type     text,

  max_ltv_pct   numeric(5,2),
  rate_from_pct numeric(6,3),
  term_months   int,
  min_dscr      numeric(5,2),
  points        numeric(5,2),

  contact_name  text,
  contact_email text,
  contact_phone text,

  summary       text,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists deal_financing_options_deal_idx
  on public.deal_financing_options (deal_id);

alter table public.deal_financing_options enable row level security;

comment on table public.deal_financing_options is
  'Financing available TO a buyer. Distinct from deal_financing, which is our own acquisition gap funding and never buyer-facing.';

-- Rollback:
--   drop table if exists public.deal_financing_options cascade;
--   drop table if exists public.deal_assignments cascade;

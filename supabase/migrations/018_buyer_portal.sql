-- ============================================================
-- 018 — Buyer portal
--
-- Firms get an org, people get accounts under it. Buyers are
-- deliberately NOT Supabase auth users.
--
-- Migration 002 grants every authenticated user full read/write on
-- deals via team_all_deals (`for all to authenticated using (true)`).
-- Any buyer given a Supabase login would inherit that — including
-- purchase_price, rehab_budget and every deal still in underwriting.
-- Policies are OR'd, so a restrictive buyer policy could not claw it
-- back without rewriting the team policy.
--
-- So buyers authenticate against these tables instead and are served
-- only through /api/buyer/*, where the service-role client applies a
-- field whitelist. Buyers never hold a Supabase JWT.
--
-- Every table below enables RLS and defines NO policies. That denies
-- anon and authenticated outright; only the service role, which
-- bypasses RLS, can read or write. Nothing in migration 002 changes.
-- ============================================================

-- ---------- firms ----------
create table if not exists public.buyer_orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------- people at those firms ----------
create table if not exists public.buyer_users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.buyer_orgs (id) on delete cascade,
  email         text not null,
  name          text,
  -- scrypt, stored as salt:hash in hex. Null until a password is set —
  -- a magic-link-only account is valid.
  password_hash text,
  active        boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- Case-insensitive: nobody should be able to register Brian@ and brian@.
create unique index if not exists buyer_users_email_key
  on public.buyer_users (lower(email));

create index if not exists buyer_users_org_idx on public.buyer_users (org_id);

-- ---------- sessions ----------
create table if not exists public.buyer_sessions (
  token       text primary key,
  user_id     uuid not null references public.buyer_users (id) on delete cascade,
  expires_at  timestamptz not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists buyer_sessions_user_idx on public.buyer_sessions (user_id);
create index if not exists buyer_sessions_expiry_idx on public.buyer_sessions (expires_at);

-- ---------- magic links ----------
create table if not exists public.buyer_magic_links (
  token       text primary key,
  user_id     uuid not null references public.buyer_users (id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists buyer_magic_user_idx on public.buyer_magic_links (user_id);

-- ---------- raise your hand ----------
create table if not exists public.deal_interest (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  buyer_user_id uuid not null references public.buyer_users (id) on delete cascade,
  org_id        uuid not null references public.buyer_orgs (id) on delete cascade,
  -- interested | offer | passed
  kind          text not null default 'interested',
  offer_price   numeric(12,2),
  note          text,
  -- new | reviewing | accepted | declined — your side of the conversation
  status        text not null default 'new',
  created_at    timestamptz not null default now()
);

create index if not exists deal_interest_deal_idx on public.deal_interest (deal_id);
create index if not exists deal_interest_org_idx on public.deal_interest (org_id);
create index if not exists deal_interest_created_idx on public.deal_interest (created_at desc);

-- ---------- lock everything to the service role ----------
alter table public.buyer_orgs        enable row level security;
alter table public.buyer_users       enable row level security;
alter table public.buyer_sessions    enable row level security;
alter table public.buyer_magic_links enable row level security;
alter table public.deal_interest     enable row level security;

-- No policies are created on purpose. With RLS on and no policy, both
-- anon and authenticated are denied. The service role bypasses RLS,
-- so only /api/buyer/* and /api/buyer/admin/* can reach these rows.

comment on table public.buyer_orgs is
  'Buyer firms. Served only through /api/buyer/*; no RLS policies by design.';
comment on table public.buyer_users is
  'People at buyer firms. Not Supabase auth users — see the header note in 018.';
comment on column public.deal_interest.kind is
  'interested | offer | passed';

-- Rollback:
--   drop table if exists public.deal_interest cascade;
--   drop table if exists public.buyer_magic_links cascade;
--   drop table if exists public.buyer_sessions cascade;
--   drop table if exists public.buyer_users cascade;
--   drop table if exists public.buyer_orgs cascade;

-- ============================================================
-- 033 — Buyer research requests
--
-- A buyer sends their own comps and asks us to run the market work.
-- The request and its files live apart from deal_documents, which
-- holds our material: a buyer upload is untrusted input and shouldn't
-- share a table with the loan request.
--
-- Files go to the existing bucket under _buyer-uploads/{org}/, so
-- they're segregated by path as well as by table.
-- ============================================================

create table if not exists public.buyer_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.buyer_orgs (id) on delete cascade,
  buyer_user_id uuid not null references public.buyer_users (id) on delete cascade,

  -- Null for a general market question not tied to a listing.
  deal_id       uuid references public.deals (id) on delete set null,

  -- market_research | comp_review | question
  kind          text not null default 'market_research',

  -- Free text: the market they're asking about, or what they want checked.
  subject       text,
  note          text,

  -- new | in_progress | answered | closed
  status        text not null default 'new',
  response      text,
  responded_at  timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists buyer_requests_org_idx on public.buyer_requests (org_id);
create index if not exists buyer_requests_status_idx on public.buyer_requests (status, created_at desc);

create table if not exists public.buyer_request_files (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.buyer_requests (id) on delete cascade,
  file_name    text not null,
  storage_path text not null,
  public_url   text,
  file_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists buyer_request_files_req_idx on public.buyer_request_files (request_id);

alter table public.buyer_requests enable row level security;
alter table public.buyer_request_files enable row level security;
-- No policies: service role only, same as the rest of the buyer tables.

create or replace function public.buyer_requests_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buyer_requests_touch on public.buyer_requests;
create trigger buyer_requests_touch
  before update on public.buyer_requests
  for each row execute function public.buyer_requests_touch();

comment on table public.buyer_requests is
  'Buyer-submitted research requests. Untrusted input — kept apart from deal_documents.';

-- Rollback:
--   drop trigger if exists buyer_requests_touch on public.buyer_requests;
--   drop function if exists public.buyer_requests_touch();
--   drop table if exists public.buyer_request_files cascade;
--   drop table if exists public.buyer_requests cascade;

-- ============================================================
-- buyer_uploads — a buyer's own documents against one property
--
-- Distinct from buyer_requests: those are a request for work, these
-- are reference material a buyer attaches to a listing they're looking
-- at. Both are untrusted input and neither is read by any calculation.
--
-- This table backs /api/buyer/uploads, which was written without it.
-- ============================================================

create table if not exists public.buyer_uploads (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references public.deals (id) on delete cascade,
  org_id          uuid not null references public.buyer_orgs (id) on delete cascade,
  buyer_user_id   uuid not null references public.buyer_users (id) on delete cascade,

  kind            text not null default 'other',
  label           text,
  note            text,

  storage_path    text not null,
  public_url      text,
  file_type       text,
  file_size_bytes bigint,

  created_at      timestamptz not null default now()
);

create index if not exists buyer_uploads_deal_idx on public.buyer_uploads (deal_id, org_id);

alter table public.buyer_uploads enable row level security;
-- Service role only, like the rest of the buyer tables.

comment on table public.buyer_uploads is
  'Buyer-attached reference documents. Untrusted input; never read by a calculation.';

-- Rollback:
--   drop table if exists public.buyer_uploads cascade;

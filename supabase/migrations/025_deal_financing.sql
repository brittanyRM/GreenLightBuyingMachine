-- ============================================================
-- 025 — Gap funding and loan steps
--
-- The second deed of trust that covers what the first lender won't:
-- the down payment, the borrower's rehab share, fees and prepaid
-- interest. Terms are stored per deal so a note can be reproduced
-- months later, and the five steps are tracked so nothing stalls at
-- the title company.
-- ============================================================

create table if not exists public.deal_financing (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals (id) on delete cascade,

  -- First position
  ltc_pct           numeric(5,4) not null default 0.90,
  rate_pct          numeric(6,3) not null default 17.000,
  doc_fee           numeric(12,2) not null default 1500,

  -- Borrower side
  earnest_money     numeric(12,2) not null default 5000,
  est_closing_costs numeric(12,2) not null default 4800,
  prepaid_months    numeric(4,1)  not null default 3,
  include_stub      boolean not null default true,
  closing_date      date,
  round_up_to       numeric(12,2) not null default 5000,

  -- Second position, once agreed
  note_amount       numeric(12,2),
  note_rate_pct     numeric(6,3),
  note_maturity     date,
  lender_name       text,
  lender_address    text,

  -- Parties
  borrower_entity   text,
  signer_name       text,
  signer_title      text,
  title_company     text,
  title_contact     text,
  title_email       text,
  title_phone       text,
  insurance_agent   text,

  -- { assignment: {done, at}, insurance: {...}, ... }
  steps             jsonb not null default '{}'::jsonb,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists deal_financing_deal_key
  on public.deal_financing (deal_id);

alter table public.deal_financing enable row level security;

drop policy if exists team_all_deal_financing on public.deal_financing;
create policy team_all_deal_financing on public.deal_financing
  for all to authenticated using (true) with check (true);

-- Deliberately no anon policy: financing terms are never buyer-facing.

create or replace function public.deal_financing_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deal_financing_touch on public.deal_financing;
create trigger deal_financing_touch
  before update on public.deal_financing
  for each row execute function public.deal_financing_touch();

-- Rollback:
--   drop trigger if exists deal_financing_touch on public.deal_financing;
--   drop function if exists public.deal_financing_touch();
--   drop table if exists public.deal_financing cascade;

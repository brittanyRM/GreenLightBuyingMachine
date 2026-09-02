-- ============================================================
-- 029 — Saved pro forma inputs per deal
--
-- The assumptions panel edited a model that lived only in the browser,
-- so a real occupancy figure or an actual utility bill had to be
-- retyped every session and never reached a buyer.
--
-- Stored as the whole ProformaInputs object rather than a column per
-- field: the engine's shape evolves, and a jsonb blob doesn't need a
-- migration every time it does. Null means fall back to the defaults
-- built from the deal record, market row and org_assumptions.
-- ============================================================

create table if not exists public.deal_proforma_inputs (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  inputs     jsonb not null,
  note       text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deal_proforma_inputs_deal_key
  on public.deal_proforma_inputs (deal_id);

alter table public.deal_proforma_inputs enable row level security;

drop policy if exists team_all_deal_proforma_inputs on public.deal_proforma_inputs;
create policy team_all_deal_proforma_inputs on public.deal_proforma_inputs
  for all to authenticated using (true) with check (true);

-- No anon policy. Buyers reach these through /api/buyer/* and
-- /api/club-share/*, which read with the service role and price off
-- list rather than our basis.

create or replace function public.deal_proforma_inputs_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deal_proforma_inputs_touch on public.deal_proforma_inputs;
create trigger deal_proforma_inputs_touch
  before update on public.deal_proforma_inputs
  for each row execute function public.deal_proforma_inputs_touch();

-- Rollback:
--   drop trigger if exists deal_proforma_inputs_touch on public.deal_proforma_inputs;
--   drop function if exists public.deal_proforma_inputs_touch();
--   drop table if exists public.deal_proforma_inputs cascade;

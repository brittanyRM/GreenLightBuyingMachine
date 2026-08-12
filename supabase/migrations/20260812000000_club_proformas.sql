-- GLBM Club-Format Pro Forma — additive migration
--
-- ISOLATION CONTRACT:
--   CREATE statements only. No ALTER, no DROP, no changes to existing tables,
--   policies, functions, or triggers. Rolling this back is a single DROP TABLE.
--
-- Assumes auth.users exists (Supabase default). If your deals table is named
-- something other than public.deals, adjust the optional FK at the bottom or
-- leave deal_id as a bare uuid.

create table if not exists public.club_proformas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  -- Optional soft link to an existing deal. Intentionally NOT a foreign key by
  -- default so this table has zero dependency on your current schema.
  deal_id       uuid,

  name          text not null,
  address       text,

  -- Full ProformaInputs object. Kept as jsonb so the engine can evolve without
  -- another migration.
  inputs        jsonb not null,

  -- Optional cached ProformaResult summary for list views. Recompute from
  -- inputs whenever the engine version changes.
  computed      jsonb,
  engine_version text not null default '1.0.0',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.club_proformas is
  'Club-format pro formas. Additive module; no other table depends on this.';

create index if not exists club_proformas_user_id_idx
  on public.club_proformas (user_id);

create index if not exists club_proformas_deal_id_idx
  on public.club_proformas (deal_id)
  where deal_id is not null;

create index if not exists club_proformas_updated_at_idx
  on public.club_proformas (updated_at desc);

-- Row level security: owner-only.
alter table public.club_proformas enable row level security;

create policy "club_proformas_select_own"
  on public.club_proformas for select
  using (auth.uid() = user_id);

create policy "club_proformas_insert_own"
  on public.club_proformas for insert
  with check (auth.uid() = user_id);

create policy "club_proformas_update_own"
  on public.club_proformas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "club_proformas_delete_own"
  on public.club_proformas for delete
  using (auth.uid() = user_id);

-- Dedicated trigger function, namespaced so it cannot collide with an existing
-- set_updated_at() you may already have.
create or replace function public.club_proformas_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists club_proformas_touch_updated_at on public.club_proformas;

create trigger club_proformas_touch_updated_at
  before update on public.club_proformas
  for each row
  execute function public.club_proformas_touch_updated_at();

-- Rollback:
--   drop table if exists public.club_proformas cascade;
--   drop function if exists public.club_proformas_touch_updated_at();

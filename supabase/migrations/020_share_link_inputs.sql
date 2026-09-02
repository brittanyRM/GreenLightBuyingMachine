-- ============================================================
-- 020 — Freeze adjusted assumptions onto a share link
--
-- A link previously rebuilt the model from the deal record, so any
-- adjustment made before sharing was silently discarded and the
-- recipient saw defaults. Storing the inputs means a link shows what
-- was actually sent, and keeps showing it after the deal record moves
-- on.
--
-- add column if not exists, so this applies whether or not 019 has
-- already run.
-- ============================================================

alter table public.club_share_links
  add column if not exists inputs jsonb;

comment on column public.club_share_links.inputs is
  'Frozen ProformaInputs at share time. Null means rebuild from the deal.';

-- Rollback:
--   alter table public.club_share_links drop column if exists inputs;

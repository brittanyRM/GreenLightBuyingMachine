-- ============================================================
-- 022 — Let a recipient stress-test a shared pro forma
--
-- An analyst trusts figures they can push on. Adjusting is a sandbox:
-- it never overwrites the frozen inputs on the link, and the sheet
-- labels itself the moment anything is changed so an adjusted number
-- can't be mistaken for one we published.
--
-- Per-link, because some conversations want the numbers held still.
-- ============================================================

alter table public.club_share_links
  add column if not exists allow_adjust boolean not null default true;

comment on column public.club_share_links.allow_adjust is
  'Recipient may edit assumptions in-browser. Never writes back — the frozen inputs stand.';

-- Rollback:
--   alter table public.club_share_links drop column if exists allow_adjust;

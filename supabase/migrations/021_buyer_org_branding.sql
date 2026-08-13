-- ============================================================
-- 021 — Buyer firm branding
--
-- A firm's own mark in their own portal, so signing in reads as
-- "this is yours" rather than a generic list.
--
-- Per-firm rather than hardcoded: every buyer gets the same treatment
-- without touching code, and a mark can be removed as easily as it
-- was added if a firm would rather it wasn't there.
--
-- Deliberately scoped to portal chrome only. It is never rendered on
-- a pro forma sheet or a share link — putting a buyer's mark on our
-- underwriting would imply they stand behind figures they didn't
-- produce.
-- ============================================================

alter table public.buyer_orgs
  add column if not exists logo_url text,
  add column if not exists logo_dark_url text;

comment on column public.buyer_orgs.logo_url is
  'Firm mark for the portal header (light background). Use only with the firm''s permission.';
comment on column public.buyer_orgs.logo_dark_url is
  'Optional light-on-dark variant. Falls back to logo_url when unset.';

-- Rollback:
--   alter table public.buyer_orgs drop column if exists logo_url, drop column if exists logo_dark_url;

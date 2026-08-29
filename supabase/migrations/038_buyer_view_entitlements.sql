-- ============================================================
-- 038 — Which tools each buying firm can see
--
-- The buyer sheet is one page with several sections. Until now every
-- firm saw the same set. That stops working the moment the sections
-- stop being uniformly appropriate: a syndicator wants the waterfall
-- and the sources-and-uses, and an individual buying one house does
-- not — showing them a promote calculation invites a question about
-- who the promote is going to.
--
-- Held on the firm, not the person. Access is a commercial decision
-- about a relationship, and two people at the same firm looking at
-- the same deal should not see different pages.
-- ============================================================

alter table public.buyer_orgs
  add column if not exists enabled_views text[]
    not null
    default array['summary','numbers','property','market','diligence'];

comment on column public.buyer_orgs.enabled_views is
  'Section ids from SECTIONS in components/ClubProForma.jsx that this '
  'firm may see. The default is every section that existed before '
  'entitlements, so behaviour is unchanged for firms already set up. '
  'Sections added later are opt-in: absent from this array means the '
  'firm does not see the tile at all, not merely that it starts '
  'collapsed. Enforced server-side in the deal route — the tile list '
  'is filtered before it reaches the browser.';

-- Existing firms keep exactly what they had. Written explicitly rather
-- than relying on the column default, which only applies to rows
-- inserted after this migration runs.
update public.buyer_orgs
set enabled_views = array['summary','numbers','property','market','diligence']
where enabled_views is null;

-- ---------- rollback ----------
--
--   alter table public.buyer_orgs drop column if exists enabled_views;
--
-- Dropping loses per-firm configuration with no way to reconstruct it.
-- Export first if any firm has been given a non-default set:
--
--   select slug, enabled_views from public.buyer_orgs
--   where enabled_views <> array['summary','numbers','property','market','diligence'];

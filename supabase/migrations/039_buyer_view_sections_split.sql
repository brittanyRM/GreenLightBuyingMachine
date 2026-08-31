-- ============================================================
-- 039 — Rename and split the buyer view sections
--
-- 038 stored section ids on buyer_orgs.enabled_views. Two of them have
-- changed shape since:
--
--   property → flyer     Same content, honest name. It is the flyer:
--                        photos, specifications, floor plan, finishes.
--
--   market   → comps     One tile carried two unrelated things. Houses
--            + padsplit  that sold nearby is Green Light's evidence;
--                        room rates and occupancy for the ZIP is a
--                        third party's data. A buyer checking what the
--                        neighbours went for and a buyer checking room
--                        rates are asking different questions, and the
--                        second needs its source named. Splitting the
--                        tile is what makes that label possible.
--
-- A firm that had 'market' gets both halves: this is a rename, not a
-- reduction, and nobody should silently lose a section they had.
-- ============================================================

-- Rename in place, then de-duplicate. Written as three statements
-- rather than one clever array expression because the failure mode of
-- the clever version is a firm losing access to a section, and that is
-- not a thing to discover from a support message.

update public.buyer_orgs
set enabled_views = array_replace(enabled_views, 'property', 'flyer')
where 'property' = any(enabled_views);

update public.buyer_orgs
set enabled_views = array_replace(enabled_views, 'market', 'comps') || array['padsplit']
where 'market' = any(enabled_views);

-- array_replace leaves duplicates if a firm somehow held both ids.
-- Collapse to a distinct set, preserving nothing about order: the
-- display order comes from SECTIONS in the component, not from here.
update public.buyer_orgs
set enabled_views = sub.cleaned
from (
  select id, array_agg(distinct v) as cleaned
  from public.buyer_orgs, unnest(enabled_views) as v
  group by id
) as sub
where sub.id = public.buyer_orgs.id
  and sub.cleaned <> public.buyer_orgs.enabled_views;

-- New firms get the current set. Syndication stays opt-in.
alter table public.buyer_orgs
  alter column enabled_views
  set default array['summary','flyer','numbers','comps','padsplit','diligence'];

comment on column public.buyer_orgs.enabled_views is
  'Section ids from SECTIONS in components/ClubProForma.jsx that this '
  'firm may see. Enforced server-side in the buyer deal route — the '
  'list is filtered before it reaches the browser, and the print path '
  'is gated on it too. Syndication is opt-in: absent means the tile '
  'does not exist for that firm. Ids must stay in step with '
  'BUYER_VIEW_IDS in app/api/buyer/admin/orgs/route.js and BUYER_VIEWS '
  'in app/admin/buyers/page.jsx.';

-- ---------- check ----------
--
--   select slug, enabled_views from public.buyer_orgs order by slug;
--
-- Nothing should still contain 'property' or 'market':
--
--   select slug, enabled_views from public.buyer_orgs
--   where enabled_views && array['property','market'];
--
-- ---------- rollback ----------
--
--   update public.buyer_orgs
--   set enabled_views = array_replace(enabled_views, 'flyer', 'property');
--
--   update public.buyer_orgs
--   set enabled_views =
--     array_remove(array_replace(enabled_views, 'comps', 'market'), 'padsplit')
--   where 'comps' = any(enabled_views) or 'padsplit' = any(enabled_views);
--
--   alter table public.buyer_orgs alter column enabled_views
--     set default array['summary','numbers','property','market','diligence'];

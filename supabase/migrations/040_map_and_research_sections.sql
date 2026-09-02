-- ============================================================
-- 040 — Map and Market research become their own sections
--
-- Both already existed on the buyer sheet; neither had its own tile.
--
--   map        The subject and the PadSplit ZIPs around it. It was
--              rendering under 'comps' because it plots the comparable
--              sales, but "where is this" and "what did the neighbours
--              get" are different questions and a buyer often wants one
--              without the other.
--
--   research   City demographics, jobs, incomes. It was rendering under
--              'padsplit' — but that tile is PadSplit's own figures for
--              the ZIP, and this is third-party data about the city.
--              Same reasoning as the comps/padsplit split in 039.
--
-- Additive. Every firm that could already see the content keeps seeing
-- it; the difference is that it can now be switched off independently.
--
-- 'numbers' is also removed here. The pro forma is no longer a section
-- that can be switched off — income, costs, financing and capital are
-- the sheet, and a document whose numbers are optional is a brochure.
-- It always renders, so an entitlement for it means nothing.
-- ============================================================

-- A firm that had 'comps' was already being shown the map.
update public.buyer_orgs
set enabled_views = enabled_views || array['map']
where 'comps' = any(enabled_views)
  and not ('map' = any(enabled_views));

-- A firm that had 'padsplit' was already being shown the research.
update public.buyer_orgs
set enabled_views = enabled_views || array['research']
where 'padsplit' = any(enabled_views)
  and not ('research' = any(enabled_views));

-- The pro forma is no longer gated. Drop the id so the admin screen
-- and the route agree with SECTIONS in the component.
update public.buyer_orgs
set enabled_views = array_remove(enabled_views, 'numbers')
where 'numbers' = any(enabled_views);

-- Collapse any duplicates, as 039 did. Order is irrelevant — display
-- order comes from SECTIONS in the component.
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
  set default array['summary','flyer','comps','padsplit','map','research','diligence'];

comment on column public.buyer_orgs.enabled_views is
  'Section ids from SECTIONS in components/ClubProForma.jsx that this '
  'firm may see. Enforced server-side in the buyer deal route — the '
  'list is filtered before it reaches the browser, and the print path '
  'is gated on it too. The pro forma itself is not listed: it always '
  'renders. Syndication is opt-in: absent means the tile does not '
  'exist for that firm. Ids must stay in step with BUYER_VIEW_IDS in '
  'app/api/buyer/admin/orgs/route.js and BUYER_VIEWS in '
  'app/admin/buyers/page.jsx.';

-- ---------- check ----------
--
--   select slug, enabled_views from public.buyer_orgs order by slug;
--
-- Nothing should still contain 'numbers':
--
--   select slug, enabled_views from public.buyer_orgs
--   where 'numbers' = any(enabled_views);
--
-- ---------- rollback ----------
--
--   update public.buyer_orgs
--   set enabled_views =
--     array_remove(array_remove(enabled_views, 'map'), 'research')
--       || array['numbers'];
--
--   alter table public.buyer_orgs alter column enabled_views
--     set default array['summary','flyer','numbers','comps','padsplit','diligence'];

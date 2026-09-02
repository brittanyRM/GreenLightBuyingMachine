GREEN LIGHT BUYING MACHINE — Map + Market research tiles
=========================================================

WHAT THIS IS
  Five changed files, in the exact folder structure of the repo.
  All five OVERWRITE existing files. Nothing new is created,
  no migration, no new dependency.

HOW TO INSTALL
  Extract this zip over your repo root — the folder that contains
  package.json, app/ and components/. The paths line up, so the
  files land where they belong and replace the old ones.

  Commit first, or extract to a copy, so you can diff before pushing.

  ⚠ Do NOT extract into the nested glbm/ folder inside the repo.
    That is an older partial copy and nothing there is live.

WHAT CHANGED
  components/ClubProForma.jsx
      Two new tiles in SECTIONS: "Map" and "Market research".
      The map moved off the Comps tile; the research report moved
      off the PadSplit market tile. Neither had its own tile before.
      No pro forma logic was touched.

  app/deals/[slug]/page.jsx
      New "Research" tab between Map and Email. The MarketResearch
      panel moved there out of the Record tab.

  app/proforma-club/[slug]/page.jsx
      Now fetches market_reports and padsplit_market and passes them
      to ClubProForma. Without this the two new tiles render blank
      in preview while working fine for buyers.

  app/admin/buyers/page.jsx
      "Map" and "Market research" added to BUYER_VIEWS and to
      DEFAULT_BUYER_VIEWS, so existing buyer firms get them.

  app/api/buyer/admin/orgs/route.js
      Same two ids added to BUYER_VIEW_IDS. These three lists must
      stay in step or a new tile is filtered out and renders for
      nobody.

WHERE TO LOOK AFTERWARD
  /deals/<slug>           → "Research" tab
  /proforma-club/<slug>   → click Preview; "Map" and "Market research"
                            appear between PadSplit market and Syndication
  /admin/buyers           → both are now per-firm checkboxes

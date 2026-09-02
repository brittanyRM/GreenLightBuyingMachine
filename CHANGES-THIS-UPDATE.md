# What changed in this update

Six files. Five are edits to existing files; one is new.

## New tiles on the buyer sheet

`components/ClubProForma.jsx`

Two additions to `SECTIONS`: **Map** and **Market research**.

Neither feature is new — both were already built and already
rendering, just attached to the wrong tile. The map lived under
**Comps** because it plots comparable sales; the city research report
lived under **PadSplit market**. A buyer asking *where is this* and a
buyer asking *what did the neighbours get* are two questions, and
PadSplit's ZIP data and third-party city demographics are two
different sources. They now have their own tiles.

No pro forma logic was touched. `DEFAULT_VIEWS` is unchanged, so the
same four tiles are lit on arrival.

## Research gets its own tab

`app/deals/[slug]/page.jsx`

New **Research** tab between Map and Email. The `MarketResearch` panel
moved there out of the Record tab — it is a step someone performs, not
part of the record they fill in. The panel notes that reports are keyed
by city, so research run from one house covers every deal in that city.

## Preview now matches what buyers see

`app/proforma-club/[slug]/page.jsx`

This route never passed `marketReport` or `nearbyMarkets` into
`ClubProForma`. The buyer routes did, so the two new tiles would have
worked for buyers while rendering blank in your own preview. It now
fetches both, using the same query as `app/api/club-share/[token]`.

Note the table is `market_reports`. `market_research` is only a *kind*
value on buyer requests — different thing.

## Entitlements kept in step

`app/admin/buyers/page.jsx` — `BUYER_VIEWS` and `DEFAULT_BUYER_VIEWS`
`app/api/buyer/admin/orgs/route.js` — `BUYER_VIEW_IDS`

These three lists must carry the same ids or a new section is filtered
out by the entitlement check and renders for nobody. Both new ids were
added to all three, and to the defaults so existing buyer firms pick
them up without editing each one.

## Standalone buyer calculator (new)

`public/buyer-calculator.html`

Served at `/buyer-calculator.html`. One self-contained file — no login,
no database, no build step. Built on the 4743 W Sunnyside pro forma;
every figure reconciles to that sheet to the dollar at the defaults.

- Room rates are inputs: ensuite count and $/wk, shared count and $/wk
- Capital in, houses out, plus a portfolio roll-up
- Down payment tiers priced at their own rates
- Buyer logo by URL or upload, beside the Green Light mark
- "Copy share link" puts the whole projection in the URL
- Inputs persist in the browser

Lender rates for the tier table are a `TIERS` array at the top of the
script — one line to update when pricing moves.

## Where to look

    /deals/<slug>           → Research tab
    /proforma-club/<slug>   → Preview, then Map and Market research tiles
    /admin/buyers           → both as per-firm checkboxes
    /buyer-calculator.html  → the standalone

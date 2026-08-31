import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import {
  getBuyerFromRequest,
  BUYER_DEAL_SELECT,
  liveAssignmentsFor,
  buyerCanSee,
  scrubDeal,
} from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// What a firm sees when nothing has been configured for it. Matches
// the sections that existed before entitlements, so an unmigrated or
// newly created firm is not silently shown less than it was.
// Syndication is deliberately absent: it is opt-in per firm.
const DEFAULT_BUYER_VIEWS = ["summary", "flyer", "numbers", "comps", "padsplit", "diligence"];

export async function GET(req, { params }) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: deal, error } = await admin()
    .from("deals")
    .select(BUYER_DEAL_SELECT)
    .eq("slug", params.slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same 404 whether the deal doesn't exist or isn't for sale — a
  // buyer shouldn't be able to probe slugs to learn the pipeline.
  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The query above no longer filters on status, because a deal this
  // firm is assigned should be reachable whatever its status. That
  // makes the decision this route's job — without it, removing the
  // filter would hand every buyer every deal.
  const { mine } = await liveAssignmentsFor(admin(), buyer.org.id);
  if (!buyerCanSee(deal, mine)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }


  const [
    { data: rooms },
    { data: market },
    { data: comps },
    { data: settings },
    { data: docs },
    { data: orgRows },
    { data: marketReport },
    { data: savedInputs },
    { data: interest },
  ] =
    await Promise.all([
    admin()
      .from("deal_rooms")
      .select("id, room_number, label, room_type, weekly_rate, is_ensuite")
      .eq("deal_id", deal.id)
      .order("room_number"),
    admin()
      .from("padsplit_market")
      .select("zip, shared_weekly, private_weekly, avg_occupancy")
      .eq("zip", deal.zip)
      .maybeSingle(),
    // Sold comps are public MLS record and are what a buyer needs to
    // sanity-check the price. Explicit columns, same rule as deals.
    admin()
      .from("deal_comps")
      .select("id, address, comp_status, list_price, sold_price, sold_date, approx_sqft, price_per_sqft, adom, cdom, bedrooms, bathrooms, year_built, distance_miles")
      .eq("deal_id", deal.id)
      .order("sold_date", { ascending: false, nullsFirst: false }),
    // Brand defaults: standard hero, standard gallery, flyer copy.
    // Already anon-readable by policy and carries nothing deal-specific.
    admin().from("org_settings").select("key, value"),
    // Evidence only. buyer_visible is opt-in per document because this
    // table also holds closing statements and loan requests.
    admin()
      .from("deal_documents")
      .select("id, doc_type, title, buyer_label, public_url, file_type, created_at")
      .eq("deal_id", deal.id)
      .eq("buyer_visible", true)
      .order("created_at"),
    // Lender terms. Same rows the deal-page pro forma reads, so the
    // two documents can't quote different loans on one house.
    admin().from("org_assumptions").select("key, value"),
    // City demographics. Matched on city first, then the ZIP cut if
    // one exists — every Gilbert property shares the same market.
    admin()
      .from("market_reports")
      .select("*")
      .eq("active", true)
      .ilike("city", deal.city || "")
      .ilike("state", deal.state || "")
      .order("zip", { nullsFirst: true })
      .limit(1)
      .maybeSingle(),
    // Assumptions saved against this deal. What the team tuned is what
    // a buyer sees — otherwise the sheet they open is not the sheet we
    // built.
    admin()
      .from("deal_proforma_inputs")
      .select("inputs")
      .eq("deal_id", deal.id)
      .maybeSingle(),
    admin()
      .from("deal_interest")
      .select("id, kind, offer_price, note, status, created_at")
      .eq("deal_id", deal.id)
      .eq("org_id", buyer.org.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    deal: scrubDeal(deal),
    rooms: rooms || [],
    market: market || null,
    comps: comps || [],
    defaults: (settings || []).reduce((a, r) => ({ ...a, [r.key]: r.value }), {}),
    org: orgRows || [],
    marketReport: marketReport || null,
    // Deliberately empty. The surrounding-ZIP rows are a compiled
    // market set and don't go out to buyers; the map plots the subject
    // and its comps. The subject's own ZIP row is still sent above.
    // Entitlements are applied here rather than in the browser. A
    // hidden tile is a hidden tile; a tile filtered client-side is a
    // tile anyone can restore with the dev tools.
    enabledViews: buyer?.org?.enabledViews || DEFAULT_BUYER_VIEWS,
    nearbyMarkets: [],
    documents: docs || [],
    savedInputs: savedInputs?.inputs || null,
    interest: interest || [],
  });
}

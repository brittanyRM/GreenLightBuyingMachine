import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import {
  getBuyerFromRequest,
  BUYER_DEAL_SELECT,
  BUYER_VISIBLE_STATUS,
  scrubDeal,
} from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: deal, error } = await admin()
    .from("deals")
    .select(BUYER_DEAL_SELECT)
    .eq("slug", params.slug)
    .in("status", BUYER_VISIBLE_STATUS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Same 404 whether the deal doesn't exist or isn't for sale — a
  // buyer shouldn't be able to probe slugs to learn the pipeline.
  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [{ data: rooms }, { data: market }, { data: comps }, { data: settings }, { data: interest }] =
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
      .select("id, address, comp_status, list_price, sold_price, sold_date, approx_sqft, price_per_sqft, adom, cdom")
      .eq("deal_id", deal.id)
      .order("sold_date", { ascending: false, nullsFirst: false }),
    // Brand defaults: standard hero, standard gallery, flyer copy.
    // Already anon-readable by policy and carries nothing deal-specific.
    admin().from("org_settings").select("key, value"),
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
    interest: interest || [],
  });
}

import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { BUYER_DEAL_SELECT, scrubDeal } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Public. No session — the token is the credential.
//
// Everything is read with the service role and passed through the
// buyer whitelist, so the browser never receives purchase_price or
// the rehab budget regardless of what the deals row holds.
export async function GET(req, { params }) {
  const { data: link } = await admin()
    .from("club_share_links")
    .select("token, deal_id, scenario, hold_years, expires_at, revoked_at, label, inputs, allow_adjust")
    .eq("token", params.token)
    .maybeSingle();

  // One response for missing, revoked and expired alike — a probing
  // request shouldn't learn which tokens once existed.
  const dead =
    !link ||
    link.revoked_at ||
    (link.expires_at && new Date(link.expires_at) < new Date());

  if (dead) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: deal } = await admin()
    .from("deals")
    .select(BUYER_DEAL_SELECT)
    .eq("id", link.deal_id)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [{ data: rooms }, { data: market }, { data: comps }, { data: settings }, { data: orgRows }] =
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
    admin()
      .from("deal_comps")
      .select("id, address, comp_status, list_price, sold_price, sold_date, approx_sqft, price_per_sqft")
      .eq("deal_id", deal.id)
      .order("sold_date", { ascending: false, nullsFirst: false }),
    // Brand defaults: standard hero, standard gallery, flyer copy.
    // Already anon-readable by policy and carries nothing deal-specific.
    admin().from("org_settings").select("key, value"),
    // Lender terms. Same rows the deal-page pro forma reads, so the
    // two documents can't quote different loans on one house.
    admin().from("org_assumptions").select("key, value"),
  ]);

  admin().rpc("club_share_mark_viewed", { p_token: params.token });

  return NextResponse.json({
    deal: scrubDeal(deal),
    rooms: rooms || [],
    market: market || null,
    comps: comps || [],
    defaults: (settings || []).reduce((a, r) => ({ ...a, [r.key]: r.value }), {}),
    org: orgRows || [],
    scenario: link.scenario,
    holdYears: link.hold_years,
    inputs: link.inputs || null,
    allowAdjust: link.allow_adjust !== false,
  });
}

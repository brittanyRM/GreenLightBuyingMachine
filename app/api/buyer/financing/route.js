import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { getBuyerFromRequest, BUYER_VISIBLE_STATUS } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Financing available to the buyer on a property they've engaged with.
//
// Gated on having raised a hand — not to be coy, but because these
// are lender introductions and there's no reason to publish a broker's
// contact details to anyone who opens a link.
//
// Reads deal_financing_options only. deal_financing, which holds our
// own acquisition terms, is never touched here.
export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "A property is required." }, { status: 400 });

  const { data: deal } = await admin()
    .from("deals")
    .select("id")
    .eq("slug", slug)
    .in("status", BUYER_VISIBLE_STATUS)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: interest } = await admin()
    .from("deal_interest")
    .select("id, kind")
    .eq("deal_id", deal.id)
    .eq("org_id", buyer.org.id)
    .neq("kind", "passed")
    .limit(1);

  if (!interest || !interest.length) {
    return NextResponse.json({ options: [], locked: true });
  }

  const { data, error } = await admin()
    .from("deal_financing_options")
    .select("id, label, lender_name, loan_type, max_ltv_pct, rate_from_pct, term_months, min_dscr, points, contact_name, contact_email, contact_phone, summary")
    .eq("active", true)
    .or(`deal_id.eq.${deal.id},deal_id.is.null`)
    .order("sort_order");

  if (error) return NextResponse.json({ options: [], unavailable: true });
  return NextResponse.json({ options: data || [], locked: false });
}

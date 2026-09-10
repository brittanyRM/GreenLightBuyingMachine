import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import {
  getBuyerFromRequest,
  liveAssignmentsFor,
  buyerCanSee,
} from "../../../../lib/buyerAuth";
import { researchCity, saveReport } from "../../../../lib/marketResearch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// A buyer runs the market research for a house they can see.
//
// The research is about the city — population, incomes, employers,
// rents. It is not about us and it is not deal-specific, so there is
// no reason a buyer looking at a house in an unresearched city should
// be shown an empty panel and left there.
//
// It writes to the same market_reports table the team route uses, so
// running it fills the section in for everyone: the buyer sees it
// immediately, and it is on the deal's Research tab from then on. One
// source, whoever asked for it.
//
// Guards, in order:
//   - a buyer session, not a team one
//   - the deal must actually be visible to that firm
//   - the city comes from the deal record, never from the request, so
//     the portal cannot be used to research arbitrary places
//   - if a report already exists it is returned rather than re-run
// ============================================================

export async function POST(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { slug } = await req.json().catch(() => ({}));
  if (!slug) return NextResponse.json({ error: "Which property?" }, { status: 400 });

  const { data: deal } = await admin()
    .from("deals")
    .select("id, slug, city, state, zip, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { mine } = await liveAssignmentsFor(admin(), buyer.org.id);
  if (!buyerCanSee(deal, mine)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!deal.city || !deal.state) {
    return NextResponse.json(
      { error: "This property has no city on record yet." },
      { status: 422 }
    );
  }

  // Already done — by us, or by another buyer looking at another house
  // in the same city. Returning it costs nothing and re-running it
  // costs a handful of searches.
  const { data: existing } = await admin()
    .from("market_reports")
    .select("*")
    .ilike("city", deal.city)
    .ilike("state", deal.state)
    .eq("active", true)
    .maybeSingle();

  if (existing) return NextResponse.json({ report: existing, alreadyHad: true });

  try {
    const { row } = await researchCity({
      city: deal.city,
      state: deal.state,
      zip: deal.zip,
    });
    await saveReport(row);
    return NextResponse.json({ report: row, alreadyHad: false });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { researchCity, saveReport } from "../../../lib/marketResearch";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/market-research  { city, state, zip?, save?: true }
//
// Fills market_reports for a city. The table and the panel that
// renders it have both existed since migration 032; nothing ever wrote
// to it, so the section never appeared on a buyer sheet.
//
// Researched with web search rather than a demographics API, because
// the useful answer spans sources that no single API covers — census
// population and income, a rent index, and the actual named employers
// in the area. The cost is that it must be checked, so it returns
// figures with their sources and saves only when asked.
// ============================================================

// GET — which cities have a report and which don't.
//
// The table is keyed by city, so one run covers every deal in that
// city. Without a view of coverage that saving is invisible: you can
// research Phoenix from one deal and have no way of knowing the other
// two Phoenix deals are now covered, or that Chandler never was.
export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const [{ data: deals }, { data: reports }] = await Promise.all([
    admin().from("deals").select("id, slug, address_line, city, state, zip"),
    admin().from("market_reports").select("*").eq("active", true),
  ]);

  const key = (c, st) => `${String(c || "").toLowerCase()}|${String(st || "").toLowerCase()}`;
  const byPlace = new Map();
  for (const r of reports || []) byPlace.set(key(r.city, r.state), r);

  const places = new Map();
  for (const d of deals || []) {
    if (!d.city || !d.state) continue;
    const k = key(d.city, d.state);
    if (!places.has(k))
      places.set(k, { city: d.city, state: d.state, deals: [], report: byPlace.get(k) || null });
    places.get(k).deals.push({ slug: d.slug, address: d.address_line });
  }

  const STALE_DAYS = 180;
  const rows = [...places.values()].map((p) => {
    const asOf = p.report?.as_of || p.report?.updated_at || null;
    const ageDays = asOf ? Math.floor((Date.now() - new Date(asOf).getTime()) / 86400000) : null;
    return {
      city: p.city,
      state: p.state,
      dealCount: p.deals.length,
      deals: p.deals,
      hasReport: !!p.report,
      asOf,
      ageDays,
      // Rents and population move. A report from last year is not
      // wrong so much as no longer evidence.
      stale: ageDays != null && ageDays > STALE_DAYS,
      population: p.report?.population ?? null,
      medianIncome: p.report?.median_household_income ?? null,
      employers: p.report?.major_employers?.length ?? 0,
    };
  });

  rows.sort((a, b) => Number(a.hasReport) - Number(b.hasReport) || b.dealCount - a.dealCount);

  return NextResponse.json({
    places: rows,
    covered: rows.filter((r) => r.hasReport && !r.stale).length,
    total: rows.length,
    dealsUncovered: rows.filter((r) => !r.hasReport).reduce((a, r) => a + r.dealCount, 0),
  });
}

export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { city, state, zip = null, save = false } = await req.json().catch(() => ({}));
  if (!city || !state) {
    return NextResponse.json({ error: "A city and state are required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY isn't set. Add it in Vercel project settings." },
      { status: 500 }
    );
  }

  let researched;
  try {
    // Shared with the buyer route, so both run the same prompt and
    // apply the same normalisation.
    researched = await researchCity({ city, state, zip });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
  const { row, flags, missing, figures, confidence, place: where } = researched;

  if (!save) {
    return NextResponse.json({
      saved: false,
      place: where,
      report: row,
      figures: parsed.figures || [],
      confidence: parsed.confidence || {},
      flags,
      missing,
    });
  }

  const { data: saved, error } = await admin()
    .from("market_reports")
    .upsert(row, { onConflict: "city,state,zip" })
    .select()
    .maybeSingle();

  if (error) {
    // The unique index is on lower(city), lower(state), coalesce(zip,'')
    // — an expression index, which upsert's onConflict cannot name. Fall
    // back to an explicit find-then-write.
    const { data: existing } = await admin()
      .from("market_reports")
      .select("id")
      .ilike("city", city)
      .ilike("state", state)
      .is("zip", zip ? undefined : null)
      .maybeSingle();

    if (existing?.id) {
      const { error: e2 } = await admin()
        .from("market_reports")
        .update(row)
        .eq("id", existing.id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    } else {
      const { error: e3 } = await admin().from("market_reports").insert(row);
      if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    saved: true,
    place: where,
    report: saved || row,
    figures: parsed.figures || [],
    confidence: parsed.confidence || {},
    flags,
    missing,
  });
}

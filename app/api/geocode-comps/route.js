import { NextResponse } from "next/server";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Geocode a deal's comps so they can go on the buyer map.
//
// Nominatim is OpenStreetMap's own service — free, no key. Their usage
// policy asks for one request a second and a real User-Agent, both
// honoured below. Results are stored, so a comp is looked up once and
// never again.
//
// Anything that doesn't resolve is left null and simply stays off the
// map, rather than being placed somewhere plausible and wrong.
export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { slug } = await req.json().catch(() => ({}));
  if (!slug) return NextResponse.json({ error: "A property is required." }, { status: 400 });

  const { data: deal } = await admin()
    .from("deals")
    .select("id, city, state, zip")
    .eq("slug", slug)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const { data: comps, error } = await admin()
    .from("deal_comps")
    .select("id, address, latitude")
    .eq("deal_id", deal.id)
    .is("latitude", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!comps?.length) {
    return NextResponse.json({ located: 0, message: "All comps already placed." });
  }

  let located = 0;
  const failures = [];

  for (const c of comps) {
    if (!c.address) continue;

    // The comp address usually carries city and state already; add the
    // deal's as a fallback so a bare street line still resolves.
    const query = /[A-Z]{2}\s*$|,/.test(c.address)
      ? c.address
      : `${c.address}, ${deal.city || ""} ${deal.state || ""} ${deal.zip || ""}`;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent": "GreenLightBuyingMachine/1.0 (deal comps mapping)",
            "Accept-Language": "en",
          },
        }
      );

      if (res.ok) {
        const hits = await res.json();
        if (hits?.[0]?.lat && hits[0].lon) {
          await admin()
            .from("deal_comps")
            .update({
              latitude: Number(hits[0].lat),
              longitude: Number(hits[0].lon),
              geocoded_at: new Date().toISOString(),
            })
            .eq("id", c.id);
          located += 1;
        } else {
          failures.push(c.address);
        }
      } else {
        failures.push(c.address);
      }
    } catch {
      failures.push(c.address);
    }

    // One a second, per their usage policy.
    await new Promise((r) => setTimeout(r, 1100));
  }

  return NextResponse.json({
    located,
    failed: failures.length,
    failures: failures.slice(0, 5),
  });
}

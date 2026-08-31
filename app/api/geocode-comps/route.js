import { NextResponse } from "next/server";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";
// One second per comp by policy, so ten comps is eleven seconds and the
// default serverless ceiling cuts it off mid-loop. The work already
// done is saved — each comp is written as it resolves — but the caller
// gets a dead connection rather than a result, which reads as "the
// button does nothing".
export const maxDuration = 300;

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
  let blocked = false;
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
          failures.push({ address: c.address, reason: "no match at the geocoder" });
        }
      } else {
        // 403 and 429 are what a blocked or throttled caller gets, and
        // they need different answers — one is "wait", the other is
        // "this host is not allowed to use the service". Swallowing
        // both into a count made them indistinguishable.
        failures.push({
          address: c.address,
          reason: `geocoder returned ${res.status}${
            res.status === 403
              ? " — blocked. Nominatim refuses most cloud hosts; this needs a keyed provider."
              : res.status === 429
              ? " — rate limited."
              : ""
          }`,
        });
        if (res.status === 403 || res.status === 429) {
          blocked = true;
          break;
        }
      }
    } catch (e) {
      failures.push({ address: c.address, reason: e.message || "request failed" });
    }

    // One a second, per their usage policy.
    await new Promise((r) => setTimeout(r, 1100));
  }

  return NextResponse.json({
    located,
    attempted: comps.length,
    failed: failures.length,
    blocked,
    // The reason, not just the count. "3 couldn't be found" and "the
    // geocoder refused this server" are the same number and completely
    // different problems.
    failures: failures.slice(0, 5),
  });
}

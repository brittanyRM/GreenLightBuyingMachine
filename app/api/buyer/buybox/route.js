import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { getBuyerFromRequest } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

const NUMERIC = [
  "min_price", "max_price", "min_bedrooms", "min_bathrooms",
  "min_sqft", "min_year_built", "min_dscr", "min_cap_rate",
];

export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await admin()
    .from("buyer_buy_boxes")
    .select("*")
    .eq("org_id", buyer.org.id)
    .limit(1)
    .maybeSingle();

  // Missing table means migration 023 hasn't run. Report it as "no buy
  // box" rather than an error the buyer can do nothing about.
  if (error) return NextResponse.json({ buyBox: null, unavailable: true });
  return NextResponse.json({ buyBox: data || null });
}

// A buyer setting their own criteria. Scoped to their org — org_id
// comes from the session, never from the request body.
export async function POST(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch = { org_id: buyer.org.id, label: "Primary" };

  for (const k of NUMERIC) {
    if (k in body) {
      const v = body[k];
      patch[k] = v === "" || v === null || v === undefined ? null : Number(v);
      if (patch[k] !== null && !Number.isFinite(patch[k])) {
        return NextResponse.json({ error: "Numbers only in that field." }, { status: 400 });
      }
    }
  }

  for (const k of ["cities", "zips", "states"]) {
    if (k in body) patch[k] = Array.isArray(body[k]) ? body[k].filter(Boolean) : [];
  }
  if (["bear", "base", "bull"].includes(body.scenario)) patch.scenario = body.scenario;
  if ("notes" in body) patch.notes = body.notes || null;

  const { data: existing } = await admin()
    .from("buyer_buy_boxes")
    .select("id")
    .eq("org_id", buyer.org.id)
    .limit(1)
    .maybeSingle();

  const q = existing
    ? admin().from("buyer_buy_boxes").update(patch).eq("id", existing.id)
    : admin().from("buyer_buy_boxes").insert(patch);

  const { data, error } = await q.select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ buyBox: data });
}

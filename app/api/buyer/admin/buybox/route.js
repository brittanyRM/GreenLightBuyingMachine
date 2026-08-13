import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

const NUMERIC = [
  "min_price", "max_price", "min_bedrooms", "min_bathrooms",
  "min_sqft", "max_year_built", "min_year_built",
  "min_cap_rate", "min_dscr",
];
const ARRAYS = ["cities", "zips", "states"];

// Upsert the buy box for a buyer. One box per buyer for now; the table
// allows several, so a second can be added later without a migration.
export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.org_id) {
    return NextResponse.json({ error: "A buyer is required." }, { status: 400 });
  }

  const patch = { org_id: body.org_id, label: body.label || "Primary" };

  // Empty string clears a criterion rather than storing 0 — otherwise
  // blanking "min bedrooms" would silently become "at least 0".
  for (const k of NUMERIC) {
    if (k in body) {
      const v = body[k];
      patch[k] = v === "" || v === null || v === undefined ? null : Number(v);
      if (patch[k] !== null && !Number.isFinite(patch[k])) {
        return NextResponse.json({ error: `${k} must be a number.` }, { status: 400 });
      }
    }
  }

  for (const k of ARRAYS) {
    if (k in body) patch[k] = Array.isArray(body[k]) ? body[k].filter(Boolean) : [];
  }

  if (["bear", "base", "bull"].includes(body.scenario)) patch.scenario = body.scenario;
  if ("notes" in body) patch.notes = body.notes || null;
  if ("active" in body) patch.active = body.active !== false;

  const { data: existing } = await admin()
    .from("buyer_buy_boxes")
    .select("id")
    .eq("org_id", body.org_id)
    .limit(1)
    .maybeSingle();

  const q = existing
    ? admin().from("buyer_buy_boxes").update(patch).eq("id", existing.id)
    : admin().from("buyer_buy_boxes").insert(patch);

  const { data, error } = await q.select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ buyBox: data });
}

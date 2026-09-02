import { NextResponse } from "next/server";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// PadSplit market rows, editable for any ZIP — including ones we have
// no deal in yet, which is exactly what the buyer map needs to show a
// property against its neighbours.

const NUMERIC = [
  "active_units", "upcoming_units", "shared_weekly", "private_weekly",
  "avg_occupancy", "days_to_first_booking", "days_to_80_percent",
  "latitude", "longitude",
];

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { data, error } = await admin()
    .from("padsplit_market")
    .select("*")
    .order("zip");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ markets: data || [] });
}

export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const zip = String(body.zip || "").trim();
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "A five-digit ZIP is required." }, { status: 400 });
  }

  const row = { zip, fetched_at: new Date().toISOString() };
  if (typeof body.metro === "string") row.metro = body.metro || null;
  if (typeof body.source_url === "string") row.source_url = body.source_url || null;

  for (const k of NUMERIC) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === "" || v === null || v === undefined) {
      row[k] = null;
      continue;
    }
    let n = Number(v);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: `${k} must be a number.` }, { status: 400 });
    }
    // Occupancy is stored as a fraction. Typing 95 is the obvious
    // mistake and silently becomes 9500%, so convert rather than
    // accept it.
    if (k === "avg_occupancy" && n > 1) n = n / 100;
    row[k] = n;
  }

  const { data, error } = await admin()
    .from("padsplit_market")
    .upsert(row, { onConflict: "zip" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ market: data });
}

export async function DELETE(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { zip } = await req.json().catch(() => ({}));
  if (!zip) return NextResponse.json({ error: "A ZIP is required." }, { status: 400 });

  const { error } = await admin().from("padsplit_market").delete().eq("zip", zip);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

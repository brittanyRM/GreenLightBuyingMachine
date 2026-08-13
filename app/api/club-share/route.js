import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Create a link. Team auth required — the Bearer token is the same
// Supabase session the app already holds.
export async function POST(req) {
  const user = await requireTeam(req);
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { slug, scenario = "base", hold_years = 10, label, recipient, expires_days, inputs } = body;

  const { data: deal } = await admin()
    .from("deals")
    .select("id, slug, address_line, list_price")
    .eq("slug", slug || "")
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });

  // A link priced off a missing list price would quietly fall back to
  // our basis. Refuse rather than publish it.
  if (!deal.list_price) {
    return NextResponse.json(
      { error: "Set a list price on this deal before sharing it." },
      { status: 400 }
    );
  }

  const token = randomBytes(24).toString("hex");
  const expires_at = expires_days
    ? new Date(Date.now() + Number(expires_days) * 864e5).toISOString()
    : null;

  const { data, error } = await admin()
    .from("club_share_links")
    .insert({
      token,
      deal_id: deal.id,
      scenario: ["bear", "base", "bull"].includes(scenario) ? scenario : "base",
      hold_years: [5, 7, 10].includes(Number(hold_years)) ? Number(hold_years) : 10,
      label: label || null,
      recipient: recipient || null,
      expires_at,
      // Frozen so the recipient opens what was sent, even if the deal
      // record changes afterwards.
      inputs: inputs || null,
      created_by: user.id,
    })
    .select("token, scenario, hold_years, label, recipient, expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return NextResponse.json({ link: { ...data, url: `${base}/s/${data.token}` } });
}

// List links for a deal, with view counts.
export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

  const { data: deal } = await admin().from("deals").select("id").eq("slug", slug).maybeSingle();
  if (!deal) return NextResponse.json({ links: [] });

  const { data } = await admin()
    .from("club_share_links")
    .select("token, scenario, hold_years, label, recipient, expires_at, revoked_at, view_count, last_viewed_at, created_at")
    .eq("deal_id", deal.id)
    .order("created_at", { ascending: false });

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return NextResponse.json({
    links: (data || []).map((l) => ({ ...l, url: `${base}/s/${l.token}` })),
  });
}

// Revoke. Kept as a soft flag so a dead link is distinguishable from
// one that never existed.
export async function DELETE(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "token is required." }, { status: 400 });

  const { error } = await admin()
    .from("club_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

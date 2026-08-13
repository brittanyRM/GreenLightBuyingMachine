import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

const STATUSES = ["offered", "exclusive", "reserved", "released"];

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { data, error } = await admin()
    .from("deal_assignments")
    .select("*, deals(slug, address_line, city, list_price, status), buyer_orgs(name, slug)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ assignments: [], unavailable: true });
  return NextResponse.json({ assignments: data || [] });
}

export async function POST(req) {
  const user = await requireTeam(req);
  if (!user) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { slug, org_id, status = "offered", expires_days, note } =
    await req.json().catch(() => ({}));

  if (!slug || !org_id) {
    return NextResponse.json({ error: "A property and a buyer are required." }, { status: 400 });
  }
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const { data: deal } = await admin()
    .from("deals")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const payload = {
    deal_id: deal.id,
    org_id,
    status,
    note: note || null,
    assigned_by: user.id,
    expires_at: expires_days
      ? new Date(Date.now() + Number(expires_days) * 864e5).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin()
    .from("deal_assignments")
    .upsert(payload, { onConflict: "deal_id,org_id" })
    .select("*, buyer_orgs(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "An id is required." }, { status: 400 });

  const { error } = await admin().from("deal_assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

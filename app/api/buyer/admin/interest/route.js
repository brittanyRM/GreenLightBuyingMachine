import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { data, error } = await admin()
    .from("deal_interest")
    .select("id, kind, offer_price, note, status, created_at, deals(slug, address_line, city, list_price), buyer_orgs(name), buyer_users(email, name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interest: data || [] });
}

// Move an enquiry along: new → reviewing → accepted / declined.
export async function PATCH(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id, status } = await req.json().catch(() => ({}));
  const allowed = ["new", "reviewing", "accepted", "declined"];
  if (!id || !allowed.includes(status)) {
    return NextResponse.json({ error: "A valid id and status are required." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("deal_interest")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interest: data });
}

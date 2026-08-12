import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { data, error } = await admin()
    .from("buyer_orgs")
    .select("id, name, slug, active, created_at, buyer_users(id, email, name, active, last_login_at)")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orgs: data || [] });
}

export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { name } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: "A firm name is required." }, { status: 400 });

  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data, error } = await admin()
    .from("buyer_orgs")
    .insert({ name, slug })
    .select("id, name, slug, active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ org: data });
}

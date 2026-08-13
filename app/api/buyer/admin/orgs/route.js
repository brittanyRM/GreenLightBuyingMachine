import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const withLogos =
    "id, name, slug, active, logo_url, logo_dark_url, created_at, buyer_users(id, email, name, active, last_login_at, password_hash)";
  const withoutLogos =
    "id, name, slug, active, created_at, buyer_users(id, email, name, active, last_login_at, password_hash)";

  // Migration 021 adds the logo columns. Selecting a column that
  // doesn't exist fails the whole query, which would show an empty
  // list rather than the buyers that are actually there — so fall
  // back and tell the caller what's missing.
  let { data, error } = await admin().from("buyer_orgs").select(withLogos).order("name");

  let needsMigration = false;
  if (error) {
    const retry = await admin().from("buyer_orgs").select(withoutLogos).order("name");
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }
    data = retry.data;
    needsMigration = true;
  }

  // Never ship a hash to the browser — collapse it to a boolean so the
  // UI can show whether a password is set without carrying the value.
  const orgs = (data || []).map((o) => ({
    ...o,
    buyer_users: (o.buyer_users || []).map(({ password_hash, ...u }) => ({
      ...u,
      has_password: !!password_hash,
    })),
  }));

  // Buy boxes are a separate table so a missing migration 023 can't
  // take the buyer list down with it.
  let buyBoxes = [];
  const bb = await admin().from("buyer_buy_boxes").select("*");
  if (!bb.error) buyBoxes = bb.data || [];

  const withBoxes = orgs.map((o) => ({
    ...o,
    buy_box: buyBoxes.find((b) => b.org_id === o.id) || null,
  }));

  return NextResponse.json({
    orgs: withBoxes,
    needsMigration,
    needsBuyBoxMigration: !!bb.error,
  });
}

export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { name } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: "A buyer name is required." }, { status: 400 });

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

// Update a firm: rename, toggle active, set logos.
export async function PATCH(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id, name, active, logo_url, logo_dark_url } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "A buyer id is required." }, { status: 400 });

  const patch = {};
  if (typeof name === "string" && name) patch.name = name;
  if (typeof active === "boolean") patch.active = active;
  if (logo_url !== undefined) patch.logo_url = logo_url || null;
  if (logo_dark_url !== undefined) patch.logo_dark_url = logo_dark_url || null;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("buyer_orgs")
    .update(patch)
    .eq("id", id)
    .select("id, name, slug, active, logo_url, logo_dark_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deactivating a firm should end its people's sessions immediately,
  // not at expiry.
  if (patch.active === false) {
    const { data: users } = await admin().from("buyer_users").select("id").eq("org_id", id);
    for (const u of users || []) {
      await admin().from("buyer_sessions").delete().eq("user_id", u.id);
    }
  }

  return NextResponse.json({ org: data });
}

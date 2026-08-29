import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Must stay in step with SECTIONS in components/ClubProForma.jsx.
// Kept as a plain list rather than imported because that file is a
// client component and this route runs on the server.
const BUYER_VIEW_IDS = [
  "summary",
  "numbers",
  "property",
  "market",
  "diligence",
  "syndication",
];

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const USERS = "buyer_users(id, email, name, active, last_login_at, password_hash)";
  // Widest first, then fall back a column group at a time. Migration
  // 021 adds the logos, 038 adds enabled_views; selecting a column
  // that does not exist fails the whole query and would show an empty
  // buyer list rather than the firms that are actually there.
  const selects = [
    `id, name, slug, active, logo_url, logo_dark_url, enabled_views, created_at, ${USERS}`,
    `id, name, slug, active, logo_url, logo_dark_url, created_at, ${USERS}`,
    `id, name, slug, active, created_at, ${USERS}`,
  ];

  // Migration 021 adds the logo columns. Selecting a column that
  // doesn't exist fails the whole query, which would show an empty
  // list rather than the buyers that are actually there — so fall
  // back and tell the caller what's missing.
  let data = null;
  let lastError = null;
  let needsMigration = false;
  for (let i = 0; i < selects.length; i++) {
    const res = await admin().from("buyer_orgs").select(selects[i]).order("name");
    if (!res.error) {
      data = res.data;
      needsMigration = i > 0;
      break;
    }
    lastError = res.error;
  }
  if (data === null) {
    return NextResponse.json({ error: lastError?.message || "Query failed." }, { status: 500 });
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

  const { id, name, active, logo_url, logo_dark_url, enabled_views } =
    await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "A buyer id is required." }, { status: 400 });

  const patch = {};
  if (typeof name === "string" && name) patch.name = name;
  if (typeof active === "boolean") patch.active = active;
  if (logo_url !== undefined) patch.logo_url = logo_url || null;
  if (logo_dark_url !== undefined) patch.logo_dark_url = logo_dark_url || null;
  // Validated against a fixed list rather than stored as sent: this
  // column decides what a buyer can see, so an unrecognised id should
  // be dropped here and not discovered later as a blank tile.
  if (Array.isArray(enabled_views)) {
    patch.enabled_views = enabled_views.filter((v) => BUYER_VIEW_IDS.includes(v));
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("buyer_orgs")
    .update(patch)
    .eq("id", id)
    .select("id, name, slug, active, logo_url, logo_dark_url, enabled_views")
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

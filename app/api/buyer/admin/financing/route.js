import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Lender options offered TO buyers. Writes only to
// deal_financing_options — deal_financing, which holds our own
// acquisition terms, is not reachable from this route.

const NUMERIC = ["max_ltv_pct", "rate_from_pct", "term_months", "min_dscr", "points", "sort_order"];
const TEXT = [
  "label", "lender_name", "loan_type",
  "contact_name", "contact_email", "contact_phone", "summary",
];

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { data, error } = await admin()
    .from("deal_financing_options")
    .select("*, deals(slug, address_line)")
    .order("sort_order")
    .order("created_at", { ascending: false });

  // Missing table means migration 026 hasn't run — say so rather than
  // showing an empty list that looks like "nothing configured".
  if (error) return NextResponse.json({ options: [], unavailable: true });
  return NextResponse.json({ options: data || [] });
}

export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.label) {
    return NextResponse.json({ error: "Give the option a name." }, { status: 400 });
  }

  const patch = {};
  for (const k of TEXT) if (k in body) patch[k] = body[k] || null;
  for (const k of NUMERIC) {
    if (k in body) {
      const v = body[k];
      patch[k] = v === "" || v === null || v === undefined ? null : Number(v);
      if (patch[k] !== null && !Number.isFinite(patch[k])) {
        return NextResponse.json({ error: `${k} must be a number.` }, { status: 400 });
      }
    }
  }
  if ("active" in body) patch.active = body.active !== false;

  // A slug scopes the option to one property; blank means every one.
  if ("slug" in body) {
    if (body.slug) {
      const { data: deal } = await admin()
        .from("deals").select("id").eq("slug", body.slug).maybeSingle();
      if (!deal) return NextResponse.json({ error: "Property not found." }, { status: 404 });
      patch.deal_id = deal.id;
    } else {
      patch.deal_id = null;
    }
  }

  const q = body.id
    ? admin().from("deal_financing_options").update(patch).eq("id", body.id)
    : admin().from("deal_financing_options").insert(patch);

  const { data, error } = await q.select("*, deals(slug, address_line)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ option: data });
}

export async function DELETE(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "An id is required." }, { status: 400 });

  const { error } = await admin().from("deal_financing_options").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

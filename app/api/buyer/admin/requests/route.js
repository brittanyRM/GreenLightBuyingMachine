import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { data, error } = await admin()
    .from("buyer_requests")
    .select("*, buyer_orgs(name), buyer_users(email, name), deals(slug, address_line), buyer_request_files(id, file_name, file_type, public_url, size_bytes)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ requests: [], unavailable: true });
  return NextResponse.json({ requests: data || [] });
}

// Answer a request, or move it along.
export async function PATCH(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id, status, response } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "An id is required." }, { status: 400 });

  const patch = {};
  if (["new", "in_progress", "answered", "closed"].includes(status)) patch.status = status;
  if (typeof response === "string") {
    patch.response = response || null;
    patch.responded_at = response ? new Date().toISOString() : null;
    if (response && !patch.status) patch.status = "answered";
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("buyer_requests")
    .update(patch)
    .eq("id", id)
    .select("id, status, response, responded_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}

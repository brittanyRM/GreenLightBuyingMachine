import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { getBuyerFromRequest, BUYER_VISIBLE_STATUS } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

const KINDS = ["comps", "market", "other"];
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "text/csv"];

// A buyer's own documents on a property. Reference only — nothing here
// is read by any calculation, and a buyer can only see their own org's.
export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const slug = new URL(req.url).searchParams.get("slug");
  const { data: deal } = await admin()
    .from("deals").select("id").eq("slug", slug || "").maybeSingle();
  if (!deal) return NextResponse.json({ uploads: [] });

  const { data, error } = await admin()
    .from("buyer_uploads")
    .select("id, label, kind, public_url, file_type, note, created_at")
    .eq("deal_id", deal.id)
    .eq("org_id", buyer.org.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ uploads: [], unavailable: true });
  return NextResponse.json({ uploads: data || [] });
}

export async function POST(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slug = form?.get("slug");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 15 MB." }, { status: 400 });
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "PDF, PNG, JPEG or CSV only." },
      { status: 400 }
    );
  }

  const { data: deal } = await admin()
    .from("deals")
    .select("id")
    .eq("slug", slug || "")
    .in("status", BUYER_VISIBLE_STATUS)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const kind = KINDS.includes(form.get("kind")) ? form.get("kind") : "comps";
  const safe = String(file.name || "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80);

  // Namespaced by org so one buyer's papers can't collide with another's.
  const path = `buyer-uploads/${buyer.org.id}/${deal.id}/${Date.now()}-${safe}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const up = await admin()
    .storage.from("deal-photos")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream" });

  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const { data: pub } = admin().storage.from("deal-photos").getPublicUrl(path);

  const { data, error } = await admin()
    .from("buyer_uploads")
    .insert({
      deal_id: deal.id,
      org_id: buyer.org.id,
      buyer_user_id: buyer.id,
      label: form.get("label") || file.name || null,
      kind,
      storage_path: path,
      public_url: pub?.publicUrl || null,
      file_type: file.type || null,
      file_size_bytes: file.size,
      note: form.get("note") || null,
    })
    .select("id, label, kind, public_url, file_type, note, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ upload: data });
}

export async function DELETE(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "An id is required." }, { status: 400 });

  // Scoped to their own org — a buyer can't remove anyone else's.
  const { data: row } = await admin()
    .from("buyer_uploads")
    .select("id, storage_path, org_id")
    .eq("id", id)
    .eq("org_id", buyer.org.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await admin().storage.from("deal-photos").remove([row.storage_path]);
  await admin().from("buyer_uploads").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}

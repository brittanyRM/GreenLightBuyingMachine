import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { admin } from "../../../../lib/supabaseAdmin";
import { getBuyerFromRequest } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Buyer uploads are untrusted. Three limits, all enforced here rather
// than in the browser where they can be bypassed:
//   type   — documents and images only, no archives, nothing executable
//   size   — 10MB a file, 5 files a request
//   path   — segregated under _buyer-uploads/{org}/ and never mixed
//            with our own deal media
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const KINDS = ["market_research", "comp_review", "question"];

export async function POST(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }

  const kind = KINDS.includes(form.get("kind")) ? form.get("kind") : "market_research";
  const subject = String(form.get("subject") || "").slice(0, 300) || null;
  const note = String(form.get("note") || "").slice(0, 4000) || null;
  const slug = form.get("slug");

  const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size);

  if (!note && !subject && !files.length) {
    return NextResponse.json({ error: "Add a note or a file." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Up to ${MAX_FILES} files at a time.` },
      { status: 400 }
    );
  }

  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${f.name} is over 10MB.` },
        { status: 400 }
      );
    }
    if (!ALLOWED[f.type]) {
      return NextResponse.json(
        { error: `${f.name}: PDF, image, CSV or spreadsheet only.` },
        { status: 400 }
      );
    }
  }

  // Resolve the deal server-side; a slug from the client is only a hint.
  let dealId = null;
  if (slug) {
    const { data: deal } = await admin()
      .from("deals")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    dealId = deal?.id ?? null;
  }

  const { data: request, error } = await admin()
    .from("buyer_requests")
    .insert({
      org_id: buyer.org.id,
      buyer_user_id: buyer.id,
      deal_id: dealId,
      kind,
      subject,
      note,
    })
    .select("id, kind, subject, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stored = [];
  for (const f of files) {
    const ext = ALLOWED[f.type];
    // Original name is kept as a label only. The stored name is ours,
    // so a crafted filename can't shape the path.
    const path = `_buyer-uploads/${buyer.org.id}/${request.id}/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await f.arrayBuffer());

    const { error: upErr } = await admin()
      .storage.from("deal-photos")
      .upload(path, bytes, { contentType: f.type, upsert: false });

    if (upErr) continue;

    const { data: pub } = admin().storage.from("deal-photos").getPublicUrl(path);

    const { data: row } = await admin()
      .from("buyer_request_files")
      .insert({
        request_id: request.id,
        file_name: String(f.name).slice(0, 200),
        storage_path: path,
        public_url: pub?.publicUrl ?? null,
        file_type: ext,
        size_bytes: f.size,
      })
      .select("id, file_name, file_type")
      .single();

    if (row) stored.push(row);
  }

  return NextResponse.json({ request: { ...request, files: stored } });
}

// A buyer's own request history.
export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await admin()
    .from("buyer_requests")
    .select("id, kind, subject, note, status, response, responded_at, created_at, deals(slug, address_line), buyer_request_files(id, file_name, file_type, public_url)")
    .eq("org_id", buyer.org.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ requests: [], unavailable: true });
  return NextResponse.json({ requests: data || [] });
}

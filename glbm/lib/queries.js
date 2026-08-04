import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================
// DEALS
// ============================================================
export async function listDeals(status = null) {
  let q = supabase
    .from("deals")
    .select("id, slug, address_line, city, state, zip, status, bedrooms, bathrooms, list_price, post_reno_sqft, hero_image_url, updated_at")
    .order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Everything the pro forma, flyer, and email need, in one round trip.
export async function getDealBundle(slug) {
  const { data: deal, error } = await supabase
    .from("deals")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw error;

  const [rooms, comps, market, org, docs] = await Promise.all([
    supabase.from("deal_rooms").select("*").eq("deal_id", deal.id).order("room_number"),
    supabase.from("deal_comps").select("*").eq("deal_id", deal.id),
    supabase.from("padsplit_market").select("*").eq("zip", deal.zip).maybeSingle(),
    supabase.from("org_assumptions").select("key, value"),
    supabase.from("deal_documents_current").select("*").eq("deal_id", deal.id),
  ]);

  return {
    deal,
    rooms: rooms.data || [],
    comps: comps.data || [],
    market: market.data || null,
    orgRows: org.data || [],
    documents: docs.data || [],
  };
}

export async function saveDeal(deal) {
  const { data, error } = await supabase
    .from("deals")
    .upsert(deal, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function slugify(address, city) {
  return `${address} ${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================
// ROOMS — the sketch tool writes here
// ============================================================
export async function saveRooms(dealId, rooms) {
  // Replace the layout wholesale. Rooms are cheap; partial diffs aren't
  // worth the complexity when someone redraws a plan.
  const { error: delErr } = await supabase
    .from("deal_rooms")
    .delete()
    .eq("deal_id", dealId);
  if (delErr) throw delErr;

  if (!rooms.length) return [];

  const payload = rooms.map((r) => ({
    deal_id: dealId,
    room_number: r.room_number,
    label: r.label,
    room_type: r.room_type,
    bath_label: r.bath_label,
    weekly_rate: r.weekly_rate,
    rate_source: r.weekly_rate != null ? "manual" : "market",
    premium_note: r.premium_note,
    plan_x: r.plan_x,
    plan_y: r.plan_y,
  }));

  const { data, error } = await supabase.from("deal_rooms").insert(payload).select();
  if (error) throw error;

  // Keep the headline counts on the deal in sync with the layout.
  const bedrooms = rooms.filter((r) => r.room_type !== "bath" && r.room_type !== "common").length;
  const ensuites = rooms.filter((r) => r.room_type === "ensuite").length;
  await supabase.from("deals").update({ bedrooms, ensuite_count: ensuites }).eq("id", dealId);

  return data;
}

// ============================================================
// SKETCH UPLOAD
// ============================================================
export async function uploadSketch(dealId, file) {
  const ext = file.name.split(".").pop();
  const path = `${dealId}/assessor-sketch-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("deal-sketches")
    .upload(path, file, { upsert: true });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from("deal-sketches")
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  await supabase.from("deals").update({ floor_plan_url: signed.signedUrl }).eq("id", dealId);
  return signed.signedUrl;
}

// ============================================================
// PADSPLIT MARKET — manual entry, cached by ZIP
// ============================================================
export async function upsertMarket(market) {
  const { data, error } = await supabase
    .from("padsplit_market")
    .upsert({ ...market, fetched_at: new Date().toISOString() }, { onConflict: "zip" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function marketIsStale(market, days = 60) {
  if (!market?.fetched_at) return true;
  const age = (Date.now() - new Date(market.fetched_at)) / 86400000;
  return age > days;
}

// ============================================================
// COMPS
// ============================================================
export async function saveComps(dealId, comps) {
  await supabase.from("deal_comps").delete().eq("deal_id", dealId);
  if (!comps.length) return [];
  const { data, error } = await supabase
    .from("deal_comps")
    .insert(comps.map((c) => ({ ...c, deal_id: dealId })))
    .select();
  if (error) throw error;
  return data;
}

// ============================================================
// SNAPSHOTS — what a buyer actually saw
// ============================================================
export async function createSnapshot({ dealId, scenario, inputs, outputs, contactId }) {
  const share_token = crypto.randomUUID().replace(/-/g, "");
  const { data, error } = await supabase
    .from("pro_forma_snapshots")
    .insert({
      deal_id: dealId,
      scenario,
      inputs,
      outputs,
      sent_to_contact_id: contactId || null,
      share_token,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSnapshotByToken(token) {
  const { data, error } = await supabase
    .from("pro_forma_snapshots")
    .select("*, deals(*)")
    .eq("share_token", token)
    .single();
  if (error) throw error;
  await supabase.rpc("mark_snapshot_viewed", { token });
  return data;
}

// ============================================================
// DOCUMENTS
// ============================================================
export async function recordDocument({ dealId, docType, title, file, fileType, sourceSnapshot }) {
  const { data: existing } = await supabase
    .from("deal_documents")
    .select("version")
    .eq("deal_id", dealId)
    .eq("doc_type", docType)
    .order("version", { ascending: false })
    .limit(1);

  const version = (existing?.[0]?.version || 0) + 1;
  let storage_path = null;
  let public_url = null;

  if (file) {
    storage_path = `${dealId}/${docType}-v${version}.${fileType}`;
    const { error } = await supabase.storage
      .from("deal-documents")
      .upload(storage_path, file, { upsert: true });
    if (error) throw error;
    const { data: signed } = await supabase.storage
      .from("deal-documents")
      .createSignedUrl(storage_path, 60 * 60 * 24 * 365);
    public_url = signed.signedUrl;
  }

  const { data, error } = await supabase
    .from("deal_documents")
    .insert({
      deal_id: dealId,
      doc_type: docType,
      version,
      title,
      storage_path,
      public_url,
      file_type: fileType,
      file_size_bytes: file?.size || null,
      source_snapshot: sourceSnapshot || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// BUYERS & OUTREACH
// ============================================================
export async function listBuyers({ zip, price } = {}) {
  let q = supabase.from("deal_contacts").select("*").eq("buyer_status", "active");
  const { data, error } = await q;
  if (error) throw error;
  if (!zip && !price) return data;
  return data.filter((b) => {
    const zipOk = !zip || !b.markets?.length || b.markets.includes(zip);
    const priceOk =
      !price ||
      ((b.min_price == null || price >= b.min_price) &&
        (b.max_price == null || price <= b.max_price));
    return zipOk && priceOk;
  });
}

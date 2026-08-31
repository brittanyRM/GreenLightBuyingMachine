import { createClient } from "@supabase/supabase-js";

// Created on first use, not at import time. Next.js evaluates modules
// while collecting page data during the build, and env vars aren't
// guaranteed to be present then — building shouldn't require a database.
let _client = null;

function getClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  _client = createClient(url, key);
  return _client;
}

// Proxy so every `supabase.from(...)` call site stays unchanged.
export const supabase = new Proxy(
  {},
  {
    get(_, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
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

  const [rooms, comps, market, org, docs, settings] = await Promise.all([
    supabase.from("deal_rooms").select("*").eq("deal_id", deal.id).order("room_number"),
    supabase.from("deal_comps").select("*").eq("deal_id", deal.id),
    supabase.from("padsplit_market").select("*").eq("zip", deal.zip).maybeSingle(),
    supabase.from("org_assumptions").select("key, value"),
    supabase.from("deal_documents_current").select("*").eq("deal_id", deal.id),
    supabase.from("org_settings").select("key, value"),
  ]);

  // Brand defaults fill anything the deal hasn't overridden, so a new
  // flyer is presentable before a single photo is uploaded.
  const defaults = (settings.data || []).reduce(
    (acc, r) => ({ ...acc, [r.key]: r.value }),
    {}
  );

  // Sign the sketch fresh. Deals uploaded before migration 012 have a
  // long-lived URL and no path; those keep working until re-uploaded.
  if (deal.floor_plan_path) {
    deal.floor_plan_url = await signSketch(deal.floor_plan_path);
  }

  return {
    deal,
    rooms: rooms.data || [],
    comps: comps.data || [],
    market: market.data || null,
    orgRows: org.data || [],
    documents: docs.data || [],
    defaults,
  };
}

// Every /api route now requires a signed-in user, so the browser has
// to send its access token. Use this instead of bare fetch for any
// call to /api — it attaches the header and turns an expired session
// into a message that says so rather than a confusing 401 body.
export async function apiFetch(url, { body, headers = {}, ...rest } = {}) {
  // Each stage reports separately. A single try around all of this
  // produced a bare DOM message with no indication of whether the
  // session, the headers or the request itself had failed.
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? null;
  } catch (e) {
    throw new Error(`Couldn't read your sign-in session: ${e.message}`);
  }

  // Built through the Headers API rather than an object literal, and
  // every value coerced and trimmed. Safari rejects a header value
  // with stray whitespace or a non-ASCII character by throwing
  // "The string did not match the expected pattern" — from fetch,
  // with nothing to say which header caused it.
  const h = new Headers();
  const setHeader = (k, v) => {
    const raw = String(v).trim();
    // A header value has to be a ByteString. One character outside
    // Latin-1 makes Headers.set throw, and Safari reports it as
    // "The string did not match the expected pattern" from fetch,
    // naming neither the header nor the character.
    const clean = raw.replace(/[^\x20-\x7E]/g, "");
    try {
      h.set(k, clean);
    } catch (e) {
      throw new Error(
        `Header "${k}" was rejected: ${e.message}. ` +
          (k === "Authorization"
            ? "The sign-in token looks malformed — sign out and back in."
            : "")
      );
    }
    return clean !== raw;
  };

  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    setHeader(k, v);
  }

  if (token) {
    const stripped = setHeader("Authorization", `Bearer ${token}`);
    if (stripped) {
      console.warn(
        "[apiFetch] the access token contained characters a header can't carry; they were removed. If requests 401, sign out and back in."
      );
    }
  }

  let res;
  try {
    res = await fetch(url, {
      ...rest,
      method: rest.method || "POST",
      headers: h,
      body,
    });
  } catch (e) {
    throw new Error(`Request to ${url} failed: ${e.message}`);
  }

  if (res.status === 401) {
    let msg = "Your session has expired. Sign in again.";
    try {
      msg = (await res.clone().json()).error || msg;
    } catch {}
    throw new Error(msg);
  }

  return res;
}

// Partial edits to an existing deal. upsert would need every
// not-null column present, so patching a single field through it
// fails on slug.
export async function updateDeal(id, patch) {
  const { data, error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
    // Which bedroom a bathroom opens from. Recorded rather than
    // inferred from position — two baths side by side between two
    // bedrooms are indistinguishable by geometry.
    serves_label: r.serves_label || null,
    weekly_rate: r.weekly_rate,
    rate_source: r.weekly_rate != null ? "manual" : "market",
    premium_note: r.premium_note,
    plan_x: r.plan_x,
    plan_y: r.plan_y,
    plan_w: r.plan_w,
    plan_h: r.plan_h,
  }));

  const { data, error } = await supabase.from("deal_rooms").insert(payload).select();
  if (error) throw error;

  // Keep the headline counts on the deal in sync with the layout.
  const bedrooms = rooms.filter(
    (r) => r.room_type === "shared" || r.room_type === "ensuite"
  ).length;
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
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    if (/row-level security|not authorized/i.test(error.message)) {
      throw new Error("storage policies missing — run migration 006");
    }
    if (/bucket not found/i.test(error.message)) {
      throw new Error("the deal-sketches bucket doesn't exist — run migration 002");
    }
    if (/exceeded|too large|payload/i.test(error.message)) {
      throw new Error(
        `the file is ${(file.size / 1048576).toFixed(1)}MB, over the bucket limit`
      );
    }
    throw new Error(error.message);
  }

  // The path is what's stored — it never expires. The URL below is
  // signed for this session only; the loader re-signs on every read.
  await supabase
    .from("deals")
    .update({ floor_plan_path: path, floor_plan_url: null })
    .eq("id", dealId);

  return signSketch(path);
}

// A short-lived signed URL for a sketch. Twelve hours is far longer
// than a session and short enough that a leaked link is worthless.
export async function signSketch(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("deal-sketches")
    .createSignedUrl(path, 60 * 60 * 12);
  if (error) return null;
  return data?.signedUrl || null;
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

export async function getSettings() {
  const { data, error } = await supabase.from("org_settings").select("*");
  if (error) throw error;
  return (data || []).reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
}

export async function saveSetting(key, value) {
  const { error } = await supabase
    .from("org_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export function marketIsStale(market, days = 60) {
  if (!market?.fetched_at) return true;
  const age = (Date.now() - new Date(market.fetched_at)) / 86400000;
  return age > days;
}

// ============================================================
// COMPS
// ============================================================
// Merge rather than replace.
//
// This used to delete every comp on the deal and insert the new set.
// That is fine when one paste is the whole truth, and destructive the
// moment it isn't: re-running an extraction over a packet that happens
// to contain fewer rows silently threw away the rest, including comps
// added by hand and the geocoding done since.
//
// Now an incoming row either matches something already there and
// updates it, or it is new and gets inserted. Nothing is removed
// unless replace is asked for explicitly.
//
// Matching is on the MLS number where there is one, and on a
// normalised address otherwise — the paste box has no MLS numbers, and
// "4539 W Sweetwater Ave" and "4539 W SWEETWATER AVE," are the same
// house.
const mlsKey = (c) =>
  c.mls_number ? `mls:${String(c.mls_number).replace(/\D/g, "")}` : null;

const addrKey = (c) =>
  c.address
    ? `addr:${String(c.address)
        .toLowerCase()
        .replace(/[.,]/g, "")
        .replace(/\s+/g, " ")
        .trim()}`
    : null;

// Two keys per row, tried in order, because a comp can arrive by one
// route and come back by another. Rows saved from an early paste have
// no MLS number at all; the same house re-imported from a flexmls
// export does. Keying on MLS alone would treat those as different
// comps and insert a duplicate beside the original — so the address is
// checked as well, and matching on either counts as the same house.
const compKeys = (c) => [mlsKey(c), addrKey(c)].filter(Boolean);

// Fields a re-read can legitimately change. deal_id and id never move,
// and the geocode is left alone — it was resolved from the address and
// re-running an import should not undo it.
const MERGE_FIELDS = [
  "mls_number",
  "address",
  "comp_status",
  "list_price",
  "sold_price",
  "sold_date",
  "approx_sqft",
  "price_per_sqft",
  "adom",
  "cdom",
  "bedrooms",
  "bathrooms",
  "year_built",
  "distance_miles",
  "notes",
  "source",
  "observed_on",
];

export async function saveComps(dealId, comps, { replace = false } = {}) {
  if (replace) {
    await supabase.from("deal_comps").delete().eq("deal_id", dealId);
  }

  // Two rows in one paste can describe the same house. Last wins, which
  // matches how a person reading top to bottom would expect a
  // correction further down the sheet to be the one that counts.
  const incoming = new Map();
  for (const c of comps) {
    const keys = compKeys(c);
    if (!keys.length) continue;
    // Drop any earlier row this one supersedes under either key.
    for (const k of keys) for (const [ek, ev] of incoming) if (compKeys(ev).includes(k)) incoming.delete(ek);
    incoming.set(keys[0], c);
  }

  const { data: existing, error: readErr } = await supabase
    .from("deal_comps")
    .select("*")
    .eq("deal_id", dealId);
  if (readErr) throw readErr;

  const prior = new Map();
  for (const c of existing || []) for (const k of compKeys(c)) prior.set(k, c);

  const toInsert = [];
  const toUpdate = [];
  const claimed = new Set();
  for (const [, c] of incoming) {
    const found = compKeys(c)
      .map((k) => prior.get(k))
      .find((r) => r && !claimed.has(r.id));
    if (found) claimed.add(found.id);
    if (!found) {
      toInsert.push({ ...c, deal_id: dealId });
      continue;
    }
    // Only send fields that actually differ, and only ones the
    // incoming row has an opinion about. A paste with no sale date
    // should not blank a date already on the record.
    const patch = {};
    for (const f of MERGE_FIELDS) {
      if (!(f in c) || c[f] == null) continue;
      if (String(found[f] ?? "") !== String(c[f])) patch[f] = c[f];
    }
    if (Object.keys(patch).length) toUpdate.push({ id: found.id, patch });
  }

  let inserted = [];
  if (toInsert.length) {
    const { data, error } = await supabase.from("deal_comps").insert(toInsert).select();
    if (error) throw error;
    inserted = data || [];
  }

  for (const u of toUpdate) {
    const { error } = await supabase.from("deal_comps").update(u.patch).eq("id", u.id);
    if (error) throw error;
  }

  const { data: after } = await supabase.from("deal_comps").select("*").eq("deal_id", dealId);

  return {
    rows: after || [],
    inserted: inserted.length,
    updated: toUpdate.length,
    unchanged: incoming.size - inserted.length - toUpdate.length,
    kept: (existing || []).length - toUpdate.length,
  };
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

// Parse a response as JSON, or explain what came back instead.
//
// res.json() on a non-JSON body throws a bare SyntaxError — and
// Safari words it "The string did not match the expected pattern",
// which says nothing about the status or the content. A 500 that
// returns an HTML error page looked identical to a malformed header.
export async function apiJson(res) {
  const text = await res.text();

  if (!text) {
    throw new Error(
      `The server returned an empty response (HTTP ${res.status}). ` +
        (res.status === 504
          ? "The request timed out — the render takes up to five minutes."
          : "Check the function logs in Vercel.")
    );
  }

  try {
    const json = JSON.parse(text);
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  } catch (e) {
    if (e instanceof SyntaxError) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      throw new Error(
        `The server returned ${res.status} with a non-JSON body: ${snippet}`
      );
    }
    throw e;
  }
}

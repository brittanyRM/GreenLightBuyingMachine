// ============================================================
// Buyer auth — server only.
//
// Never import this into a component. It reaches the database with
// the service-role client, which bypasses RLS.
//
// Passwords use node:crypto scrypt rather than bcrypt so the portal
// adds no dependency to package.json.
// ============================================================

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { admin } from "./supabaseAdmin";

const scrypt = promisify(_scrypt);

const SESSION_DAYS = 14;
const MAGIC_MINUTES = 30;
export const BUYER_COOKIE = "glbm_buyer";

// ---------- passwords ----------

export async function hashPassword(password) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const key = await scrypt(password, salt, 64);
  const known = Buffer.from(hash, "hex");

  // Length check first — timingSafeEqual throws on a mismatch.
  if (known.length !== key.length) return false;
  return timingSafeEqual(known, key);
}

// ---------- sessions ----------

export async function createSession(userId, userAgent = null) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);

  const { error } = await admin()
    .from("buyer_sessions")
    .insert({
      token,
      user_id: userId,
      expires_at: expires.toISOString(),
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
    });
  if (error) throw error;

  await admin()
    .from("buyer_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);

  return { token, expires };
}

// Resolves a cookie to a buyer, or null. Also the place inactive
// accounts and dead orgs get shut out — deactivating either one
// takes effect on the next request rather than at expiry.
export async function getBuyerFromRequest(req) {
  const token = readCookie(req, BUYER_COOKIE);
  if (!token) return null;

  const { data: session } = await admin()
    .from("buyer_sessions")
    .select("token, user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    await admin().from("buyer_sessions").delete().eq("token", token);
    return null;
  }

  const { data: user } = await admin()
    .from("buyer_users")
    .select("id, org_id, email, name, active, buyer_orgs!inner(id, name, slug, active, logo_url, logo_dark_url, enabled_views)")
    .eq("id", session.user_id)
    .maybeSingle();

  if (!user || !user.active || !user.buyer_orgs?.active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    org: {
      id: user.buyer_orgs.id,
      name: user.buyer_orgs.name,
      slug: user.buyer_orgs.slug,
      logoUrl: user.buyer_orgs.logo_url || null,
      logoDarkUrl: user.buyer_orgs.logo_dark_url || user.buyer_orgs.logo_url || null,
      // Which sections of the deal sheet this firm may see. Null only
      // if the column has not been migrated yet, in which case the
      // deal route falls back to the pre-entitlement set.
      enabledViews: user.buyer_orgs.enabled_views || null,
    },
  };
}

export async function destroySession(req) {
  const token = readCookie(req, BUYER_COOKIE);
  if (token) await admin().from("buyer_sessions").delete().eq("token", token);
}

export function sessionCookie(token, expires) {
  const parts = [
    `${BUYER_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie() {
  return `${BUYER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ---------- magic links ----------

export async function createMagicLink(email) {
  const { data: user } = await admin()
    .from("buyer_users")
    .select("id, email, name, active")
    .ilike("email", email)
    .maybeSingle();

  // Returns null for unknown or inactive accounts. The caller responds
  // identically either way, so this endpoint can't be used to discover
  // which addresses have portal access.
  if (!user || !user.active) return null;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MAGIC_MINUTES * 60000);

  const { error } = await admin().from("buyer_magic_links").insert({
    token,
    user_id: user.id,
    expires_at: expires.toISOString(),
  });
  if (error) throw error;

  return { token, user, expires };
}

export async function consumeMagicLink(token) {
  if (!token) return null;

  const { data: link } = await admin()
    .from("buyer_magic_links")
    .select("token, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.used_at) return null;
  if (new Date(link.expires_at) < new Date()) return null;

  await admin()
    .from("buyer_magic_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  return link.user_id;
}

// ---------- team guard ----------

// Admin routes are called from the team app, which does hold a
// Supabase JWT. Verify it rather than trusting the caller.
export async function requireTeam(req) {
  const header = req.headers.get("authorization") || "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!jwt) return null;

  const { data, error } = await admin().auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// ---------- field whitelist ----------

// The single point where deal data crosses to a buyer.
//
// An allow-list, not a deny-list: a column added to deals later is
// invisible here until someone deliberately adds it. purchase_price,
// rehab_budget and furniture_budget are seller-side and must never
// appear below.
export const BUYER_DEAL_FIELDS = [
  "id",
  "slug",
  "status",
  "address_line",
  "city",
  "state",
  "zip",
  "county",
  "latitude",
  "longitude",
  "year_built",
  "lot_sqft",
  "living_area_sqft",
  "post_reno_sqft",
  "shared_weekly_rate",
  "ensuite_weekly_rate",
  "finished_sqft",
  "bedrooms",
  "bathrooms",
  "ensuite_count",
  "construction_type",
  "roof_material",
  "zoning",
  "school_district",
  "list_price",
  "disposition_coe",
  "reno_complete_date",
  "reno_complete_estimated",
  "hero_image_url",
  // The rendered plan the flyer publishes, not floor_plan_url, which
  // is a dimensioned working drawing and stays internal.
  "marketed_floor_plan_url",
  "gallery",
  "updated_at",
];

export const BUYER_DEAL_SELECT = BUYER_DEAL_FIELDS.join(", ");

// Which deals a buyer may see. One place, one rule.
export const BUYER_VISIBLE_STATUS = ["for_sale"];

// A deal a firm has been assigned is visible to that firm whatever its
// status.
//
// Assignment used to only take a deal away from other buyers — it
// filtered rivals out but could not let anyone in, so a deal assigned
// to a firm while still in underwriting appeared to nobody. "Assigned
// to me" plainly reads as "I can see it", and the first thing anyone
// does after assigning is go and look.
//
// Sold is still excluded. Showing a firm a house that has gone is a
// worse failure than not showing them one early.
export const BUYER_ASSIGNED_HIDDEN_STATUS = ["sold"];

// Assignments this firm holds that are still live. Shared so the list
// and every per-deal route agree about what "live" means — a deal that
// appears in the list and 404s when opened is worse than one that never
// appeared.
export async function liveAssignmentsFor(adminClient, orgId) {
  const { data, error } = await adminClient
    .from("deal_assignments")
    .select("deal_id, org_id, status, expires_at, note");
  if (error) return { mine: {}, exclusiveElsewhere: new Set() };

  const live = (a) =>
    a.status !== "released" && (!a.expires_at || new Date(a.expires_at) > new Date());

  const mine = {};
  const exclusiveElsewhere = new Set();
  for (const a of data || []) {
    if (!live(a)) continue;
    if (a.org_id === orgId) mine[a.deal_id] = a;
    else if (a.status === "exclusive" || a.status === "reserved")
      exclusiveElsewhere.add(a.deal_id);
  }
  return { mine, exclusiveElsewhere };
}

// Can this firm see this deal at all.
export function buyerCanSee(deal, mine) {
  if (!deal) return false;
  const assigned = !!mine?.[deal.id];
  if (assigned) return !BUYER_ASSIGNED_HIDDEN_STATUS.includes(deal.status);
  return BUYER_VISIBLE_STATUS.includes(deal.status);
}

// Belt and braces: strip anything not on the list, in case a select
// is ever widened by accident.
export function scrubDeal(row) {
  if (!row) return null;
  const out = {};
  for (const f of BUYER_DEAL_FIELDS) if (f in row) out[f] = row[f];
  return out;
}

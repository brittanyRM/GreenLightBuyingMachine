import { NextResponse } from "next/server";
import { admin } from "../../../lib/supabaseAdmin";
import { requireTeam } from "../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// ============================================================
// System check.
//
// Most failures in this app are not code failures — they're a
// migration that hasn't run, an environment variable that isn't set,
// or a deal missing the one field a document needs. Each of those
// surfaces as something vaguer: an empty list, a blank panel, a
// section that silently doesn't render.
//
// This route names them. Every check reports what's wrong AND what to
// do about it, because "market_reports missing" is only useful if you
// know it means running migration 032.
// ============================================================

const MIGRATIONS = [
  ["017", "club_proformas", "table", "Club pro forma saves"],
  ["018", "buyer_orgs", "table", "Buyer portal"],
  ["019", "club_share_links", "table", "Share links"],
  ["020", "club_share_links.inputs", "column", "Frozen assumptions on a link"],
  ["021", "buyer_orgs.logo_url", "column", "Buyer logos"],
  ["022", "club_share_links.allow_adjust", "column", "Let buyers stress-test"],
  ["023", "buyer_buy_boxes", "table", "Buy boxes"],
  ["024", "buyer_buy_boxes.scenario", "column", "Buy box yield case"],
  ["025", "deal_financing", "table", "Gap funding and loan steps"],
  ["026", "deal_assignments", "table", "Assigning deals to buyers"],
  ["026", "deal_financing_options", "table", "Lender options"],
  ["027", "deal_financing_options.show_before_interest", "column", "Lender shown up front"],
  ["028", "deal_financing_options.tiers", "column", "Down payment tiers"],
  ["029", "deal_proforma_inputs", "table", "Saving assumptions per deal"],
  ["030", "deals.assumption_overrides", "column", "Per-deal overrides on the record"],
  ["031", "deal_comps.bedrooms", "column", "Comp bed/bath detail"],
  ["031", "deals.finished_sqft", "column", "Finished square footage"],
  ["032", "market_reports", "table", "City market report"],
  ["033", "buyer_requests", "table", "Buyer research requests"],
  ["033", "buyer_uploads", "table", "Buyer document uploads"],
];

const ENV = [
  ["NEXT_PUBLIC_SUPABASE_URL", true, "Everything"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", true, "Everything"],
  ["SUPABASE_SERVICE_ROLE_KEY", true, "Buyer portal, share links, research"],
  ["NEXT_PUBLIC_SITE_URL", true, "Magic links and share link URLs"],
  ["GOOGLE_CLIENT_ID", false, "Gmail sending"],
  ["GOOGLE_CLIENT_SECRET", false, "Gmail sending"],
  ["BUYER_NOTIFY_EMAIL", false, "Alerts when a buyer raises a hand"],
  ["GOOGLE_AI_API_KEY", false, "Floor plan rendering via Gemini"],
  ["OPENAI_API_KEY", false, "Floor plan rendering via OpenAI"],
];

async function exists(target) {
  const [table, column] = target.split(".");
  if (!column) {
    const { error } = await admin().from(table).select("*", { head: true, count: "exact" }).limit(0);
    return !error;
  }
  const { error } = await admin().from(table).select(column, { head: true }).limit(0);
  return !error;
}

export async function GET(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const checks = [];
  const add = (area, name, ok, detail, fix) =>
    checks.push({ area, name, ok, detail, fix: ok ? null : fix });

  // ---------- environment ----------
  for (const [key, required, affects] of ENV) {
    const set = !!process.env[key];
    add(
      "Environment",
      key,
      set || !required,
      set ? "set" : required ? `missing — ${affects} won't work` : `not set — ${affects} disabled`,
      `Add ${key} in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    const url = process.env.NEXT_PUBLIC_SITE_URL;
    const clean = url.startsWith("https://") && !url.endsWith("/");
    add(
      "Environment",
      "NEXT_PUBLIC_SITE_URL format",
      clean,
      clean ? url : `${url} — should start https:// and have no trailing slash`,
      "Magic links and share links are built from this. A wrong value produces URLs that 404."
    );
  }

  // At least one image provider, or the Plan tab can't render.
  const hasImageProvider =
    !!process.env.GOOGLE_AI_API_KEY || !!process.env.OPENAI_API_KEY;
  add(
    "Environment",
    "Floor plan provider",
    hasImageProvider,
    hasImageProvider
      ? `${process.env.RENDER_PROVIDER || "auto"} — ${[
          process.env.GOOGLE_AI_API_KEY && "Gemini",
          process.env.OPENAI_API_KEY && "OpenAI",
        ]
          .filter(Boolean)
          .join(" and ")} available`
      : "neither key set — Draw it again will fail",
    "Set GOOGLE_AI_API_KEY or OPENAI_API_KEY. With both, RENDER_PROVIDER picks."
  );

  // ---------- migrations ----------
  for (const [num, target, kind, feature] of MIGRATIONS) {
    let ok = false;
    try {
      ok = await exists(target);
    } catch {
      ok = false;
    }
    add(
      "Migrations",
      `${num} · ${target}`,
      ok,
      ok ? "applied" : `${kind} missing — ${feature} is broken`,
      `Run supabase/migrations/${num}_*.sql in the SQL editor.`
    );
  }

  // A save that sends null to a NOT NULL column fails the whole write,
  // and the message names the column rather than the cause. Check the
  // two on deals that have bitten before.
  for (const col of ["assumption_overrides", "reno_complete_estimated"]) {
    const { error: nullErr } = await admin()
      .from("deals")
      .select(col)
      .is(col, null)
      .limit(1);
    add(
      "Data",
      `deals.${col}`,
      !nullErr,
      nullErr ? `unreadable — ${nullErr.message}` : "readable",
      "Run migrations 030 and 031; both drop the NOT NULL and normalise existing rows."
    );
  }

  // ---------- data completeness ----------
  const { data: deals } = await admin()
    .from("deals")
    .select("id, slug, address_line, status, list_price, bedrooms, bathrooms, ensuite_count, post_reno_sqft, finished_sqft, hero_image_url, marketed_floor_plan_url, zip")
    .order("updated_at", { ascending: false });

  const forSale = (deals || []).filter((d) => d.status === "for_sale");

  add(
    "Data",
    "Deals for sale",
    forSale.length > 0,
    forSale.length
      ? `${forSale.length} visible to buyers`
      : "none — the buyer portal will be empty",
    "Set a deal's status to for_sale on the Record tab."
  );

  for (const d of forSale) {
    const missing = [];
    if (!d.list_price) missing.push("list price (sharing is blocked without it)");
    if (!d.post_reno_sqft && !d.finished_sqft) missing.push("square footage");
    if (!d.bedrooms) missing.push("bedrooms");
    if (!d.hero_image_url) missing.push("hero photo");
    if (!d.marketed_floor_plan_url) missing.push("marketed floor plan");

    add(
      "Data",
      d.address_line || d.slug,
      missing.length === 0,
      missing.length ? `missing ${missing.join(", ")}` : "complete",
      "Fill these on the deal's Record tab — each one blanks a section of the buyer sheet."
    );

    // Rooms drive income; without them the sheet falls back to the record.
    const { count: roomCount } = await admin()
      .from("deal_rooms")
      .select("*", { head: true, count: "exact" })
      .eq("deal_id", d.id)
      .in("room_type", ["shared", "ensuite"]);

    add(
      "Data",
      `${d.address_line || d.slug} · rooms`,
      (roomCount || 0) > 0,
      roomCount
        ? `${roomCount} rentable rooms`
        : "no room schedule — income is inferred from the record instead",
      "Add rooms on the Plan tab so per-room rates and the floor plan agree."
    );

    // Market row drives occupancy and rates.
    if (d.zip) {
      const { data: mk } = await admin()
        .from("padsplit_market")
        .select("zip, avg_occupancy, shared_weekly, private_weekly")
        .eq("zip", d.zip)
        .maybeSingle();
      add(
        "Data",
        `${d.address_line || d.slug} · market ${d.zip}`,
        !!mk,
        mk
          ? `${Math.round((mk.avg_occupancy || 0) * 100)}% occupancy, $${mk.shared_weekly}/$${mk.private_weekly}`
          : "no PadSplit market row — rates and occupancy fall back to defaults",
        "Add a padsplit_market row for this ZIP."
      );
    }
  }

  // ---------- buyer portal ----------
  const { count: orgCount } = await admin()
    .from("buyer_orgs")
    .select("*", { head: true, count: "exact" })
    .eq("active", true);
  add("Buyer portal", "Active buyers", (orgCount || 0) > 0, `${orgCount || 0} set up`,
    "Add one in Buyers → Buyers & people.");

  const { count: userCount } = await admin()
    .from("buyer_users")
    .select("*", { head: true, count: "exact" })
    .eq("active", true);
  add("Buyer portal", "Buyer logins", (userCount || 0) > 0, `${userCount || 0} active`,
    "Add a person under a buyer, then send them a sign-in link.");

  try {
    const { count: lenderCount } = await admin()
      .from("deal_financing_options")
      .select("*", { head: true, count: "exact" })
      .eq("active", true);
    add("Buyer portal", "Lender options", (lenderCount || 0) > 0,
      lenderCount ? `${lenderCount} configured` : "none — buyers see a placeholder",
      "Add one in Buyers → Lender options.");
  } catch {
    add("Buyer portal", "Lender options", false, "table missing", "Run migration 026.");
  }

  // ---------- email ----------
  try {
    const { data: mail } = await admin()
      .from("email_accounts")
      .select("email, is_default, last_error");
    const def = (mail || []).find((m) => m.is_default);
    add(
      "Email",
      "Google account",
      !!def && !def.last_error,
      !mail?.length
        ? "not connected — magic links and buyer alerts won't send"
        : !def
        ? "connected but none marked default"
        : def.last_error
        ? `error: ${def.last_error}`
        : `sending as ${def.email}`,
      "Connect in Settings, or set is_default on an existing row."
    );
  } catch {
    add("Email", "Google account", false, "email_accounts unreadable", "Check the table exists.");
  }

  const failed = checks.filter((c) => !c.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks,
  });
}

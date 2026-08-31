import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { runClubProForma } from "../../../../lib/proformaClub";
import { inputsFromDeal } from "../../../../lib/proformaClubPresets";
import {
  getBuyerFromRequest,
  BUYER_DEAL_SELECT,
  BUYER_VISIBLE_STATUS,
  BUYER_ASSIGNED_HIDDEN_STATUS,
  liveAssignmentsFor,
  scrubDeal,
} from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Assignments first, because they widen what the status filter
  // allows rather than only narrowing it.
  const { mine, exclusiveElsewhere } = await liveAssignmentsFor(admin(), buyer.org.id);
  const assignedIds = Object.keys(mine);

  // Two reads rather than one: everything for sale, plus anything this
  // firm has been assigned whatever its status. A single .in() on
  // status could not express "for_sale OR assigned to me".
  const [forSale, assigned] = await Promise.all([
    admin()
      .from("deals")
      .select(BUYER_DEAL_SELECT)
      .in("status", BUYER_VISIBLE_STATUS)
      .order("updated_at", { ascending: false }),
    assignedIds.length
      ? admin()
          .from("deals")
          .select(BUYER_DEAL_SELECT)
          .in("id", assignedIds)
          .not("status", "in", `(${BUYER_ASSIGNED_HIDDEN_STATUS.join(",")})`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = forSale.error || assigned.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set();
  const data = [];
  for (const d of [...(assigned.data || []), ...(forSale.data || [])]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    data.push(d);
  }

  const visible = data.filter((d) => mine[d.id] || !exclusiveElsewhere.has(d.id));

  // Which of these has this firm already raised a hand on.
  const { data: interest } = await admin()
    .from("deal_interest")
    .select("deal_id, kind, created_at")
    .eq("org_id", buyer.org.id);

  const byDeal = {};
  for (const row of interest || []) {
    if (!byDeal[row.deal_id]) byDeal[row.deal_id] = row.kind;
  }

  // A buyer's own criteria, so the portal can lead with what fits.
  // Table may not exist yet if 023 hasn't run — that just means no
  // ranking, not a broken list.
  const bb = await admin()
    .from("buyer_buy_boxes")
    .select("*")
    .eq("org_id", buyer.org.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const buyBox = bb.error ? null : bb.data || null;

  // Yield floors need a pro forma, and the list only carries the deal
  // record — so rooms and market rates are fetched in two batched
  // queries rather than one per deal, and the engine runs server-side.
  //
  // Skipped entirely when no yield criterion is set, which is the
  // common case and saves the work.
  const needsMetrics =
    buyBox && (buyBox.min_dscr != null || buyBox.min_cap_rate != null);

  let metricsByDeal = {};
  if (needsMetrics && visible.length) {
    const ids = visible.map((d) => d.id);
    const zips = [...new Set(visible.map((d) => d.zip).filter(Boolean))];

    const [{ data: rooms }, { data: markets }] = await Promise.all([
      admin()
        .from("deal_rooms")
        .select("id, deal_id, room_number, label, room_type, weekly_rate")
        .in("deal_id", ids),
      zips.length
        ? admin()
            .from("padsplit_market")
            .select("zip, shared_weekly, private_weekly, avg_occupancy")
            .in("zip", zips)
        : Promise.resolve({ data: [] }),
    ]);

    const roomsByDeal = {};
    for (const r of rooms || []) (roomsByDeal[r.deal_id] ||= []).push(r);
    const marketByZip = {};
    for (const m of markets || []) marketByZip[m.zip] = m;

    for (const d of visible) {
      try {
        const inputs = inputsFromDeal({
          deal: d,
          rooms: roomsByDeal[d.id] || [],
          market: marketByZip[d.zip] || null,
        });
        const r = runClubProForma(inputs);
        const cap = (s2) =>
          s2.capitalization.unleveredBasis
            ? s2.years[0].noi / s2.capitalization.unleveredBasis
            : 0;
        metricsByDeal[d.id] = {
          bear: { dscr: r.bear.year1Dscr, capRate: cap(r.bear) * 100 },
          base: { dscr: r.base.year1Dscr, capRate: cap(r.base) * 100 },
          bull: { dscr: r.bull.year1Dscr, capRate: cap(r.bull) * 100 },
        };
      } catch {
        // A deal that can't be modelled just doesn't get yield
        // matching — it still lists.
        metricsByDeal[d.id] = null;
      }
    }
  }

  // Brand defaults, so a card without its own photo can fall back the
  // same way the sheet does. Without this the list showed a grey box
  // while the sheet beneath it showed the standard image.
  const { data: settings } = await admin().from("org_settings").select("key, value");
  const defaults = (settings || []).reduce((a, r) => ({ ...a, [r.key]: r.value }), {});

  return NextResponse.json({
    defaults,
    deals: visible.map((d) => ({
      ...scrubDeal(d),
      interest: byDeal[d.id] || null,
      metrics: metricsByDeal[d.id] || null,
      assignment: mine[d.id]
        ? { status: mine[d.id].status, expiresAt: mine[d.id].expires_at, note: mine[d.id].note }
        : null,
    })),
    buyBox,
  });
}

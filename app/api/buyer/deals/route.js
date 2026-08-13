import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { runClubProForma } from "../../../../lib/proformaClub";
import { inputsFromDeal } from "../../../../lib/proformaClubPresets";
import {
  getBuyerFromRequest,
  BUYER_DEAL_SELECT,
  BUYER_VISIBLE_STATUS,
  scrubDeal,
} from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await admin()
    .from("deals")
    .select(BUYER_DEAL_SELECT)
    .in("status", BUYER_VISIBLE_STATUS)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  if (needsMetrics && (data || []).length) {
    const ids = data.map((d) => d.id);
    const zips = [...new Set(data.map((d) => d.zip).filter(Boolean))];

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

    for (const d of data) {
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

  return NextResponse.json({
    deals: (data || []).map((d) => ({
      ...scrubDeal(d),
      interest: byDeal[d.id] || null,
      metrics: metricsByDeal[d.id] || null,
    })),
    buyBox,
  });
}

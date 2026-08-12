import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
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

  return NextResponse.json({
    deals: (data || []).map((d) => ({ ...scrubDeal(d), interest: byDeal[d.id] || null })),
  });
}

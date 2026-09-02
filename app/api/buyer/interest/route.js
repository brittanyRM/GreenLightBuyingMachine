import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import {
  getBuyerFromRequest,
  liveAssignmentsFor,
  buyerCanSee,
} from "../../../../lib/buyerAuth";
import { sendGmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

const KINDS = ["interested", "offer", "passed"];

// A buyer's own history. Scoped to their org by the session.
export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await admin()
    .from("deal_interest")
    .select("id, kind, offer_price, note, status, created_at, deals(slug, address_line, city, state, list_price, hero_image_url)")
    .eq("org_id", buyer.org.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interest: data || [] });
}

export async function POST(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = KINDS.includes(body.kind) ? body.kind : "interested";
  const offer = body.offer_price != null ? Number(body.offer_price) : null;

  if (offer != null && (!Number.isFinite(offer) || offer <= 0)) {
    return NextResponse.json({ error: "That offer amount doesn't look right." }, { status: 400 });
  }

  // Resolve the deal server-side. Trusting a deal_id from the client
  // would let a buyer attach interest to a deal they can't see.
  const { data: deal } = await admin()
    .from("deals")
    .select("id, slug, address_line, city, list_price, status")
    .eq("slug", body.slug || "")
    .maybeSingle();

  if (!deal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The query above no longer filters on status, because a deal this
  // firm is assigned should be reachable whatever its status. That
  // makes the decision this route's job — without it, removing the
  // filter would hand every buyer every deal.
  const { mine } = await liveAssignmentsFor(admin(), buyer.org.id);
  if (!buyerCanSee(deal, mine)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }


  const { data: row, error } = await admin()
    .from("deal_interest")
    .insert({
      deal_id: deal.id,
      buyer_user_id: buyer.id,
      org_id: buyer.org.id,
      kind,
      offer_price: offer,
      note: body.note ? String(body.note).slice(0, 2000) : null,
    })
    .select("id, kind, offer_price, note, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notify = process.env.BUYER_NOTIFY_EMAIL;
  if (notify) {
    const verb =
      kind === "offer" ? "submitted an offer on" : kind === "passed" ? "passed on" : "raised their hand on";
    try {
      await sendGmail({
        to: notify,
        subject: `${buyer.org.name} ${verb} ${deal.address_line}`,
        text: [
          `${buyer.name || buyer.email} (${buyer.org.name}) ${verb} ${deal.address_line}, ${deal.city}.`,
          offer != null ? `Offer: $${offer.toLocaleString()}` : "",
          deal.list_price ? `List: $${Number(deal.list_price).toLocaleString()}` : "",
          body.note ? `\nNote:\n${body.note}` : "",
          "",
          `${process.env.NEXT_PUBLIC_SITE_URL || ""}/buyer-sheets/${deal.slug}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (e) {
      // The record is already saved; a mail failure shouldn't fail
      // the buyer's action.
      console.error("interest notify failed:", e?.message);
    }
  }

  return NextResponse.json({ ok: true, interest: row });
}

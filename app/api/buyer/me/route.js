import { NextResponse } from "next/server";
import { getBuyerFromRequest } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const buyer = await getBuyerFromRequest(req);
  if (!buyer) return NextResponse.json({ buyer: null }, { status: 401 });
  return NextResponse.json({ buyer });
}

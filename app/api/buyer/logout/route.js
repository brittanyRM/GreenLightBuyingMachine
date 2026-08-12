import { NextResponse } from "next/server";
import { destroySession, clearCookie } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  await destroySession(req);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookie());
  return res;
}

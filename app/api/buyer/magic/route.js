import { NextResponse } from "next/server";
import { consumeMagicLink, createSession, sessionCookie } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  const userId = await consumeMagicLink(token);

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  if (!userId) {
    return NextResponse.redirect(`${base}/buyers/login?expired=1`);
  }

  const { token: sessionToken, expires } = await createSession(
    userId,
    req.headers.get("user-agent")
  );

  const res = NextResponse.redirect(`${base}/buyers`);
  res.headers.set("Set-Cookie", sessionCookie(sessionToken, expires));
  return res;
}

import { NextResponse } from "next/server";
import { admin } from "../../../../lib/supabaseAdmin";
import { verifyPassword, createSession, sessionCookie } from "../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const { data: user } = await admin()
    .from("buyer_users")
    .select("id, email, name, password_hash, active, buyer_orgs!inner(active)")
    .ilike("email", email)
    .maybeSingle();

  const ok =
    user && user.active && user.buyer_orgs?.active
      ? await verifyPassword(password, user.password_hash)
      : false;

  // One message for every failure — wrong password, unknown address,
  // disabled account. Otherwise this endpoint reveals which emails
  // have portal access.
  if (!ok) {
    return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  }

  const { token, expires } = await createSession(user.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookie(token, expires));
  return res;
}

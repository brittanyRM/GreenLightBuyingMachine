import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Mint a sign-in link on the team's behalf and hand back the URL.
//
// Useful when Google isn't connected, and honestly better than email
// anyway for a first invite — the link goes out however you're already
// talking to them.
export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { user_id, hours = 48 } = await req.json().catch(() => ({}));
  if (!user_id) return NextResponse.json({ error: "A user id is required." }, { status: 400 });

  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + Math.min(Number(hours) || 48, 168) * 3600e3);

  const { error } = await admin().from("buyer_magic_links").insert({
    token,
    user_id,
    expires_at: expires.toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  return NextResponse.json({
    url: `${base}/api/buyer/magic?token=${token}`,
    expires_at: expires.toISOString(),
  });
}

import { NextResponse } from "next/server";
import { createMagicLink } from "../../../../lib/buyerAuth";
import { sendGmail } from "../../../../lib/gmail";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const link = await createMagicLink(email);

  // Always the same response, whether or not the address exists.
  const generic = NextResponse.json({
    ok: true,
    message: "If that address has portal access, a sign-in link is on its way.",
  });

  if (!link) return generic;

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const url = `${base}/api/buyer/magic?token=${link.token}`;

  try {
    await sendGmail({
      to: link.user.email,
      toName: link.user.name || "",
      subject: "Your Green Light Buying Machine sign-in link",
      text: [
        `Hi${link.user.name ? " " + link.user.name.split(" ")[0] : ""},`,
        "",
        "Here's your sign-in link for the Green Light Buying Machine property portal:",
        "",
        url,
        "",
        "It expires in 30 minutes and can only be used once.",
        "",
        "If you didn't request this, you can ignore it.",
      ].join("\n"),
    });
  } catch (e) {
    // Don't surface the mail failure — it would confirm the address
    // exists. Log it for the team instead.
    console.error("buyer magic link send failed:", e?.message);
  }

  return generic;
}

import { admin } from "../../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET /api/auth/google/callback — exchange the code and store the account.

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");

  if (denied) {
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/settings?error=${encodeURIComponent(denied)}`
    );
  }
  if (!code) {
    return Response.json({ error: "No authorization code returned." }, { status: 400 });
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error);

    // Google only returns a refresh token on first consent. Without one we
    // can't send from the cron, so fail loudly instead of storing a
    // half-connected account.
    if (!tokens.refresh_token) {
      throw new Error(
        "Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions and connect again."
      );
    }

    const meRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const me = await meRes.json();

    const { count } = await admin()
      .from("email_accounts")
      .select("id", { count: "exact", head: true });

    await admin().from("email_accounts").upsert(
      {
        email: me.email,
        display_name: me.name || null,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scopes: (tokens.scope || "").split(" "),
        is_default: (count || 0) === 0,
        last_error: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    return Response.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/settings?connected=${encodeURIComponent(me.email)}`
    );
  } catch (e) {
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/settings?error=${encodeURIComponent(e.message)}`
    );
  }
}

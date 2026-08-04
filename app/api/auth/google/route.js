import { GMAIL_SCOPES } from "../../../../lib/gmail";

// GET /api/auth/google — start the Workspace connection.
// access_type=offline + prompt=consent is what returns a refresh
// token; without both, the cron can't send once the hour is up.

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
}

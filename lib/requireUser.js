import { admin } from "./supabaseAdmin";

// Every /api route runs on the service role key, which bypasses RLS
// entirely. Without a check on the way in, anyone who finds the URL can
// post to them and spend the Anthropic, Gemini and OpenAI budget.
//
// The browser sends its Supabase access token; this verifies it.
// Returns the user, or a Response to return straight back.

export async function requireUser(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return {
      user: null,
      response: Response.json(
        { error: "Not signed in. Reload the page and sign in again." },
        { status: 401 }
      ),
    };
  }

  let data, error;
  try {
    ({ data, error } = await admin().auth.getUser(token));
  } catch (e) {
    return {
      user: null,
      response: Response.json(
        { error: `Couldn't verify your session: ${e.message}` },
        { status: 500 }
      ),
    };
  }

  if (error || !data?.user) {
    return {
      user: null,
      response: Response.json(
        { error: "Your session has expired. Sign in again." },
        { status: 401 }
      ),
    };
  }

  return { user: data.user, response: null };
}

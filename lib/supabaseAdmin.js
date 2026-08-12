import { createClient } from "@supabase/supabase-js";

// ============================================================
// Service-role client. Server-only — never import into a
// component. Created on first call so the build doesn't need
// credentials just to compile the routes.
// ============================================================

let _admin = null;

export function admin() {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Server Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

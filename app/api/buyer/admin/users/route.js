import { NextResponse } from "next/server";
import { admin } from "../../../../../lib/supabaseAdmin";
import { requireTeam, hashPassword } from "../../../../../lib/buyerAuth";

export const dynamic = "force-dynamic";

// Add a person to a firm. Password is optional — leaving it blank
// makes a magic-link-only account, which is the safer default.
export async function POST(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { org_id, email, name, password } = await req.json().catch(() => ({}));
  if (!org_id || !email) {
    return NextResponse.json({ error: "Firm and email are required." }, { status: 400 });
  }

  let password_hash = null;
  if (password) {
    try {
      password_hash = await hashPassword(password);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  const { data, error } = await admin()
    .from("buyer_users")
    .insert({ org_id, email: String(email).trim(), name: name || null, password_hash })
    .select("id, email, name, active, org_id")
    .single();

  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? "That email already has an account." : error.message },
      { status: dup ? 409 : 500 }
    );
  }

  return NextResponse.json({ user: data });
}

// Set a password, or deactivate. Deactivation takes effect on the
// buyer's next request rather than at session expiry.
export async function PATCH(req) {
  if (!(await requireTeam(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id, password, active } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "A user id is required." }, { status: 400 });

  const patch = {};
  if (typeof active === "boolean") patch.active = active;
  if (password) {
    try {
      patch.password_hash = await hashPassword(password);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data, error } = await admin()
    .from("buyer_users")
    .update(patch)
    .eq("id", id)
    .select("id, email, name, active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Revoking access should end current sessions, not just block new ones.
  if (patch.active === false) {
    await admin().from("buyer_sessions").delete().eq("user_id", id);
  }

  return NextResponse.json({ user: data });
}

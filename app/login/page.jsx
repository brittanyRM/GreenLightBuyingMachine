"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/queries";

const GREEN = "#00A651";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function signIn(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="bg-neutral-950 px-6 py-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
            Green Light Buying Machine
          </div>
          <h1 className="text-xl font-bold text-white">Deal System</h1>
        </div>

        <form onSubmit={signIn} className="space-y-3 bg-white p-6 shadow-lg">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>

          {error && <p className="text-[12px] text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full rounded py-2.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
            style={{ backgroundColor: GREEN }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-3 text-center text-[11px] text-neutral-500">
          Accounts are created in Supabase — Authentication → Users.
        </p>
      </div>
    </div>
  );
}

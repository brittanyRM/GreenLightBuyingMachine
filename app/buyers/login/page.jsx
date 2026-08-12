"use client";

// Buyer sign-in. Password or magic link — a firm can use either, and
// an account created without a password is magic-link only.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "../../../components/Brand";

const GREEN = "#00A651";

function BuyerLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("expired") ? "That link has expired. Request a new one." : null);
  const [sent, setSent] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "password") {
        const res = await fetch("/api/buyer/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Sign-in failed.");
        router.push("/buyers");
      } else {
        const res = await fetch("/api/buyer/magic-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const json = await res.json();
        setSent(json.message || "Check your email.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <BrandMark height={30} />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
            Green Light Buying Machine
          </span>
        </div>

        <h1 className="text-xl font-bold text-white">Property portal</h1>
        <p className="mt-1 text-[13px] text-neutral-400">
          Turnkey co-living properties for acquisition.
        </p>

        {sent ? (
          <div className="mt-6 rounded border-l-4 bg-neutral-900 px-4 py-3 text-[13px] text-neutral-300" style={{ borderColor: GREEN }}>
            {sent}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-[#00A651]"
              />
            </div>

            {mode === "password" && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-[#00A651]"
                />
              </div>
            )}

            {error && <div className="text-[12px] text-red-400">{error}</div>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {busy ? "…" : mode === "password" ? "Sign in" : "Email me a link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "password" ? "magic" : "password");
                setError(null);
              }}
              className="w-full text-[12px] text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
            >
              {mode === "password" ? "Email me a sign-in link instead" : "Use a password instead"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// useSearchParams forces client-side bailout, so the route needs a
// Suspense boundary or the build can't prerender it.
export default function BuyerLogin() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-950 font-sans text-sm text-neutral-500">
          Loading…
        </div>
      }
    >
      <BuyerLoginForm />
    </Suspense>
  );
}

"use client";

// ============================================================
// Navigation for the buyer portal.
//
// Separate from AppNav on purpose: buyers are not team users and
// share none of its links. Kept deliberately short — a portal with
// four properties in it doesn't need a menu system.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./Brand";

const GREEN = "#00A651";

const LINKS = [
  { href: "/buyers", label: "Properties", exact: true },
  { href: "/buyers/activity", label: "My activity" },
  { href: "/buyers/buy-box", label: "Buy box" },
  { href: "/buyers/research", label: "Market research" },
];

export default function BuyerNav({ buyer }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/buyer/logout", { method: "POST" });
    router.replace("/buyers/login");
  }

  const isActive = (l) =>
    l.exact ? pathname === l.href : pathname.startsWith(l.href);

  return (
    <div className="no-print bg-neutral-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
        <Link href="/buyers" className="flex items-center gap-2">
          <BrandMark height={24} />
          <span
            className="text-[9px] font-bold uppercase tracking-[0.28em]"
            style={{ color: GREEN }}
          >
            Property Portal
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                isActive(l) ? "text-white" : "text-neutral-500 hover:text-neutral-200"
              }`}
              style={isActive(l) ? { backgroundColor: "#1C231C" } : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {buyer?.org?.logoDarkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={buyer.org.logoDarkUrl}
              alt={buyer.org.name}
              className="h-5 w-auto opacity-90"
            />
          ) : (
            <span className="text-[12px] text-neutral-400">{buyer?.org?.name}</span>
          )}
          <button
            onClick={signOut}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared auth guard for buyer pages. Returns the buyer once resolved,
// or sends them to sign in. Every buyer page uses this rather than
// repeating the fetch.
export function useBuyer() {
  const router = useRouter();
  const [buyer, setBuyer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/buyer/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("auth"))))
      .then((j) => !cancelled && setBuyer(j.buyer))
      .catch(() => !cancelled && router.replace("/buyers/login"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  return buyer;
}

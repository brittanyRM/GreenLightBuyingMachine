"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/queries";

const GREEN = "#00A651";

// Hidden on the login screen and on public buyer links — a buyer
// shouldn't see internal navigation.
const HIDDEN = ["/login", "/p/", "/s/", "/buyers"];

const LINKS = [
  { href: "/", label: "Deals" },
  { href: "/crm", label: "CRM" },
  { href: "/admin/buyers", label: "Buyers" },
  { href: "/settings", label: "Settings" },
  { href: "/admin/health", label: "Health" },
];

export default function AppNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  if (HIDDEN.some((h) => pathname.startsWith(h))) return null;

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Deeper than a top-level page, so a way back is worth showing
  const nested = pathname.split("/").filter(Boolean).length > 1;

  return (
    <div className="no-print sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
        {nested && (
          <button
            onClick={() => router.back()}
            className="mr-1 rounded px-2 py-1.5 text-[13px] text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Back"
          >
            ←
          </button>
        )}

        <Link href="/" className="mr-3 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
            Green
          </span>
          <span
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: GREEN }}
          >
            {" "}
            Light
          </span>
        </Link>

        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              isActive(l.href)
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {l.label}
          </Link>
        ))}

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push("/login");
          }}
          className="ml-auto rounded px-3 py-1.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

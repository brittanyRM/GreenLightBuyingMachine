"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/queries";

// Buyer links are public by design — everything else needs a session.
const PUBLIC_PREFIXES = ["/login", "/p/"];

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(undefined); // undefined = still checking

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null && !isPublic) router.replace("/login");
  }, [session, isPublic, router]);

  if (isPublic) return children;

  if (session === undefined)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  if (session === null) return null; // redirecting

  return children;
}

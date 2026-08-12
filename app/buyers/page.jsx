"use client";

// Buyer property list. Everything here arrives from /api/buyer/deals,
// which whitelists fields server-side — the client never receives
// purchase_price or the rehab budget, so it can't leak them.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "../../components/Brand";
import { usd } from "../../lib/proformaClub";

const GREEN = "#00A651";

export default function BuyerIndex() {
  const router = useRouter();
  const [buyer, setBuyer] = useState(null);
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/buyer/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("auth"))))
      .then((j) => setBuyer(j.buyer))
      .catch(() => router.replace("/buyers/login"));
  }, [router]);

  useEffect(() => {
    if (!buyer) return;
    fetch("/api/buyer/deals")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setDeals(j.deals)))
      .catch((e) => setError(e.message));
  }, [buyer]);

  async function signOut() {
    await fetch("/api/buyer/logout", { method: "POST" });
    router.replace("/buyers/login");
  }

  if (!buyer) return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <div className="bg-neutral-950">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-5 py-4">
          <div className="flex items-center gap-2">
            <BrandMark height={26} />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              Property portal
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[12px] text-neutral-400">{buyer.org.name}</span>
            <button
              onClick={signOut}
              className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">Available properties</h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          Turnkey co-living, rehab complete and ready to operate. Open one for
          the full underwriting.
        </p>

        {error && (
          <div className="mt-5 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            {error}
          </div>
        )}

        {!deals && !error && <div className="mt-6 text-[13px] text-neutral-500">Loading…</div>}

        {deals && deals.length === 0 && (
          <div className="mt-6 rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
            Nothing available right now. We&rsquo;ll be in touch as properties
            come to market.
          </div>
        )}

        {deals && deals.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/buyers/${d.slug}`}
                className="overflow-hidden rounded border border-neutral-200 bg-white transition hover:border-neutral-400"
              >
                {d.hero_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.hero_image_url} alt="" className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full bg-neutral-200" />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-neutral-900">
                        {d.address_line}
                      </div>
                      <div className="text-[12px] text-neutral-500">
                        {d.city}, {d.state} {d.zip}
                      </div>
                    </div>
                    {d.interest && (
                      <span
                        className="shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                        style={{ backgroundColor: GREEN }}
                      >
                        {d.interest === "offer" ? "Offer in" : d.interest}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-[12px] text-neutral-600">
                      {d.bedrooms || "—"} bed / {d.bathrooms || "—"} bath
                      {d.post_reno_sqft ? ` · ${d.post_reno_sqft.toLocaleString()} sq ft` : ""}
                    </div>
                    <div className="text-[16px] font-bold tabular-nums text-neutral-900">
                      {d.list_price ? usd(d.list_price) : "—"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

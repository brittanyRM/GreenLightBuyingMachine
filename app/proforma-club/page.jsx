"use client";

// ============================================================
// Club-format pro forma — index.
//
// Lists saved deals so a house can be opened in the club sheet, and
// keeps the worked example available underneath for when there's
// nothing to look at yet or someone wants to see the format cold.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDeals, supabase } from "../../lib/queries";
import { usd } from "../../lib/proformaClub";
import { totalBaths } from "../../lib/proforma";
import { pepperPlaceInputs } from "../../lib/proformaClubPresets";
import ClubProForma from "../../components/ClubProForma";

const GREEN = "#00A651";

export default function ClubProFormaIndex() {
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState(null);
  const [showDemo, setShowDemo] = useState(null); // null | "seller" | "buyer"
  const [defaults, setDefaults] = useState(null);

  useEffect(() => {
    // Brand defaults, so the demo shows the standard hero and gallery
    // rather than a grey placeholder.
    supabase
      .from("org_settings")
      .select("key, value")
      .then(({ data }) =>
        setDefaults((data || []).reduce((a, r) => ({ ...a, [r.key]: r.value }), {}))
      );
  }, []);

  useEffect(() => {
    listDeals()
      .then(setDeals)
      .catch((e) => setError(e.message));
  }, []);

  if (showDemo) {
    const isBuyer = showDemo === "buyer";
    // Stand-in photography so the buyer layout can be judged before a
    // real deal has any uploaded.
    const demoDeal = {
      address_line: "1541 W Pepper Pl",
      city: "Mesa",
      state: "AZ",
      zip: "85201",
      county: "Maricopa",
      bedrooms: 9,
      bathrooms: 4,
      post_reno_sqft: 2450,
      lot_sqft: 9488,
      year_built: 1953,
      zoning: "RS-6",
      school_district: "Mesa Unified District #04",
      list_price: 540000,
      hero_image_url: null,
      gallery: [],
    };
    const demoComps = [
      { id: "c1", address: "1509 W Pepper Pl", comp_status: "closed", sold_price: 520000, sold_date: "2026-02-13", approx_sqft: 1863, price_per_sqft: 279.12 },
      { id: "c2", address: "1209 W Pepper Pl", comp_status: "closed", sold_price: 530000, sold_date: "2026-03-05", approx_sqft: 1956, price_per_sqft: 270.96 },
      { id: "c3", address: "2021 W 2nd Pl", comp_status: "closed", sold_price: 545000, sold_date: "2026-02-19", approx_sqft: 1884, price_per_sqft: 289.28 },
      { id: "c4", address: "1027 S Siesta Ln, Tempe", comp_status: "closed", sold_price: 605000, sold_date: "2026-03-18", approx_sqft: 1912, price_per_sqft: 316.42 },
    ];

    return (
      <div>
        <div className="no-print flex flex-wrap items-center gap-3 bg-neutral-950 px-5 py-2">
          <button
            onClick={() => setShowDemo(null)}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-white"
          >
            ← Back
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Viewing as
          </span>
          {[
            { id: "seller", label: "Our underwriting" },
            { id: "buyer", label: "Buyer sees" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setShowDemo(v.id)}
              className={`rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                showDemo === v.id ? "text-white" : "text-neutral-500 hover:text-neutral-200"
              }`}
              style={showDemo === v.id ? { backgroundColor: GREEN } : undefined}
            >
              {v.label}
            </button>
          ))}
        </div>

        <ClubProForma
          initialInputs={pepperPlaceInputs()}
          audience={showDemo}
          deal={isBuyer ? demoDeal : null}
          comps={isBuyer ? demoComps : []}
          market={{ zip: "85201", shared_weekly: 204, private_weekly: 290, avg_occupancy: 0.87 }}
          defaults={isBuyer ? defaults : null}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
          Club format
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Pro forma</h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          A syndication-style sheet for a house you&rsquo;re presenting to a
          buyer — scenarios, capitalization, IRR and a printed offering
          document. Pick a deal to underwrite.
        </p>

        {error && (
          <div className="mt-5 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            Couldn&rsquo;t load deals: {error}
          </div>
        )}

        {!deals && !error && (
          <div className="mt-6 text-[13px] text-neutral-500">Loading…</div>
        )}

        {deals && deals.length === 0 && (
          <div className="mt-6 rounded border border-neutral-200 bg-white px-4 py-5 text-[13px] text-neutral-600">
            No deals yet. Add one from the Deals page, or open the worked
            example below to see the format.
          </div>
        )}

        {deals && deals.length > 0 && (
          <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/proforma-club/${d.slug}`}
                className="flex items-center gap-4 border-b border-neutral-100 px-4 py-3 transition last:border-b-0 hover:bg-neutral-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-neutral-900">
                    {d.address_line}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {d.city}, {d.state} {d.zip}
                    {d.bedrooms ? ` · ${d.bedrooms} bed` : ""}
                    {totalBaths(d) ? ` / ${totalBaths(d)} bath` : ""}
                    {!d.list_price ? " · no list price set" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold tabular-nums text-neutral-900">
                    {d.list_price ? usd(d.list_price) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                    {String(d.status || "").replace("_", " ")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setShowDemo("seller")}
            className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600 ring-1 ring-neutral-300 transition hover:text-neutral-900"
          >
            Worked example — our underwriting
          </button>
          <button
            onClick={() => setShowDemo("buyer")}
            className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Worked example — what a buyer sees
          </button>
        </div>
      </div>
    </div>
  );
}

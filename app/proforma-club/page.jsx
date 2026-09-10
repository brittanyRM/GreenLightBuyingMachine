"use client";

// ============================================================
// Pro forma — index.
//
// Lists saved deals so a house can be opened in the sheet.
//
// There used to be a worked example here too, for demonstrating the
// format before any real deal existed. It was pointed at Dolphin, and
// that made it indistinguishable from Dolphin's own page — the same
// address showing different numbers, with nothing on screen saying
// which was which. With ten real deals to open, it earned nothing.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDeals, supabase } from "../../lib/queries";
import { usd } from "../../lib/proformaClub";
import { totalBaths } from "../../lib/proforma";

const GREEN = "#00A651";

export default function ClubProFormaIndex() {
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState(null);
  const [defaults, setDefaults] = useState(null);
  useEffect(() => {
    listDeals()
      .then(setDeals)
      .catch((e) => setError(e.message));
  }, []);

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
            No deals yet. Add one from the Deals page to underwrite it.
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

      </div>
    </div>
  );
}

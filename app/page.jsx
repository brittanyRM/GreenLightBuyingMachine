"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { listDeals } from "../lib/queries";
import { usd } from "../lib/proforma";

const GREEN = "#00A651";

const STATUS_ORDER = ["underwriting", "acquiring", "rehab", "launching", "for_sale", "sold"];

export default function DealsIndex() {
  const [deals, setDeals] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);

  useEffect(() => {
    listDeals().then(setDeals).catch((e) => setError(e.message));
  }, []);

  if (error)
    return <div className="p-8 font-sans text-sm text-red-700">Couldn't load deals: {error}</div>;

  const shown =
    filter === "all" ? deals : (deals || []).filter((d) => d.status === filter);

  return (
    <div className="min-h-screen font-sans">
      <div className="bg-neutral-950 px-5 py-5">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              Green Light Buying Machine
            </div>
            <h1 className="text-2xl font-bold text-white">Deals</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/deals/new"
              className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: GREEN }}
            >
              New deal
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 py-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {["all", ...STATUS_ORDER].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                filter === s ? "text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-300"
              }`}
              style={filter === s ? { backgroundColor: GREEN } : {}}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        {!deals ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-300 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-neutral-700">No deals here yet.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Start one from the assessor record and comps.
            </p>
            <Link
              href="/deals/new"
              className="mt-4 inline-block rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: GREEN }}
            >
              New deal
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 bg-white shadow-sm">
            {shown.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="flex-1">
                  <div className="text-sm font-bold text-neutral-900">{d.address_line}</div>
                  <div className="text-[11px] text-neutral-500">
                    {d.city}, {d.state} {d.zip} · {d.bedrooms || "?"}/{d.bathrooms || "?"}
                    {d.post_reno_sqft ? ` · ${d.post_reno_sqft.toLocaleString()} sq ft` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums text-neutral-900">
                    {d.list_price ? usd(d.list_price) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: GREEN }}>
                    {d.status.replace("_", " ")}
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

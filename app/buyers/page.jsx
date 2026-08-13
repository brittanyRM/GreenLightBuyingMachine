"use client";

// Buyer property list. Everything here arrives from /api/buyer/deals,
// which whitelists fields server-side — the client never receives
// purchase_price or the rehab budget, so it can't leak them.

import { useEffect, useState } from "react";
import Link from "next/link";
import BuyerNav, { useBuyer } from "../../components/BuyerNav";
import { usd } from "../../lib/proformaClub";
import { matchBuyBox } from "../../lib/buyBox";
import { totalBathrooms } from "../../lib/proformaClubPresets";

const GREEN = "#00A651";

export default function BuyerIndex() {
  const buyer = useBuyer();
  const [deals, setDeals] = useState(null);
  const [buyBox, setBuyBox] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!buyer) return;
    fetch("/api/buyer/deals")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setError(j.error);
        setDeals(j.deals);
        setBuyBox(j.buyBox || null);
        setDefaults(j.defaults || null);
      })
      .catch((e) => setError(e.message));
  }, [buyer]);

  if (!buyer) return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">
          Available properties
        </h1>
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

        {deals && deals.length > 0 && (() => {
          const ranked = deals
            .map((d) => ({ d, fit: matchBuyBox(d, buyBox, d.metrics) }))
            .sort((a, b) => {
              // Anything allocated to this buyer leads, then buy-box fit.
              const asg = (x) => (x.d.assignment ? 0 : 1);
              if (asg(a) !== asg(b)) return asg(a) - asg(b);
              const score = (x) => (x.fit.matches ? (x.fit.nearMisses.length ? 1 : 0) : 2);
              return score(a) - score(b);
            });

          const matchCount = ranked.filter((r) => r.fit.matches).length;
          const shown = onlyMatches ? ranked.filter((r) => r.fit.matches) : ranked;

          return (
          <>
          {buyBox && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded border border-neutral-200 bg-white px-4 py-2.5">
              <span className="text-[12px] text-neutral-700">
                <strong>{matchCount}</strong> of {ranked.length} match your buy
                box.
                {buyBox.scenario && buyBox.scenario !== "base" && (
                  <span className="text-neutral-500">
                    {" "}
                    Yield floors tested against the {buyBox.scenario} case.
                  </span>
                )}
              </span>
              <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                <input
                  type="checkbox"
                  checked={onlyMatches}
                  onChange={(e) => setOnlyMatches(e.target.checked)}
                />
                Matches only
              </label>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {shown.map(({ d, fit }) => (
              <Link
                key={d.id}
                href={`/buyers/${d.slug}`}
                className="overflow-hidden rounded border border-neutral-200 bg-white transition hover:border-neutral-400"
              >
                {(() => {
                  // The deal's own photo, then the standard one. Same
                  // chain the flyer and the sheet use.
                  const std = defaults?.default_hero?.url || null;
                  const src = d.hero_image_url || std;
                  return src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt=""
                      // A dead URL is truthy, so it would render a broken
                      // icon rather than falling through. Step down on error.
                      onError={(e) => {
                        if (std && e.currentTarget.src !== std) e.currentTarget.src = std;
                        else e.currentTarget.style.display = "none";
                      }}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-neutral-200 text-[11px] text-neutral-500">
                      Photography to follow
                    </div>
                  );
                })()}
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
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {d.interest && (
                        <span
                          className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: GREEN }}
                        >
                          {d.interest === "offer" ? "Offer in" : d.interest}
                        </span>
                      )}
                      {d.assignment && (
                        <span
                          className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                          style={{ backgroundColor: "#0A0A0A" }}
                          title={d.assignment.note || undefined}
                        >
                          {d.assignment.status === "exclusive"
                            ? "Exclusive to you"
                            : d.assignment.status === "reserved"
                            ? "Reserved for you"
                            : "Offered to you"}
                        </span>
                      )}
                      {buyBox && fit.matches && fit.checked > 0 && (
                        <span
                          className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: "#E7F6ED", color: "#046A38" }}
                        >
                          Fits your buy box
                        </span>
                      )}
                      {buyBox && !fit.matches && (
                        <span
                          className="rounded bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-500"
                          title={fit.failures.join(" · ")}
                        >
                          {fit.failures.length === 1 ? fit.failures[0] : "Outside buy box"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-[12px] text-neutral-600">
                      {d.bedrooms || "—"} bed /{" "}
                      {totalBathrooms(d) || "—"} bath
                      {totalBathrooms(d) === 1 ? "" : "s"}
                      {d.ensuite_count > 0 ? ` · ${d.ensuite_count} ensuite` : ""}
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
          </>
          );
        })()}
      </div>
    </div>
  );
}

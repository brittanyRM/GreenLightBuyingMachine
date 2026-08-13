"use client";

// ============================================================
// /buyers/activity — what this buyer has raised a hand on.
//
// A static segment, so it takes precedence over /buyers/[slug]. A
// deal slugged "activity" would be unreachable; worth knowing, not
// worth guarding against.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import BuyerNav, { useBuyer } from "../../../components/BuyerNav";
import { usd } from "../../../lib/proformaClub";

const GREEN = "#00A651";

const KIND_LABEL = {
  interested: "Raised a hand",
  offer: "Offer submitted",
  passed: "Passed",
};

const STATUS_NOTE = {
  new: "With Green Light",
  reviewing: "Under review",
  accepted: "Accepted",
  declined: "Declined",
};

export default function BuyerActivity() {
  const buyer = useBuyer();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!buyer) return;
    fetch("/api/buyer/interest")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setRows(j.interest)))
      .catch((e) => setError(e.message));
  }, [buyer]);

  if (!buyer)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">My activity</h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          Properties {buyer.org.name} has been in touch about.
        </p>

        {error && (
          <div className="mt-5 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            {error}
          </div>
        )}

        {!rows && !error && <div className="mt-6 text-[13px] text-neutral-500">Loading…</div>}

        {rows && rows.length === 0 && (
          <div className="mt-6 rounded border border-neutral-200 bg-white px-4 py-6 text-[13px] text-neutral-600">
            Nothing yet.{" "}
            <Link href="/buyers" className="underline underline-offset-2">
              Browse available properties
            </Link>
            .
          </div>
        )}

        {(rows || []).map((r) => (
          <div key={r.id} className="mb-3 overflow-hidden rounded border border-neutral-200 bg-white">
            <div className="flex gap-4 p-4">
              {r.deals?.hero_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.deals.hero_image_url}
                  alt=""
                  className="h-20 w-28 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-20 w-28 shrink-0 rounded bg-neutral-200" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/buyers/${r.deals?.slug}`}
                    className="text-[14px] font-bold text-neutral-900 underline-offset-2 hover:underline"
                  >
                    {r.deals?.address_line}
                  </Link>
                  <span
                    className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: r.kind === "passed" ? "#9AA3AB" : GREEN }}
                  >
                    {KIND_LABEL[r.kind] || r.kind}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-600">
                    {STATUS_NOTE[r.status] || r.status}
                  </span>
                </div>

                <div className="mt-0.5 text-[12px] text-neutral-500">
                  {r.deals?.city}, {r.deals?.state} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </div>

                <div className="mt-1 text-[13px] text-neutral-800">
                  {r.offer_price ? (
                    <>
                      Offered{" "}
                      <strong className="tabular-nums">{usd(r.offer_price)}</strong>
                      {r.deals?.list_price ? (
                        <span className="text-neutral-500">
                          {" "}
                          against {usd(r.deals.list_price)} list
                        </span>
                      ) : null}
                    </>
                  ) : r.deals?.list_price ? (
                    <span className="tabular-nums">{usd(r.deals.list_price)}</span>
                  ) : null}
                </div>

                {r.note && (
                  <p className="mt-1.5 border-l-2 border-neutral-300 pl-3 text-[12px] text-neutral-600">
                    {r.note}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

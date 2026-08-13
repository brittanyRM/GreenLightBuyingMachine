"use client";

// ============================================================
// Club-format pro forma for a saved deal.
//
// Reuses getDealBundle, so rooms, rates, price and the cached market
// row come from the same place the deal page reads them. Nothing is
// written back — read-only against the existing tables.
//
// The buyer preview renders exactly what a buyer would receive:
// list_price rather than our basis, flyer styling, and none of the
// internal controls. It's the same component the buyer route uses,
// so what's previewed here is what actually gets sent.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { getDealBundle } from "../../../lib/queries";
import { inputsFromDeal } from "../../../lib/proformaClubPresets";
import ClubProForma from "../../../components/ClubProForma";

const GREEN = "#00A651";

export default function ClubProFormaDeal({ params }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDealBundle(params.slug)
      .then((b) => !cancelled && setBundle(b))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  // Rebuilt on toggle: buyer inputs price off list_price, seller off
  // purchase_price, so the preview isn't just a restyled seller sheet.
  const inputs = useMemo(() => {
    if (!bundle) return null;
    const { deal, rooms, market } = bundle;
    return inputsFromDeal(
      { deal, rooms, market },
      { audience: preview ? "buyer" : "seller" }
    );
  }, [bundle, preview]);

  if (error)
    return (
      <div className="p-8 font-sans text-sm text-red-700">
        Couldn&rsquo;t load this deal: {error}
      </div>
    );

  if (!inputs) return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  const { deal, comps, market } = bundle;
  const noList = preview && !deal.list_price;

  return (
    <div>
      <div className="no-print sticky top-[41px] z-20 flex flex-wrap items-center gap-3 bg-neutral-950 px-5 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
          Viewing as
        </span>
        {[
          { id: false, label: "Our underwriting" },
          { id: true, label: "Buyer sees" },
        ].map((v) => (
          <button
            key={String(v.id)}
            onClick={() => setPreview(v.id)}
            className={`rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
              preview === v.id ? "text-white" : "text-neutral-500 hover:text-neutral-200"
            }`}
            style={preview === v.id ? { backgroundColor: GREEN } : undefined}
          >
            {v.label}
          </button>
        ))}

        {preview && (
          <span className="text-[11px] text-neutral-400">
            Exactly what a buyer receives — priced off list, no basis, no
            internal panels.
          </span>
        )}
      </div>

      {noList && (
        <div className="no-print border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-[12px] text-amber-900">
          This deal has no <strong>list price</strong> set, so the buyer preview
          is falling back to the purchase price. Set a list price on the deal
          before sending it to anyone.
        </div>
      )}

      <ClubProForma
        initialInputs={inputs}
        backHref="/proforma-club"
        backLabel="All deals"
        audience={preview ? "buyer" : "seller"}
        deal={preview ? deal : null}
        comps={preview ? comps || [] : []}
        market={market}
      />
    </div>
  );
}

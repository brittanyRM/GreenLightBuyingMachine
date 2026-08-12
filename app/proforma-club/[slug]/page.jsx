"use client";

// ============================================================
// Club-format pro forma for a saved deal.
//
// Reuses getDealBundle, so the rooms, rates, price and the cached
// market row all come from the same place the deal page reads them.
// Nothing is written back — this route is read-only against the
// existing tables.
// ============================================================

import { useEffect, useState } from "react";
import { getDealBundle } from "../../../lib/queries";
import { inputsFromDeal } from "../../../lib/proformaClubPresets";
import ClubProForma from "../../../components/ClubProForma";

export default function ClubProFormaDeal({ params }) {
  const [inputs, setInputs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getDealBundle(params.slug)
      .then((bundle) => {
        if (cancelled) return;
        const { deal, rooms, market } = bundle;
        setInputs(
          inputsFromDeal({ deal, rooms, market }, { audience: "seller" })
        );
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  if (error)
    return (
      <div className="p-8 font-sans text-sm text-red-700">
        Couldn&rsquo;t load this deal: {error}
      </div>
    );

  if (!inputs)
    return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <ClubProForma
      initialInputs={inputs}
      backHref="/proforma-club"
      backLabel="All deals"
    />
  );
}

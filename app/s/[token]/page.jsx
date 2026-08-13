"use client";

// ============================================================
// /s/[token] — public pro forma link.
//
// No sign-in. The token is the credential, and everything arrives
// through /api/club-share/[token], which whitelists fields with the
// service role. Nothing here can leak the basis because the browser
// is never sent it.
// ============================================================

import { useEffect, useState } from "react";
import ClubProForma from "../../../components/ClubProForma";
import { inputsFromDeal, applySavedInputs } from "../../../lib/proformaClubPresets";

export default function SharedClubProForma({ params }) {
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/club-share/${params.token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setNotFound(true));
  }, [params.token]);

  if (notFound)
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-6 font-sans">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-neutral-900">This link isn&rsquo;t available</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            It may have expired or been withdrawn. Get in touch with Green Light
            Buying Machine for a current one.
          </p>
        </div>
      </div>
    );

  if (!data)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  // Assumptions frozen at share time win over a rebuild, so the
  // recipient sees the adjusted figures rather than defaults.
  const inputs =
    data.inputs ||
    inputsFromDeal({
      deal: data.deal,
      rooms: data.rooms,
      market: data.market,
      org: data.org,
    });

  if (data.holdYears) inputs.exit.holdYears = data.holdYears;

  return (
    <ClubProForma
      initialInputs={inputs}
      audience="buyer"
      deal={data.deal}
      comps={data.comps || []}
        documents={data.documents || []}
        documents={data.documents || []}
      market={data.market}
      rooms={data.rooms}
      orgRows={data.org}
      marketReport={data.marketReport}
      documents={data.documents || []}
      defaults={data.defaults}
      allowAdjust={data.allowAdjust}
      initialScenario={data.scenario}
    />
  );
}

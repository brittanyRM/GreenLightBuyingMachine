"use client";

// A single property for a buyer: the club sheet plus the raise-hand
// panel. The sheet is built from list_price — the buyer's basis, not
// ours — and the investor-subscription panel is suppressed, since a
// firm buying the whole house does its own per-investor math.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BuyerNav, { useBuyer } from "../../../components/BuyerNav";
import ClubProForma from "../../../components/ClubProForma";
import { inputsFromDeal } from "../../../lib/proformaClubPresets";
import { usd } from "../../../lib/proformaClub";

const GREEN = "#00A651";

export default function BuyerDeal({ params }) {
  const router = useRouter();
  const buyer = useBuyer();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("interested");
  const [offer, setOffer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [financing, setFinancing] = useState(null);

  // Lender introductions, revealed once they've engaged. Refetched
  // after raising a hand so the section appears without a reload.
  const loadFinancing = () =>
    fetch(`/api/buyer/financing?slug=${params.slug}`)
      .then((r) => r.json())
      .then(setFinancing)
      .catch(() => {});

  useEffect(() => {
    fetch(`/api/buyer/deals/${params.slug}`)
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/buyers/login");
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this property.");
        return j;
      })
      .then((j) => {
        if (!j) return;
        setData(j);
        loadFinancing();
      })
      .catch((e) => setError(e.message));
    // loadFinancing is stable for a given slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, router]);

  async function raiseHand() {
    setBusy(true);
    try {
      const res = await fetch("/api/buyer/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: params.slug,
          kind,
          offer_price: kind === "offer" && offer ? Number(offer) : null,
          note: note || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong.");
      setDone(true);
      loadFinancing();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data)
    return <div className="p-10 font-sans text-sm text-red-700">{error}</div>;
  if (!data) return <div className="p-10 font-sans text-sm text-neutral-500">Loading…</div>;

  const inputs = inputsFromDeal({
    deal: data.deal,
    rooms: data.rooms,
    market: data.market,
    org: data.org,
  });

  const already = data.interest?.[0];

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <ClubProForma
        initialInputs={inputs}
        backHref="/buyers"
        backLabel="All properties"
        audience="buyer"
        deal={data.deal}
        comps={data.comps || []}
        market={data.market}
        defaults={data.defaults}
        allowAdjust
      />

      <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-8">
        <div className="rounded border-2 bg-white p-5" style={{ borderColor: GREEN }}>
          {done || already ? (
            <div>
              <h2 className="text-[15px] font-bold text-neutral-900">
                {done ? "Thanks — we've got it." : "You've already been in touch on this one."}
              </h2>
              <p className="mt-1 text-[13px] text-neutral-600">
                {already && !done
                  ? `Logged ${new Date(already.created_at).toLocaleDateString()}${
                      already.offer_price ? ` — offer ${usd(already.offer_price)}` : ""
                    }. We'll follow up directly.`
                  : "Someone from Green Light Buying Machine will follow up shortly."}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-[15px] font-bold text-neutral-900">
                Interested in this property?
              </h2>
              <p className="mt-1 text-[13px] text-neutral-600">
                Let us know and we&rsquo;ll take it off general circulation while
                we talk.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { id: "interested", label: "Raise my hand" },
                  { id: "offer", label: "Submit an offer" },
                  { id: "passed", label: "Pass on this one" },
                ].map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                      kind === k.id
                        ? "text-white"
                        : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"
                    }`}
                    style={kind === k.id ? { backgroundColor: GREEN } : undefined}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              {kind === "offer" && (
                <div className="mt-3">
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Offer price
                  </label>
                  <div className="mt-1 flex max-w-[12rem] items-center rounded border border-neutral-300 focus-within:border-[#00A651]">
                    <span className="pl-2 text-sm text-neutral-500">$</span>
                    <input
                      type="number"
                      step={1000}
                      value={offer}
                      onChange={(e) => setOffer(e.target.value)}
                      placeholder={data.deal.list_price ? String(data.deal.list_price) : ""}
                      className="w-full bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Anything we should know
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-[13px] outline-none focus:border-[#00A651]"
                  placeholder="Timing, financing, diligence questions…"
                />
              </div>

              {error && <div className="mt-2 text-[12px] text-red-700">{error}</div>}

              <button
                onClick={raiseHand}
                disabled={busy}
                className="mt-4 rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {busy ? "Sending…" : "Send to Green Light"}
              </button>
            </>
          )}
        </div>

        {financing?.options?.length > 0 && (
          <div className="mt-4 rounded border-2 bg-white p-5" style={{ borderColor: GREEN }}>
            <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: GREEN }}>
              Included with the deal
            </div>
            <h2 className="mt-0.5 text-[17px] font-bold text-neutral-900">
              Financing already lined up
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-neutral-600">
              A lender who has funded co-living in this market and underwrites
              room-by-room income. You deal with them directly — Green Light
              Buying Machine takes no part in the loan and is paid nothing for
              the introduction.
            </p>

            <div className="mt-4 space-y-3">
              {financing.options.map((o) => (
                <div key={o.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {o.contact_photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.contact_photo_url}
                        alt={o.contact_name || ""}
                        className="h-16 w-16 shrink-0 rounded-full object-cover"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-neutral-900">
                        {o.contact_name || o.label}
                      </div>
                      {o.lender_name && (
                        <div className="text-[12px] text-neutral-600">{o.lender_name}</div>
                      )}
                      {o.nmls && (
                        <div className="text-[11px] text-neutral-400">NMLS {o.nmls}</div>
                      )}

                      <div className="mt-1 flex flex-wrap gap-x-3 text-[12px]">
                        {o.contact_email && (
                          <a href={`mailto:${o.contact_email}`} className="underline underline-offset-2">
                            {o.contact_email}
                          </a>
                        )}
                        {o.contact_phone && (
                          <a href={`tel:${o.contact_phone.replace(/[^0-9+]/g, "")}`} className="text-neutral-600">
                            {o.contact_phone}
                          </a>
                        )}
                      </div>
                    </div>

                    {o.lender_logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.lender_logo_url} alt="" className="h-10 w-auto shrink-0" />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-3">
                    {[
                      o.max_ltv_pct != null && [`${o.max_ltv_pct}%`, "max LTV"],
                      o.rate_from_pct != null && [`${o.rate_from_pct}%`, "rate from"],
                      o.term_months != null && [`${Math.round(o.term_months / 12)} yr`, "term"],
                      o.points != null && [`${o.points}`, "points"],
                      o.min_dscr != null && [`${o.min_dscr}`, "min DSCR"],
                    ]
                      .filter(Boolean)
                      .map(([v, l]) => (
                        <div key={l}>
                          <div className="text-[17px] font-bold tabular-nums leading-tight text-neutral-900">
                            {v}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-neutral-400">{l}</div>
                        </div>
                      ))}
                  </div>

                  {o.summary && (
                    <p className="mt-2 text-[12px] leading-snug text-neutral-600">{o.summary}</p>
                  )}

                  {o.states?.length > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Licensed in {o.states.join(", ")}.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {financing.moreAfterInterest && (
              <p className="mt-3 text-[12px] text-neutral-600">
                Further lender options are available once you&rsquo;ve raised
                your hand on this property.
              </p>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">
              Terms are indicative and subject to each lender&rsquo;s own
              underwriting. Nothing here is a commitment to lend or an offer of
              credit. Equal Housing Lender.
            </p>
          </div>
        )}

        {financing?.locked && (
          <div className="mt-4 rounded border border-dashed border-neutral-300 bg-white px-5 py-4 text-[13px] text-neutral-600">
            <strong className="text-neutral-900">Financing options</strong> —
            raise your hand above and we&rsquo;ll introduce you to lenders who
            fund this asset class.
          </div>
        )}
      </div>
    </div>
  );
}

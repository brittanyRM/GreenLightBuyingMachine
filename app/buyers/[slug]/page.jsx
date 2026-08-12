"use client";

// A single property for a buyer: the club sheet plus the raise-hand
// panel. The sheet is built from list_price — the buyer's basis, not
// ours — and the investor-subscription panel is suppressed, since a
// firm buying the whole house does its own per-investor math.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClubProForma from "../../../components/ClubProForma";
import { inputsFromDeal } from "../../../lib/proformaClubPresets";
import { usd } from "../../../lib/proformaClub";

const GREEN = "#00A651";

export default function BuyerDeal({ params }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("interested");
  const [offer, setOffer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
      .then((j) => j && setData(j))
      .catch((e) => setError(e.message));
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
  });

  const already = data.interest?.[0];

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <ClubProForma
        initialInputs={inputs}
        backHref="/buyers"
        backLabel="All properties"
        audience="buyer"
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
      </div>
    </div>
  );
}

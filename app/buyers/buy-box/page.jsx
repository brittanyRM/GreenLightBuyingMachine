"use client";

// ============================================================
// /buyers/buy-box — the buyer's own acquisition criteria.
//
// Self-service on purpose. A buyer who tells us what they want gets a
// portal that leads with it, and we learn what to go and find.
// org_id comes from the session, never the form.
// ============================================================

import { useEffect, useState } from "react";
import BuyerNav, { useBuyer } from "../../../components/BuyerNav";
import { describeBuyBox, parseList } from "../../../lib/buyBox";

const GREEN = "#00A651";

function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </span>
      <input
        {...props}
        className="mt-1 w-full rounded border border-neutral-300 px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
      />
      {hint && <span className="mt-0.5 block text-[10px] text-neutral-400">{hint}</span>}
    </label>
  );
}

export default function BuyerBuyBox() {
  const buyer = useBuyer();
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!buyer) return;
    fetch("/api/buyer/buybox")
      .then((r) => r.json())
      .then((j) => {
        if (j.unavailable) setUnavailable(true);
        const b = j.buyBox || {};
        setSaved(j.buyBox || null);
        setDraft({
          min_price: b.min_price ?? "",
          max_price: b.max_price ?? "",
          min_bedrooms: b.min_bedrooms ?? "",
          min_bathrooms: b.min_bathrooms ?? "",
          min_sqft: b.min_sqft ?? "",
          min_year_built: b.min_year_built ?? "",
          min_dscr: b.min_dscr ?? "",
          min_cap_rate: b.min_cap_rate ?? "",
          scenario: b.scenario || "base",
          cities: (b.cities || []).join(", "),
          zips: (b.zips || []).join(", "),
          states: (b.states || []).join(", "),
          notes: b.notes || "",
        });
      })
      .catch((e) => setError(e.message));
  }, [buyer]);

  const set = (k) => (e) => {
    setDone(false);
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/buyer/buybox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          cities: parseList(draft.cities),
          zips: parseList(draft.zips),
          states: parseList(draft.states),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't save that.");
      setSaved(j.buyBox);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!buyer || !draft)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">Buy box</h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          Tell us what {buyer.org.name} is looking for. Properties that fit are
          flagged and listed first, and we&rsquo;ll know what to bring you.
          Leave anything blank that isn&rsquo;t a constraint.
        </p>

        {unavailable && (
          <div className="mt-5 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            Buy boxes aren&rsquo;t available yet. Please check back shortly.
          </div>
        )}

        {saved && (
          <div className="mt-5 rounded border border-neutral-200 bg-white px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
              Currently
            </div>
            <div className="text-[13px] text-neutral-800">{describeBuyBox(saved)}</div>
          </div>
        )}

        <div className="mt-5 rounded border border-neutral-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Min price" inputMode="decimal" value={draft.min_price} onChange={set("min_price")} placeholder="Any" />
            <Field label="Max price" inputMode="decimal" value={draft.max_price} onChange={set("max_price")} placeholder="Any" />
            <Field label="Min bedrooms" inputMode="decimal" value={draft.min_bedrooms} onChange={set("min_bedrooms")} placeholder="Any" />
            <Field label="Min bathrooms" inputMode="decimal" value={draft.min_bathrooms} onChange={set("min_bathrooms")} placeholder="Any" />
            <Field label="Min sq ft" inputMode="decimal" value={draft.min_sqft} onChange={set("min_sqft")} placeholder="Any" />
            <Field label="Built after" inputMode="decimal" value={draft.min_year_built} onChange={set("min_year_built")} placeholder="Any" />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Cities" value={draft.cities} onChange={set("cities")} placeholder="Mesa, Gilbert, Chandler" hint="Comma separated" />
            <Field label="ZIP codes" value={draft.zips} onChange={set("zips")} placeholder="85201, 85210" hint="Comma separated" />
            <Field label="States" value={draft.states} onChange={set("states")} placeholder="AZ" hint="Comma separated" />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Min debt coverage (DSCR)"
              inputMode="decimal"
              value={draft.min_dscr}
              onChange={set("min_dscr")}
              placeholder="1.25"
              hint="Checked against our underwriting"
            />
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Yield floors apply to
              </span>
              <select
                value={draft.scenario || "base"}
                onChange={set("scenario")}
                className="mt-1 w-full rounded border border-neutral-300 px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
              >
                <option value="bear">Bear case — must hold in the downside</option>
                <option value="base">Base case</option>
                <option value="bull">Bull case</option>
              </select>
              <span className="mt-0.5 block text-[10px] text-neutral-400">
                Applies to DSCR only. Beds, price and location don&rsquo;t vary
                by case.
              </span>
            </label>
          </div>

          <div className="mt-3">
            <Field
              label="Anything else"
              value={draft.notes}
              onChange={set("notes")}
              placeholder="No septic, 2-car garage preferred…"
              hint="We read these"
            />
          </div>

          {error && <div className="mt-3 text-[12px] text-red-700">{error}</div>}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy || unavailable}
              className="rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {busy ? "Saving…" : "Save buy box"}
            </button>
            {done && (
              <span className="text-[12px]" style={{ color: GREEN }}>
                Saved.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

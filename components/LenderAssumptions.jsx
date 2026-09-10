"use client";

// ============================================================
// Lender pricing, in one place.
//
// These tiers were hardcoded in lib/proforma.js and duplicated again
// in public/buyer-calculator.html. They were updated separately, so
// they drifted: the calculator sat at 6.5% and $223 a room for weeks
// after the pro forma had moved on. Both now read from here.
//
// Blank means "use the built-in quote". That matters — a cleared field
// should fall back to something defensible rather than zero, and an
// empty rate silently becoming 0% would make every deal look free.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/queries";
import { RATE_BY_DOWN, PPP_COST_BY_DOWN, LENDER_QUOTE_2026_09 } from "../lib/proforma";

const GREEN = "#00A651";

const FIELDS = [
  {
    key: "rate_15_down",
    label: "15% down",
    hint: "85 LTV",
    suffix: "%",
    asPct: true,
    fallback: RATE_BY_DOWN[0.15],
  },
  {
    key: "rate_20_down",
    label: "20% down",
    hint: "80 LTV",
    suffix: "%",
    asPct: true,
    fallback: RATE_BY_DOWN[0.2],
  },
  {
    key: "rate_25_down",
    label: "25% down",
    hint: "75 LTV",
    suffix: "%",
    asPct: true,
    fallback: RATE_BY_DOWN[0.25],
  },
  {
    key: "ppp_cost",
    label: "Prepayment penalty",
    hint: "Cost to buy it down, at close",
    suffix: "$",
    asPct: false,
    fallback: PPP_COST_BY_DOWN[0.25],
  },
];

export default function LenderAssumptions() {
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("org_assumptions")
      .select("key, value")
      .then(({ data, error: e }) => {
        if (e) return setError(e.message);
        const out = {};
        for (const r of data || []) {
          const f = FIELDS.find((x) => x.key === r.key);
          if (!f) continue;
          out[r.key] = f.asPct ? String(+(Number(r.value) * 100).toFixed(3)) : String(r.value);
        }
        setValues(out);
      });
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const f of FIELDS) {
        const raw = (values[f.key] ?? "").trim();
        if (raw === "") {
          // Cleared means "use the built-in quote", so the row is
          // removed rather than written as zero.
          await supabase.from("org_assumptions").delete().eq("key", f.key);
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label} isn't a number.`);
        const stored = f.asPct ? n / 100 : n;
        await supabase
          .from("org_assumptions")
          .upsert({ key: f.key, value: stored }, { onConflict: "key" });
      }
      setSaved(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 border-b-2 border-neutral-900 pb-1 text-[12px] font-bold uppercase tracking-[0.12em]">
        Lender pricing
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-neutral-600">
        Used by the pro forma, the flyer, the buyer sheet and the calculator.
        Change a rate here and every one of them follows. Leave a field empty to
        use the quote the system ships with.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              {f.label}
            </span>
            <span className="mt-1 flex items-center rounded border border-neutral-300 bg-white px-2 py-1.5">
              {f.suffix === "$" && <span className="mr-1 text-[12px] text-neutral-400">$</span>}
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={
                  f.asPct ? (f.fallback * 100).toFixed(3) : String(f.fallback)
                }
                inputMode="decimal"
                className="w-full text-[13px] tabular-nums outline-none"
              />
              {f.suffix === "%" && <span className="ml-1 text-[12px] text-neutral-400">%</span>}
            </span>
            <span className="mt-0.5 block text-[10.5px] text-neutral-500">{f.hint}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
          style={{ backgroundColor: GREEN }}
        >
          {busy ? "Saving…" : "Save pricing"}
        </button>
        {saved && <span className="text-[12px] text-green-700">Saved {saved}</span>}
        {error && <span className="text-[12px] text-red-700">{error}</span>}
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-500">
        Shipped quote: {LENDER_QUOTE_2026_09.lender}, {LENDER_QUOTE_2026_09.term},
        FICO {LENDER_QUOTE_2026_09.fico}, as of {LENDER_QUOTE_2026_09.asOf}. The
        placeholders above are those figures — anything you type replaces them
        everywhere.
      </p>
    </div>
  );
}

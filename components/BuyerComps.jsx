"use client";

// ============================================================
// A buyer's own comps, checked against the asking price.
//
// Same parser we use on our own flexmls exports, so the comparison is
// like for like. Nothing is saved to the deal — these are the buyer's
// working numbers, held in the browser, and the sheet says so.
//
// The point isn't to argue. An institutional buyer is going to pull
// their own comps anyway; doing it inside the sheet means they see our
// figure and theirs side by side rather than in two tabs.
// ============================================================

import { useMemo, useState } from "react";
import { parseComps, compareToSubject } from "../lib/comps";
import { usd, pct } from "../lib/proforma";

const GREEN = "#00A651";
const RED = "#B91C1C";

export default function BuyerComps({ subject }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const comps = useMemo(() => parseComps(text), [text]);
  const result = useMemo(() => compareToSubject(comps, subject), [comps, subject]);

  return (
    <div className="no-print px-8 pb-4">
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-neutral-900">
              Check it against your own comps
            </div>
            <div className="text-[11px] leading-snug text-neutral-600">
              Paste a flexmls export and we&rsquo;ll run it the same way we run
              ours. Nothing is sent to us — this stays in your browser.
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            {open ? "Close" : "Paste comps"}
          </button>
        </div>

        {open && (
          <div className="mt-3">
            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "6204 W GARDEN DR, Glendale AZ   625000  1800  325  585000\n3570 W Pershing AVE, Phoenix AZ  550000  2263  243.48  551000"
              }
              className="w-full rounded border border-neutral-300 px-2.5 py-2 font-mono text-[11px] outline-none focus:border-[#00A651]"
            />
            <div className="mt-1 text-[10px] text-neutral-400">
              One per line: address, then list price, square feet, $/sq ft, sold
              price. Status is read from the row — pending, active, UCB,
              otherwise closed.
            </div>

            {comps.length > 0 && (
              <div className="mt-3 text-[11px] text-neutral-600">
                {comps.length} row{comps.length === 1 ? "" : "s"} read,{" "}
                {comps.filter((c) => c.comp_status === "closed").length} closed.
              </div>
            )}

            {result && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Your median", usd(result.median), `${result.count} closed`],
                    ["Range", `${usd(result.low)}–${usd(result.high)}`, null],
                    [
                      "Your median $/sq ft",
                      result.medianPsf ? usd(result.medianPsf) : "—",
                      result.subjectPsf ? `this house ${usd(result.subjectPsf)}` : null,
                    ],
                    [
                      "Asking vs your median",
                      result.priceDelta != null
                        ? `${result.priceDelta >= 0 ? "+" : ""}${pct(result.priceDelta, 1)}`
                        : "—",
                      result.aboveHigh
                        ? "above your highest comp"
                        : result.belowLow
                        ? "below your lowest comp"
                        : "inside your range",
                    ],
                  ].map(([label, value, foot]) => (
                    <div key={label} className="rounded border border-neutral-200 px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-500">
                        {label}
                      </div>
                      <div className="text-[15px] font-bold tabular-nums leading-tight text-neutral-900">
                        {value}
                      </div>
                      {foot && <div className="mt-0.5 text-[9px] text-neutral-500">{foot}</div>}
                    </div>
                  ))}
                </div>

                <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
                  {result.psfDelta != null && result.psfDelta > 0.05 ? (
                    <>
                      This house asks {pct(result.psfDelta, 1)} more per square
                      foot than your median. Conventional comps sold as
                      single-family homes; the price here reflects{" "}
                      {subject.beds} rentable bedrooms, the furniture package and
                      a completed launch — none of which those sales carried.
                    </>
                  ) : result.psfDelta != null && result.psfDelta < -0.05 ? (
                    <>
                      This house asks {pct(Math.abs(result.psfDelta), 1)} less
                      per square foot than your median.
                    </>
                  ) : (
                    <>Per square foot, this sits within a few points of your median.</>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

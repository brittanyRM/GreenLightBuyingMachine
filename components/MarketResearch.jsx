"use client";

// ============================================================
// Run the market research for a city and look at it before it saves.
//
// Two steps deliberately. The figures come from a web search, which
// means they are as good as what it found and occasionally confidently
// wrong — a metro rent quoted as a city rent, a census figure five
// years old. Everything lands on screen with its source and a
// confidence mark first; saving is a separate decision.
// ============================================================

import { useState } from "react";
import { supabase } from "../lib/queries";

const GREEN = "#00A651";

const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
const pct = (n, d = 1) =>
  Number.isFinite(Number(n)) ? `${(Number(n) * 100).toFixed(d)}%` : "—";

const CONF = { high: "#15803D", medium: "#8A6D1F", low: "#B91C1C" };

function Row({ label, value, foot }) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2">
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="text-[15px] font-bold tabular-nums text-neutral-900">{value}</div>
      {foot && <div className="text-[10.5px] text-neutral-500">{foot}</div>}
    </div>
  );
}

export default function MarketResearch({ city, state, zip, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

  const call = async (save) => {
    setBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/market-research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.session?.access_token || ""}`,
        },
        body: JSON.stringify({ city, state, zip, save }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Research failed.");
        return;
      }
      setResult(j);
      if (save) {
        setSavedMsg(`Saved for ${j.place}.`);
        onSaved?.(j);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!city || !state) {
    return (
      <div className="rounded border border-neutral-200 bg-white px-4 py-3 text-[12px] text-neutral-600">
        Set a city and state on the record before running market research.
      </div>
    );
  }

  const r = result?.report;
  const growth =
    r?.population && r?.population_prior ? r.population / r.population_prior - 1 : null;

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
            Market research
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-600">
            Population, income, renter share, rents and the named employers for{" "}
            <strong>
              {city}, {state}
            </strong>
            . Shown for review first — nothing is saved until you say so.
          </p>
        </div>
        <button
          onClick={() => call(false)}
          disabled={busy}
          className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
          style={{ backgroundColor: "#111" }}
        >
          {busy ? "Researching…" : result ? "Run again" : "Run research"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-900">
          {savedMsg} It will show on the buyer sheet under the PadSplit market
          section.
        </div>
      )}

      {r && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Row
              label="Population"
              value={r.population ? r.population.toLocaleString() : "—"}
              foot={
                growth != null
                  ? `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}% year on year`
                  : r.population_year || null
              }
            />
            <Row
              label="Median income"
              value={usd(r.median_household_income)}
              foot={r.median_age ? `median age ${r.median_age}` : null}
            />
            <Row
              label="Renter households"
              value={pct(r.renter_share, 0)}
              foot={r.households ? `${r.households.toLocaleString()} households` : null}
            />
            <Row
              label="Median rent, 2 bed"
              value={r.median_rent_2br ? `${usd(r.median_rent_2br)}/mo` : "—"}
              foot={r.rent_yoy != null ? `${r.rent_yoy >= 0 ? "+" : ""}${(r.rent_yoy * 100).toFixed(1)}% yoy` : null}
            />
            <Row
              label="Median home value"
              value={usd(r.median_home_value)}
              foot={
                r.home_value_yoy != null
                  ? `${r.home_value_yoy >= 0 ? "+" : ""}${(r.home_value_yoy * 100).toFixed(1)}% yoy`
                  : null
              }
            />
            <Row
              label="Rent, 1 bed / 3 bed"
              value={`${r.median_rent_1br ? usd(r.median_rent_1br) : "—"} / ${
                r.median_rent_3br ? usd(r.median_rent_3br) : "—"
              }`}
            />
          </div>

          {!!r.major_employers?.length && (
            <div className="mt-3">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-neutral-500">
                Major employers
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.major_employers.map((e) => (
                  <span
                    key={e}
                    className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] text-neutral-800"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.notes && (
            <p className="mt-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11.5px] leading-relaxed text-neutral-700">
              {r.notes}
            </p>
          )}

          {!!result.flags?.length && (
            <ul className="mt-3 space-y-0.5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
              {result.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}

          {!!Object.keys(result.confidence || {}).length && (
            <div className="mt-3 flex flex-wrap gap-3 text-[10.5px]">
              {Object.entries(result.confidence).map(([k, v]) => (
                <span key={k} className="text-neutral-500">
                  {k}:{" "}
                  <strong style={{ color: CONF[v] || "#4A5A50" }}>{v}</strong>
                </span>
              ))}
            </div>
          )}

          {!!result.figures?.length && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11.5px] font-semibold text-neutral-700">
                Where each figure came from ({result.figures.length})
              </summary>
              <div className="mt-2 overflow-hidden rounded border border-neutral-200">
                <table className="w-full text-[11px]">
                  <tbody>
                    {result.figures.map((f, i) => (
                      <tr key={i} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                        <td className="px-2 py-1 font-semibold text-neutral-800">{f.field}</td>
                        <td className="px-2 py-1 tabular-nums text-neutral-900">
                          {f.value == null ? "—" : String(f.value)}
                        </td>
                        <td className="px-2 py-1 text-neutral-500">{f.year || ""}</td>
                        <td className="px-2 py-1 text-neutral-600">{f.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {!!result.missing?.length && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Not found: {result.missing.join(", ")}. Those stay empty rather than
              being estimated.
            </p>
          )}

          {r.source && (
            <p className="mt-2 text-[10.5px] text-neutral-500">
              Sources: {r.source}
              {r.as_of ? ` · as of ${r.as_of}` : ""}
            </p>
          )}

          {!result.saved && (
            <button
              onClick={() => call(true)}
              disabled={busy}
              className="mt-3 rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
            >
              {busy ? "Saving…" : "Save to the market report"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

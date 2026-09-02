"use client";

// ============================================================
// Market research coverage across every deal.
//
// Reports are keyed by city, so one run serves every house there.
// That is efficient and invisible: from a single deal page there is no
// way to tell whether the other Phoenix deals are covered, or that
// Chandler has never been researched at all. This lists every city
// that has a deal in it, what is covered, and what isn't.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/queries";

const GREEN = "#00A651";
const AMBER = "#8A6D1F";

export default function MarketCoverage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(null);
  const [msg, setMsg] = useState(null);

  const token = async () => {
    const { data: sess } = await supabase.auth.getSession();
    return sess?.session?.access_token || "";
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market-research", {
        headers: { Authorization: `Bearer ${await token()}` },
      });
      const j = await res.json();
      if (!res.ok) setError(j.error || "Couldn't load coverage.");
      else setData(j);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // One city at a time rather than a single button that does all of
  // them. Each run is a handful of web searches, and a bulk run that
  // half-fails leaves no clear record of which halves.
  const run = async (place) => {
    setRunning(`${place.city}|${place.state}`);
    setMsg(null);
    try {
      const res = await fetch("/api/market-research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await token()}`,
        },
        body: JSON.stringify({ city: place.city, state: place.state, save: true }),
      });
      const j = await res.json();
      setMsg(
        res.ok
          ? `${place.city}: saved${j.flags?.length ? ` — ${j.flags.length} thing${j.flags.length === 1 ? "" : "s"} to check on the deal page` : ""}.`
          : `${place.city}: ${j.error || "failed"}`
      );
      if (res.ok) await load();
    } catch (e) {
      setMsg(`${place.city}: ${e.message}`);
    } finally {
      setRunning(null);
    }
  };

  if (error)
    return (
      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
        {error}
      </div>
    );
  if (!data) return <div className="text-[12px] text-neutral-500">Loading coverage…</div>;

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Market research coverage
      </div>
      <p className="mt-0.5 text-[12px] text-neutral-600">
        One report per city, shared by every deal in it. {data.covered} of{" "}
        {data.total} cities covered
        {data.dealsUncovered
          ? ` · ${data.dealsUncovered} deal${data.dealsUncovered === 1 ? "" : "s"} with no market report`
          : ""}
        .
      </p>

      {msg && (
        <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-800">
          {msg}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded border border-neutral-200">
        <table className="w-full text-[12px]">
          <thead className="bg-neutral-900 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">City</th>
              <th className="px-3 py-2 text-right font-semibold">Deals</th>
              <th className="px-3 py-2 text-left font-semibold">Report</th>
              <th className="px-3 py-2 text-right font-semibold">Population</th>
              <th className="px-3 py-2 text-right font-semibold">Employers</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.places.map((p, i) => {
              const busy = running === `${p.city}|${p.state}`;
              return (
                <tr key={`${p.city}-${p.state}`} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                  <td className="px-3 py-2 font-semibold text-neutral-900">
                    {p.city}, {p.state}
                    <span className="block text-[10.5px] font-normal text-neutral-500">
                      {p.deals.map((d) => d.address).filter(Boolean).slice(0, 2).join(" · ")}
                      {p.deals.length > 2 ? ` +${p.deals.length - 2}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.dealCount}</td>
                  <td className="px-3 py-2">
                    {!p.hasReport ? (
                      <span className="font-semibold" style={{ color: AMBER }}>
                        None
                      </span>
                    ) : p.stale ? (
                      <span style={{ color: AMBER }}>
                        {p.ageDays} days old
                      </span>
                    ) : (
                      <span style={{ color: GREEN }}>
                        {p.ageDays != null ? `${p.ageDays} days ago` : "current"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {p.population ? p.population.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                    {p.employers || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => run(p)}
                      disabled={!!running}
                      className="rounded px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                      style={{ backgroundColor: p.hasReport ? "#111" : GREEN }}
                    >
                      {busy ? "Running…" : p.hasReport ? "Re-run" : "Research"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10.5px] text-neutral-500">
        Run from here to fill a gap, or from a deal&rsquo;s Record tab where the
        figures can be reviewed one at a time before saving. Anything older than
        six months is marked — rents and population move.
      </p>
    </div>
  );
}

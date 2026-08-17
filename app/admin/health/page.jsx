"use client";

// ============================================================
// /admin/health — what's actually wrong.
//
// Grouped by area, failures first, each with the fix beside it. The
// point is to turn "some pieces aren't working" into a list you can
// act on without knowing which migration does what.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/queries";

const GREEN = "#00A651";
const RED = "#B91C1C";

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/health", { method: "GET" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Failed with ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const areas = data
    ? [...new Set(data.checks.map((c) => c.area))]
    : [];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 font-sans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">System check</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Migrations, settings and data completeness. Anything failing here
            shows up in the app as a blank panel or an empty list.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
          style={{ backgroundColor: GREEN }}
        >
          {busy ? "Checking…" : "Re-run"}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          {error}
        </div>
      )}

      {data && (
        <div
          className="mt-5 rounded border-l-4 px-4 py-3"
          style={{
            borderColor: data.ok ? GREEN : RED,
            backgroundColor: data.ok ? "#F2FAF5" : "#FEF2F2",
          }}
        >
          <div className="text-[15px] font-bold text-neutral-900">
            {data.ok
              ? "Everything checks out."
              : `${data.summary.failed} of ${data.summary.total} checks failing`}
          </div>
          {!data.ok && (
            <div className="mt-0.5 text-[12px] text-neutral-600">
              Work down the list — migrations first, then settings, then data.
            </div>
          )}
        </div>
      )}

      {areas.map((area) => {
        const rows = data.checks.filter((c) => c.area === area);
        const bad = rows.filter((r) => !r.ok).length;
        return (
          <div key={area} className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-neutral-900">
                {area}
              </h2>
              <span className="text-[11px] text-neutral-500">
                {bad ? `${bad} failing` : "all clear"}
              </span>
            </div>

            <div className="overflow-hidden rounded border border-neutral-200 bg-white">
              {[...rows].sort((a, b) => a.ok - b.ok).map((c, i) => (
                <div
                  key={c.name + i}
                  className="flex gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0"
                >
                  <span
                    className="mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ backgroundColor: c.ok ? GREEN : RED }}
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-neutral-900">{c.name}</div>
                    <div className="text-[12px] text-neutral-600">{c.detail}</div>
                    {c.fix && (
                      <div className="mt-1 text-[11px] text-neutral-500">
                        <strong>Fix:</strong> {c.fix}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!data && !error && (
        <div className="mt-6 text-[13px] text-neutral-500">Running checks…</div>
      )}
    </div>
  );
}

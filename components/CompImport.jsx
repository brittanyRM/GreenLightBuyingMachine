"use client";

// ============================================================
// Paste a flexmls export, see what it would write, then write it.
//
// The preview is not decoration. The parser reads a fixed-column
// report positionally, and the failure mode of a positional reader is
// a plausible-looking wrong number — a year read as square footage, an
// original asking price read as the current one. Showing the rows
// before they land is what makes that catchable, so the preview runs
// the same code path as the import with dryRun set rather than a
// separate approximation of it.
// ============================================================

import { useState } from "react";

const GREEN = "#00A651";
const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

const STATUS_LABEL = {
  closed: "Closed",
  pending: "Pending",
  active: "Active",
  coming_soon: "Coming soon",
  ucb: "UCB",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function CompImport({ slug, onImported }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const call = async (dryRun) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${slug}/comps/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dryRun }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Import failed.");
        setPreview(null);
        return;
      }
      if (dryRun) {
        setPreview(json);
        setDone(null);
      } else {
        setDone(json);
        setPreview(null);
        setText("");
        onImported?.(json);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Import comps
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">
        Open the flexmls summary report, select the text and paste it here. The
        one with MLS number, address, list price and days on market in columns —
        closed, pending, active and coming soon sections are all read, and the
        status comes from the section heading rather than being guessed.
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setDone(null);
        }}
        rows={6}
        placeholder="Paste the export here…"
        className="mt-3 w-full rounded border border-neutral-300 p-2 font-mono text-[11px] outline-none focus:border-neutral-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => call(true)}
          disabled={busy || !text.trim()}
          className="rounded px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: "#111" }}
        >
          {busy ? "Reading…" : "Preview"}
        </button>
        {preview && (
          <button
            onClick={() => call(false)}
            disabled={busy || (!preview.inserted && !preview.updated)}
            className="rounded px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: GREEN }}
          >
            {preview.inserted || preview.updated
              ? `Import ${preview.inserted} new${
                  preview.updated ? `, update ${preview.updated}` : ""
                }`
              : "Nothing to import"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}

      {done && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-900">
          Imported {done.inserted} new comp{done.inserted === 1 ? "" : "s"}
          {done.updated ? `, updated ${done.updated}` : ""}
          {done.unchanged ? `, ${done.unchanged} already current` : ""}.
        </div>
      )}

      {preview && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-neutral-700">
            <span>
              <strong>{preview.parsed}</strong> rows read
            </span>
            <span>
              <strong>{preview.inserted}</strong> new
            </span>
            <span>
              <strong>{preview.updated}</strong> changed
            </span>
            <span className="text-neutral-500">
              {preview.unchanged} already current
            </span>
          </div>

          <div className="mt-1 text-[11px] text-neutral-500">
            {Object.entries(preview.byStatus || {})
              .map(([k, v]) => `${v} ${STATUS_LABEL[k] || k}`)
              .join(" · ")}
          </div>

          {!!preview.audit?.length && (
            <ul className="mt-2 space-y-0.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
              {preview.audit.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}

          {!!preview.warnings?.length && (
            <ul className="mt-2 space-y-0.5 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-900">
              {preview.warnings.map((w, i) => (
                <li key={i}>
                  Skipped — {w.reason}: <span className="font-mono">{w.line}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 max-h-72 overflow-auto rounded border border-neutral-200">
            <table className="w-full text-[11.5px]">
              <thead className="sticky top-0 bg-neutral-900 text-white">
                <tr>
                  {["MLS", "Address", "Status", "Sq ft", "$/sqft", "Price", "CDOM"].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-2 py-1.5 font-semibold ${
                          h === "Address" || h === "MLS" || h === "Status"
                            ? "text-left"
                            : "text-right"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {(preview.comps || []).map((c, i) => (
                  <tr key={c.mls_number} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                    <td className="px-2 py-1 font-mono text-neutral-500">
                      {c.mls_number}
                    </td>
                    <td className="px-2 py-1">
                      {c.address}
                      {c.notes && (
                        <span className="ml-1 text-[10.5px] text-amber-700">
                          {c.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-neutral-600">
                      {STATUS_LABEL[c.comp_status] || c.comp_status}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {c.approx_sqft ? c.approx_sqft.toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {c.price_per_sqft ? `$${c.price_per_sqft}` : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">
                      {usd(c.sold_price ?? c.list_price)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-neutral-500">
                      {c.cdom ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-neutral-500">
            Nothing is written until you press import. Rows already on this deal
            with the same MLS number are updated rather than duplicated, so
            re-pasting a later export refreshes prices instead of doubling them.
          </p>
        </div>
      )}
    </div>
  );
}

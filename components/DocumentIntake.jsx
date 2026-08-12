"use client";

import { useState } from "react";
import { supabase, apiFetch } from "../lib/queries";

const GREEN = "#00A651";

const FIELD_LABELS = {
  address_line: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP",
  parcel_number: "Parcel",
  subdivision: "Subdivision",
  year_built: "Year built",
  lot_sqft: "Lot sq ft",
  lot_acres: "Lot acres",
  living_area_sqft: "Living area",
  added_sqft: "Added attached",
  post_reno_sqft: "Marketed sq ft",
  construction_type: "Construction",
  zoning: "Zoning",
  school_district: "School district",
  legal_class: "Legal class",
  assessed_tax_amount: "Last tax bill",
  bathrooms: "Bathrooms",
  purchase_price: "Purchase price",
  list_price: "Turnkey list price",
  close_of_escrow: "Acquisition COE",
  disposition_coe: "Delivery to buyer",
};

const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

export default function DocumentIntake({ onApply }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(null);
  const [debug, setDebug] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [skip, setSkip] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);

  function addFiles(list) {
    setFiles((f) => [...f, ...Array.from(list)]);
    setResult(null);
  }

  async function extract() {
    setBusy(true);
    setError(null);
    setStage("Uploading");
    try {
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > MAX_TOTAL_BYTES) {
        throw new Error(
          `That's ${(total / 1048576).toFixed(1)}MB. Split the packet and read it in two passes.`
        );
      }

      const batch = `intake/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const paths = [];
      let storageWorked = true;

      for (const f of files) {
        const path = `${batch}/${f.name.replace(/[^\w.\-]/g, "_")}`;
        let lastErr = null;

        // Two attempts — a dropped connection on the first try is common
        // on large scans and usually succeeds on the retry.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { error: upErr } = await supabase.storage
              .from("deal-documents")
              .upload(path, f, { upsert: true, contentType: f.type || "application/pdf" });
            if (upErr) throw new Error(upErr.message);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 800));
          }
        }

        if (lastErr) {
          storageWorked = false;
          break;
        }
        paths.push(path);
      }

      setStage("Reading");
      let res;

      if (storageWorked) {
        res = await apiFetch("/api/extract-deal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        });
      } else {
        // Storage refused the file. Post it straight to the route
        // instead — works below Vercel's 4.5MB body cap.
        if (total > 4 * 1024 * 1024) {
          throw new Error(
            `Storage upload failed and the packet is ${(total / 1048576).toFixed(1)}MB — too big to send directly. Check that migration 006 ran, then try one file at a time.`
          );
        }
        const form = new FormData();
        files.forEach((f) => form.append("files", f, f.name));
        res = await apiFetch("/api/extract-deal", { method: "POST", body: form });
      }

      const raw = await res.text();
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          res.status === 504
            ? "The read timed out. Try fewer pages at once."
            : `Server returned ${res.status}. ${raw.slice(0, 140)}`
        );
      }
      if (!res.ok) throw new Error(json.error);

      setResult(json.extracted);
      setDebug(json.debug);
      // A partial read is still useful, but the reader has to know
      // which part of the packet didn't make it in.
      if (json.debug?.truncationNote) setWarning(json.debug.truncationNote);
      else setWarning(null);
      setSkip(new Set());
    } catch (e) {
      setError(
        /load failed|failed to fetch/i.test(e.message)
          ? "The read ran past the server time limit. Split the packet — two or three pages per read gets through."
          : e.message
      );
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  function apply() {
    if (!result) return;
    const deal = Object.fromEntries(
      Object.entries(result.deal || {}).filter(
        ([k, v]) => v !== null && v !== "" && !skip.has(k)
      )
    );
    onApply({
      deal,
      market: result.market,
      comps: result.comps || [],
      conversion: result.conversion,
    });
    setResult(null);
    setFiles([]);
  }

  const dealFields = Object.entries(result?.deal || {}).filter(
    ([, v]) => v !== null && v !== ""
  );
  const missing = Object.entries(result?.deal || {})
    .filter(([, v]) => v === null || v === "")
    .map(([k]) => FIELD_LABELS[k] || k);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-neutral-900 pb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">
          Read the packet
        </h2>
        <span className="text-[10px] italic text-neutral-400">optional</span>
      </div>

      {!result && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`rounded border-2 border-dashed p-6 text-center transition ${
              dragOver ? "border-neutral-500 bg-neutral-50" : "border-neutral-300 bg-white"
            }`}
          >
            <p className="text-sm font-semibold text-neutral-700">
              Drop the deal packet here
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-neutral-500">
              Assessor record, MLS comps, PadSplit market screenshot, marked-up sketch.
              PDFs and images. Handwriting is read too.
            </p>
            <label className="mt-3 inline-block cursor-pointer rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: GREEN }}
            >
              Choose files
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700"
                  >
                    {f.name}
                    <span className="text-neutral-400">
                      {(f.size / 1048576).toFixed(1)}MB
                    </span>
                    <button
                      onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                      className="text-neutral-400 hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={extract}
                disabled={busy}
                className="mt-3 rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
                style={{ backgroundColor: GREEN }}
              >
                {busy
                  ? `${stage}…`
                  : `Read ${files.length} file${files.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}

          {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}
          {warning && (
            <p className="mt-2 border-l-4 border-amber-500 bg-amber-50 p-2 text-[12px] leading-snug text-amber-900">
              {warning}
            </p>
          )}
        </>
      )}

      {result && (
        <div className="bg-white p-4 shadow-sm">
          {result.conversion?.bedrooms_after && (
            <div className="mb-3 rounded bg-neutral-950 px-3 py-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Conversion found
              </span>
              <div className="text-sm font-bold" style={{ color: GREEN }}>
                {result.conversion.bedrooms_after} bed / {result.conversion.bathrooms_after} bath
                {result.conversion.ensuite_count
                  ? ` · ${result.conversion.ensuite_count} ensuite`
                  : ""}
              </div>
              <p className="mt-0.5 text-[10px] text-neutral-400">
                Draw it on the Sketch tab — that's what sets the bedroom count.
              </p>
            </div>
          )}

          {result.conflicts?.length > 0 && (
            <div className="mb-3 rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                Figures that disagree
              </div>
              <ul className="mt-1 space-y-0.5">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="text-[12px] text-amber-900">
                    · {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mb-2 text-[11px] text-neutral-500">
            Uncheck anything wrong before applying. Nothing is saved until you hit Save Deal.
          </p>

          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {dealFields.map(([k, v]) => (
              <label
                key={k}
                className="flex items-center gap-2 border-b border-neutral-100 py-1"
              >
                <input
                  type="checkbox"
                  checked={!skip.has(k)}
                  onChange={() =>
                    setSkip((s) => {
                      const n = new Set(s);
                      n.has(k) ? n.delete(k) : n.add(k);
                      return n;
                    })
                  }
                  className="h-3.5 w-3.5"
                />
                <span className="w-36 shrink-0 text-[11px] text-neutral-500">
                  {FIELD_LABELS[k] || k}
                </span>
                <span className="flex-1 truncate text-[12px] font-semibold text-neutral-900">
                  {String(v)}
                </span>
              </label>
            ))}
          </div>

          {(result.comps?.length > 0 || result.market?.active_units) && (
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-600">
              {result.comps?.length > 0 && (
                <span>
                  <b>{result.comps.length}</b> comps found
                </span>
              )}
              {result.market?.active_units && (
                <span>
                  Market <b>{result.market.zip}</b> — {result.market.active_units} units,{" "}
                  {Math.round(result.market.avg_occupancy * 100)}% occupancy
                </span>
              )}
            </div>
          )}

          {missing.length > 0 && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Not found, fill by hand: {missing.join(", ")}.
            </p>
          )}

          {debug && (
            <p className="mt-3 text-[10px] text-neutral-400">
              Read {debug.files?.length} file{debug.files?.length === 1 ? "" : "s"}:{" "}
              {debug.files?.join(", ")}
              {debug.stop_reason === "max_tokens" && " — response was cut short"}
              {" · "}
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="underline underline-offset-2 hover:text-neutral-600"
              >
                {showRaw ? "hide" : "show"} raw
              </button>
            </p>
          )}

          {showRaw && (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-950 p-2 text-[9px] leading-relaxed text-neutral-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={apply}
              className="rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: GREEN }}
            >
              Fill the form
            </button>
            <button
              onClick={() => setResult(null)}
              className="rounded border border-neutral-300 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-600"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

// ============================================================
// /buyers/research — send us comps, we run the market work.
//
// The service, not a document drop. A buyer with their own comps on a
// market they're considering gets our analysis back; we learn what
// they're looking at, which is worth more than the analysis costs.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import BuyerNav, { useBuyer } from "../../../components/BuyerNav";

const GREEN = "#00A651";

const KINDS = [
  { id: "market_research", label: "Run the market research", hint: "population, rents, demand — a full picture of the market" },
  { id: "comp_review", label: "Check my comps", hint: "we'll tell you what we think they support" },
  { id: "question", label: "Ask a question", hint: "anything else" },
];

const STATUS = {
  new: "With Green Light",
  in_progress: "Being worked on",
  answered: "Answered",
  closed: "Closed",
};

export default function BuyerResearch() {
  const buyer = useBuyer();
  const [kind, setKind] = useState("market_research");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState(null);

  const load = useCallback(() => {
    fetch("/api/buyer/request")
      .then((r) => r.json())
      .then((j) => setHistory(j.requests || []))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (buyer) load();
  }, [buyer, load]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("subject", subject);
      fd.append("note", note);
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/buyer/request", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't send that.");

      setSent(true);
      setSubject("");
      setNote("");
      setFiles([]);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!buyer)
    return <div className="p-10 text-center font-sans text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">Market research</h1>
        <p className="mt-1 text-[13px] leading-snug text-neutral-600">
          Send us your comps and we&rsquo;ll do the market work — population and
          growth, what conventional rent costs, PadSplit occupancy and active
          units, and what we think the numbers actually support. No charge.
        </p>

        {sent && (
          <div
            className="mt-5 rounded border-l-4 bg-white px-4 py-3 text-[13px] text-neutral-700"
            style={{ borderColor: GREEN }}
          >
            <strong className="text-neutral-900">Sent.</strong> We&rsquo;ll come
            back to you — usually within a couple of working days.
          </div>
        )}

        <div className="mt-5 rounded border border-neutral-200 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            What do you need
          </div>
          <div className="mt-2 space-y-2">
            {KINDS.map((k) => (
              <label key={k.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-neutral-900">
                    {k.label}
                  </span>
                  <span className="block text-[11px] text-neutral-500">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Which market
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Charlotte NC, or a specific ZIP"
              className="mt-1 w-full rounded border border-neutral-300 px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
            />
          </label>

          <label className="mt-3 block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Anything we should know
            </span>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you're trying to work out, the buy box you're testing against…"
              className="mt-1 w-full rounded border border-neutral-300 px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
            />
          </label>

          <label className="mt-3 block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Your comps
            </span>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="mt-1 w-full text-[12px]"
            />
            <span className="mt-0.5 block text-[10px] text-neutral-400">
              PDF, image, CSV or spreadsheet. Up to 5 files, 10MB each.
            </span>
          </label>

          {files.length > 0 && (
            <div className="mt-2 text-[11px] text-neutral-600">
              {files.map((f) => f.name).join(", ")}
            </div>
          )}

          {error && <div className="mt-3 text-[12px] text-red-700">{error}</div>}

          <button
            onClick={submit}
            disabled={busy}
            className="mt-4 rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {busy ? "Sending…" : "Send to Green Light"}
          </button>
        </div>

        {history && history.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Your requests
            </div>
            {history.map((r) => (
              <div key={r.id} className="mb-3 rounded border border-neutral-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-neutral-900">
                    {r.subject || KINDS.find((k) => k.id === r.kind)?.label || r.kind}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: r.status === "answered" ? GREEN : "#9AA3AB" }}
                  >
                    {STATUS[r.status] || r.status}
                  </span>
                  <span className="ml-auto text-[11px] text-neutral-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                {r.note && (
                  <p className="mt-1 text-[12px] text-neutral-600">{r.note}</p>
                )}

                {r.buyer_request_files?.length > 0 && (
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {r.buyer_request_files.map((f) => f.file_name).join(", ")}
                  </div>
                )}

                {r.response && (
                  <div
                    className="mt-2 rounded border-l-2 bg-neutral-50 px-3 py-2 text-[12px] leading-snug text-neutral-800"
                    style={{ borderColor: GREEN }}
                  >
                    {r.response}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

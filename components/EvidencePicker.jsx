"use client";

// ============================================================
// Which documents a buyer can open.
//
// deal_documents holds everything attached to a deal, including things
// a buyer should never see — closing statements, loan requests, our
// basis. So visibility is opt-in per document rather than a blanket
// setting, and anything that looks like an internal document is
// flagged rather than silently trusted to a tick box.
//
// This lived on the pro forma editor. It belongs with the record: the
// documents are part of the deal, and deciding what a buyer may read
// is a property of the deal rather than of a sheet.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/queries";

// Names that usually mean "ours only". Matching is on the doc_type and
// the title, because a closing statement uploaded with a vague title is
// still a closing statement.
const INTERNAL = /loan_request|settlement|closing|note|basis|payoff|escrow/i;

export default function EvidencePicker({ dealId }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!dealId) return;
    supabase
      .from("deal_documents")
      .select("id, doc_type, title, file_type, public_url, buyer_visible, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setDocs(data || []);
      });
  }, [dealId]);

  useEffect(load, [load]);

  async function toggle(doc) {
    const next = !doc.buyer_visible;
    // Optimistic, then rolled back if the write fails — a checkbox that
    // waits on a round trip feels broken, and one that stays ticked
    // after a failure is worse than either.
    setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, buyer_visible: next } : x)));
    const { error: e } = await supabase
      .from("deal_documents")
      .update({ buyer_visible: next })
      .eq("id", doc.id);
    if (e) {
      setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, buyer_visible: !next } : x)));
      setError(e.message);
    }
  }

  if (!dealId) return null;

  const shown = docs ? docs.filter((d) => d.buyer_visible).length : 0;

  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Evidence{docs ? ` — ${shown} of ${docs.length} visible to buyers` : ""}
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-600">
        Ticked documents appear on the buyer sheet under Diligence, where a
        buyer can open them. Everything else stays ours.
      </p>

      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          {error}
        </div>
      )}

      {!docs && <div className="mt-3 text-[12px] text-neutral-500">Loading…</div>}

      {docs && docs.length === 0 && (
        <div className="mt-3 text-[12px] text-neutral-500">
          No documents on this deal yet.
        </div>
      )}

      {docs && docs.length > 0 && (
        <div className="mt-3 overflow-hidden rounded border border-neutral-200">
          {docs.map((d, i) => {
            const internal = INTERNAL.test(`${d.doc_type || ""} ${d.title || ""}`);
            return (
              <label
                key={d.id}
                className={`flex items-center gap-3 border-b border-neutral-100 px-3 py-2 last:border-b-0 ${
                  i % 2 ? "bg-neutral-50" : "bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!d.buyer_visible}
                  onChange={() => toggle(d)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-neutral-900">
                    {d.title || d.doc_type || "Untitled"}
                  </span>
                  <span className="block text-[10.5px] text-neutral-500">
                    {d.doc_type}
                    {d.created_at ? ` · ${new Date(d.created_at).toLocaleDateString()}` : ""}
                  </span>
                </span>
                {internal && (
                  <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-red-700">
                    Ours only
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-500">
        Anything marked <strong>ours only</strong> matched a closing statement,
        loan request or basis document by name. The tick still works — the flag
        is there so it takes a deliberate one.
      </p>
    </div>
  );
}

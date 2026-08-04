"use client";

import { useState, useEffect, useMemo } from "react";
import { computeProForma } from "../lib/proforma";
import { buildDealEmail, emailPreflight } from "../lib/email";
import { listBuyers } from "../lib/queries";

const GREEN = "#00A651";

const TONES = [
  { id: "standard", label: "Standard" },
  { id: "numbers_first", label: "Numbers first" },
  { id: "short", label: "Short" },
];

export default function EmailComposer({
  deal,
  rooms,
  market,
  comps,
  orgRows,
  documents = [],
  senderName = "",
}) {
  const [attachIds, setAttachIds] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [contact, setContact] = useState(null);
  const [tone, setTone] = useState("standard");
  const [edited, setEdited] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const p = useMemo(
    () => computeProForma({ deal, rooms, market, comps, orgRows }),
    [deal, rooms, market, comps, orgRows]
  );

  const warnings = useMemo(
    () => emailPreflight({ deal, rooms, market, proforma: p }),
    [deal, rooms, market, p]
  );

  useEffect(() => {
    listBuyers({ zip: deal.zip, price: p.price }).then(setBuyers).catch(() => {});
  }, [deal.zip, p.price]);

  const generated = useMemo(
    () =>
      buildDealEmail({
        deal,
        rooms,
        market,
        proforma: p,
        contactName: contact?.full_name?.split(" ")[0] || "there",
        tone,
        senderName,
      }),
    [deal, rooms, market, p, contact, tone, senderName]
  );

  const draft = edited ?? generated;

  async function handleCopy() {
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend() {
    if (!contact) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          contactId: contact.id,
          subject: draft.subject,
          body: draft.body,
          documentIds: attachIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult({
        ok: true,
        text: `Sent from ${json.from} to ${contact.email}${
          json.attachments ? ` with ${json.attachments} attachment${json.attachments > 1 ? "s" : ""}` : ""
        }. It's in your Gmail Sent folder.`,
      });
    } catch (e) {
      setResult({ ok: false, text: e.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 font-sans sm:p-8">
      <div className="mb-4 bg-neutral-950 px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
          Buyer email
        </div>
        <h1 className="text-lg font-bold text-white">{deal.address_line}</h1>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
            Check before sending
          </div>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((w) => (
              <li key={w} className="text-[12px] text-amber-900">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={contact?.id || ""}
          onChange={(e) => {
            setContact(buyers.find((b) => b.id === e.target.value) || null);
            setEdited(null);
          }}
          className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none"
        >
          <option value="">Select buyer…</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.full_name} — {b.email}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {TONES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTone(t.id);
                setEdited(null);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                tone === t.id ? "text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-300"
              }`}
              style={tone === t.id ? { backgroundColor: GREEN } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
            Subject
          </span>
          <input
            value={draft.subject}
            onChange={(e) => setEdited({ ...draft, subject: e.target.value })}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
            Body
          </span>
          <textarea
            value={draft.body}
            onChange={(e) => setEdited({ ...draft, body: e.target.value })}
            rows={22}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-neutral-900"
          />
        </label>

        {documents.length > 0 && (
          <div className="mt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              Attach
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {documents.map((d) => {
                const on = attachIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() =>
                      setAttachIds((ids) =>
                        on ? ids.filter((i) => i !== d.id) : [...ids, d.id]
                      )
                    }
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      on ? "text-white" : "bg-neutral-100 text-neutral-600"
                    }`}
                    style={on ? { backgroundColor: GREEN } : {}}
                  >
                    {d.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleSend}
            disabled={!contact || sending}
            className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
            style={{ backgroundColor: GREEN }}
          >
            {sending ? "Sending…" : contact ? `Send to ${contact.full_name.split(" ")[0]}` : "Select a buyer"}
          </button>
          <button
            onClick={handleCopy}
            className="rounded border border-neutral-300 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-700"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {edited && (
            <button
              onClick={() => setEdited(null)}
              className="text-[11px] font-semibold text-neutral-500 underline underline-offset-2"
            >
              Reset to generated
            </button>
          )}
          {result && (
            <span className={`text-[11px] ${result.ok ? "text-neutral-600" : "text-red-700"}`}>
              {result.text}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
        Sends from your Google Workspace mailbox, so it lands in Sent and replies thread normally.
        Every figure above is generated from the saved layout and market data — edits here don't
        change the deal record. If nobody replies in three days, the cron sends one nudge in the
        same thread; a reply cancels it automatically.
      </p>
    </div>
  );
}

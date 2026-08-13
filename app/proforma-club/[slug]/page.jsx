"use client";

// ============================================================
// Club-format pro forma for a saved deal.
//
// The working loop is: adjust assumptions → preview what a buyer
// sees → share. Adjustments survive the preview toggle and are frozen
// onto the link, so a recipient opens the figures that were actually
// sent rather than a rebuild from the deal record.
//
// Read-only against the existing tables.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDealBundle, supabase } from "../../../lib/queries";
import { inputsFromDeal } from "../../../lib/proformaClubPresets";
import { usd } from "../../../lib/proformaClub";
import ClubProForma from "../../../components/ClubProForma";

const GREEN = "#00A651";

export default function ClubProFormaDeal({ params }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);

  // The live model, reported up from the sheet. Held in a ref as well
  // so the share handler reads the latest without re-creating itself.
  const [model, setModel] = useState(null);
  const modelRef = useRef(null);
  const onModelChange = useCallback((m) => {
    modelRef.current = m;
    setModel(m);
  }, []);

  const [shareOpen, setShareOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [label, setLabel] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [allowAdjust, setAllowAdjust] = useState(true);
  const [share, setShare] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDealBundle(params.slug)
      .then((b) => !cancelled && setBundle(b))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  // Seller basis to start with. Rebuilt only when the deal loads —
  // never on preview toggle, or edits would be wiped.
  const sellerInputs = useMemo(() => {
    if (!bundle) return null;
    const { deal, rooms, market } = bundle;
    return inputsFromDeal({ deal, rooms, market }, { audience: "seller" });
  }, [bundle]);

  // Preview swaps the price to list and keeps every adjustment. That
  // matters: a buyer should see the assumptions we tuned, priced at
  // what they'd actually pay.
  const activeInputs = useMemo(() => {
    if (!sellerInputs) return null;
    const current = model || sellerInputs;
    if (!preview) return current;

    const listPrice = Number(bundle?.deal?.list_price) || current.capitalization.purchasePrice;
    return {
      ...current,
      capitalization: { ...current.capitalization, purchasePrice: listPrice },
    };
    // model is deliberately excluded from deps: it changes on every
    // edit, and re-deriving here would fight the sheet's own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerInputs, preview, bundle]);

  async function createShareLink() {
    setSharing(true);
    setShareError(null);
    setCopied(false);
    try {
      const current = modelRef.current;
      const listPrice = Number(bundle?.deal?.list_price);
      if (!listPrice) throw new Error("Set a list price on this deal before sharing it.");

      // Send the adjusted model, priced at list rather than our basis.
      const frozen = current
        ? {
            ...current,
            capitalization: { ...current.capitalization, purchasePrice: listPrice },
          }
        : null;

      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/club-share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          slug: params.slug,
          scenario: "base",
          hold_years: frozen?.exit?.holdYears || 10,
          recipient: recipient || null,
          label: label || null,
          expires_days: expiresDays ? Number(expiresDays) : null,
          allow_adjust: allowAdjust,
          inputs: frozen,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't create a link.");
      setShare(json.link);
      try {
        await navigator.clipboard.writeText(json.link.url);
        setCopied(true);
      } catch {
        // Clipboard is blocked in some browsers; the URL is shown anyway.
      }
    } catch (e) {
      setShareError(e.message);
    } finally {
      setSharing(false);
    }
  }

  if (error)
    return (
      <div className="p-8 font-sans text-sm text-red-700">
        Couldn&rsquo;t load this deal: {error}
      </div>
    );

  if (!activeInputs)
    return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  const { deal, comps, market, defaults } = bundle;
  const noList = !deal.list_price;
  const edited = model && sellerInputs && JSON.stringify(model) !== JSON.stringify(sellerInputs);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-2 bg-neutral-950 px-5 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
          Viewing as
        </span>
        {[
          { id: false, label: "Our underwriting" },
          { id: true, label: "Buyer sees" },
        ].map((v) => (
          <button
            key={String(v.id)}
            onClick={() => setPreview(v.id)}
            className={`rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
              preview === v.id ? "text-white" : "text-neutral-500 hover:text-neutral-200"
            }`}
            style={preview === v.id ? { backgroundColor: GREEN } : undefined}
          >
            {v.label}
          </button>
        ))}

        {preview ? (
          <span className="text-[11px] text-neutral-400">
            Priced at list{deal.list_price ? ` — ${usd(deal.list_price)}` : ""}. Your
            adjustments are carried over.
          </span>
        ) : (
          edited && (
            <span className="text-[11px]" style={{ color: GREEN }}>
              Assumptions adjusted — these travel with the share link.
            </span>
          )
        )}

        <button
          onClick={() => setShareOpen((v) => !v)}
          disabled={noList}
          className="ml-auto rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-40"
          style={{ backgroundColor: GREEN }}
          title={noList ? "Set a list price first" : undefined}
        >
          Share with buyer
        </button>
      </div>

      {noList && (
        <div className="no-print border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-[12px] text-amber-900">
          This deal has no <strong>list price</strong> set. The buyer preview
          falls back to the purchase price and sharing is disabled — set a list
          price on the deal first.
        </div>
      )}

      {shareOpen && !noList && (
        <div className="no-print border-b border-neutral-200 bg-neutral-50 px-5 py-4">
          {share ? (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>
                  {copied ? "Link copied" : "Link ready"}
                </span>
                <input
                  readOnly
                  value={share.url}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-[12px] text-neutral-800"
                />
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(share.url);
                    setCopied(true);
                  }}
                  className="rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-600 ring-1 ring-neutral-300 hover:text-neutral-900"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    setShare(null);
                    setRecipient("");
                    setLabel("");
                  }}
                  className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                >
                  New link
                </button>
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">
                No sign-in needed. Opens the buyer sheet with the assumptions as
                they stand now — later edits here won&rsquo;t change it.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Who is this for
                </span>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Mogul"
                  className="mt-1 w-40 rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651]"
                />
              </label>

              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Note to yourself
                </span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Sent after the Tuesday call"
                  className="mt-1 w-56 rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651]"
                />
              </label>

              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Expires
                </span>
                <select
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                  className="mt-1 rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-[#00A651]"
                >
                  <option value="">Never</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 pb-2 text-[12px] text-neutral-700">
                <input
                  type="checkbox"
                  checked={allowAdjust}
                  onChange={(e) => setAllowAdjust(e.target.checked)}
                />
                Let them stress-test the assumptions
              </label>

              <button
                onClick={createShareLink}
                disabled={sharing}
                className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {sharing ? "Creating…" : "Create link"}
              </button>

              {shareError && (
                <span className="text-[12px] text-red-700">{shareError}</span>
              )}

              <span className="w-full text-[11px] text-neutral-500">
                Freezes the assumptions as they stand — {usd(deal.list_price)}{" "}
                list price, {activeInputs.exit.holdYears}-year hold. No basis,
                no internal panels.
                {allowAdjust
                  ? " They can change assumptions to stress-test; the sheet flags itself as adjusted and their edits never overwrite yours."
                  : " Assumptions are locked — they see the figures exactly as sent."}
              </span>
            </div>
          )}
        </div>
      )}

      <ClubProForma
        // initialInputs seeds state on mount only, so the toggle has to
        // remount or the price wouldn't swap. Edits survive because
        // activeInputs is derived from the current model.
        key={preview ? "buyer" : "seller"}
        initialInputs={activeInputs}
        backHref="/proforma-club"
        backLabel="All deals"
        audience={preview ? "buyer" : "seller"}
        deal={preview ? deal : null}
        comps={preview ? comps || [] : []}
        market={market}
        defaults={preview ? defaults : null}
        onModelChange={onModelChange}
      />
    </div>
  );
}

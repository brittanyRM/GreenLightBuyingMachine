"use client";

// ============================================================
// The buyer sheet for a saved deal.
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
import { inputsFromDeal, applySavedInputs } from "../../../lib/proformaClubPresets";
import { usd } from "../../../lib/proformaClub";
import ClubProForma from "../../../components/ClubProForma";

const GREEN = "#00A651";

export default function ClubProFormaDeal({ params }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);
  // The city research report and the surrounding PadSplit ZIPs, for the
  // Market research and Map tiles. Both are optional — the tiles simply
  // don't render without them, so a failure here can't break the sheet.
  const [marketReport, setMarketReport] = useState(null);
  const [nearbyMarkets, setNearbyMarkets] = useState([]);

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
  const [orgs, setOrgs] = useState([]);
  const [assignOrg, setAssignOrg] = useState("");
  const [assignStatus, setAssignStatus] = useState("offered");
  const [assignMsg, setAssignMsg] = useState(null);
  const [saved, setSaved] = useState(undefined); // undefined = not loaded yet
  const [savingInputs, setSavingInputs] = useState(false);
  const [inputsMsg, setInputsMsg] = useState(null);
  const [docs, setDocs] = useState(null);
  const [docsOpen, setDocsOpen] = useState(false);

  // Buyers available to assign to. Silent on failure — assignment is
  // optional and shouldn't break the sheet.
  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const res = await fetch("/api/buyer/admin/orgs", {
          headers: { Authorization: `Bearer ${sess?.session?.access_token || ""}` },
        });
        if (!res.ok) return;
        const j = await res.json();
        setOrgs((j.orgs || []).filter((o) => o.active));
      } catch {}
    })();
  }, []);

  async function assign() {
    setAssignMsg(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/buyer/admin/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess?.session?.access_token || ""}`,
        },
        body: JSON.stringify({ slug: params.slug, org_id: assignOrg, status: assignStatus }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't assign.");
      setAssignMsg(`Assigned to ${j.assignment?.buyer_orgs?.name || "buyer"}.`);
    } catch (e) {
      setAssignMsg(e.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getDealBundle(params.slug)
      .then(async (b) => {
        if (cancelled) return;
        setBundle(b);

        // City research report and the PadSplit ZIPs around the subject.
        // Both feed tiles that are off by default, so neither is worth
        // gating the sheet on — failures are swallowed on purpose.
        try {
          const [{ data: mr }, { data: mk }] = await Promise.all([
            // Same query the buyer routes use, so the preview shows
            // exactly what a buyer would be sent.
            supabase
              .from("market_reports")
              .select("*")
              .eq("active", true)
              .ilike("city", b.deal?.city || "")
              .ilike("state", b.deal?.state || "")
              .order("zip", { nullsFirst: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("padsplit_market")
              .select("zip, active_units, upcoming_units, shared_weekly, private_weekly, avg_occupancy, days_to_first_booking, latitude, longitude")
              .not("latitude", "is", null)
              .limit(60),
          ]);
          if (!cancelled) {
            setMarketReport(mr || null);
            setNearbyMarkets(mk || []);
          }
        } catch {}
        // Saved assumptions for this deal, if any.
        const { data } = await supabase
          .from("deal_proforma_inputs")
          .select("inputs")
          .eq("deal_id", b.deal.id)
          .maybeSingle();
        if (!cancelled) setSaved(data?.inputs || null);

        // Documents on this deal, so evidence can be published to
        // buyers without leaving the sheet.
        const { data: dd } = await supabase
          .from("deal_documents")
          .select("id, doc_type, title, file_type, public_url, buyer_visible, buyer_label, created_at")
          .eq("deal_id", b.deal.id)
          .order("created_at", { ascending: false });
        if (!cancelled) setDocs(dd || []);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  // Seller basis to start with. Rebuilt only when the deal loads —
  // never on preview toggle, or edits would be wiped.
  const sellerInputs = useMemo(() => {
    if (!bundle || saved === undefined) return null;
    const { deal, rooms, market, orgRows } = bundle;
    const base = inputsFromDeal({ deal, rooms, market, org: orgRows }, { audience: "seller" });
    return applySavedInputs(base, saved, { audience: "seller" });
  }, [bundle, saved]);

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

  // Persist the current model as this deal's pro forma. Buyers and
  // share links read the same row, so saving here is what makes an
  // adjustment real rather than a session-local edit.
  // buyer_visible is opt-in per document: deal_documents also holds
  // the loan request and the closing statement, and neither should
  // ever reach a buyer.
  async function toggleDoc(doc) {
    const next = !doc.buyer_visible;
    setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, buyer_visible: next } : x)));
    const { error: de } = await supabase
      .from("deal_documents")
      .update({ buyer_visible: next })
      .eq("id", doc.id);
    if (de) {
      setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, buyer_visible: !next } : x)));
      setInputsMsg(de.message);
    }
  }

  async function saveInputs() {
    setSavingInputs(true);
    setInputsMsg(null);
    try {
      const current = modelRef.current;
      if (!current) throw new Error("Nothing to save yet.");
      const { error: se } = await supabase
        .from("deal_proforma_inputs")
        .upsert({ deal_id: bundle.deal.id, inputs: current }, { onConflict: "deal_id" });
      if (se) throw se;
      setSaved(current);
      setInputsMsg("Saved to this deal.");
    } catch (e) {
      setInputsMsg(e.message);
    } finally {
      setSavingInputs(false);
    }
  }

  async function resetInputs() {
    setSavingInputs(true);
    setInputsMsg(null);
    try {
      const { error: de } = await supabase
        .from("deal_proforma_inputs")
        .delete()
        .eq("deal_id", bundle.deal.id);
      if (de) throw de;
      setSaved(null);
      setInputsMsg("Reset to defaults. Reload to see them.");
    } catch (e) {
      setInputsMsg(e.message);
    } finally {
      setSavingInputs(false);
    }
  }

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
          scenario: "glbm",
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

        {saved && !preview && (
          <span className="text-[11px] text-neutral-400">
            Saved assumptions in use
          </span>
        )}

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
          onClick={saveInputs}
          disabled={savingInputs || preview}
          className="rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-40"
          style={{ backgroundColor: "#0A0A0A" }}
          title={preview ? "Switch to our underwriting to save" : "Save these assumptions to the deal"}
        >
          {savingInputs ? "Saving…" : "Save to deal"}
        </button>

        {saved && (
          <button
            onClick={resetInputs}
            disabled={savingInputs}
            className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-200"
          >
            Reset
          </button>
        )}

        {inputsMsg && (
          <span className="text-[11px]" style={{ color: GREEN }}>{inputsMsg}</span>
        )}

        <button
          onClick={() => setDocsOpen((v) => !v)}
          className="rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400 ring-1 ring-neutral-700 transition hover:text-white"
        >
          Evidence{docs ? ` (${docs.filter((d) => d.buyer_visible).length})` : ""}
        </button>

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

      {docsOpen && (
        <div className="no-print border-b border-neutral-200 bg-neutral-50 px-5 py-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
            What a buyer can open
          </div>
          <p className="mb-3 text-[11px] text-neutral-500">
            Tick a document to publish it on the buyer sheet. Occupancy and the
            comps are the two figures they can&rsquo;t verify from the numbers
            alone. Loan requests and closing statements are in this list too —
            leave those unticked.
          </p>

          {!docs && <div className="text-[12px] text-neutral-500">Loading…</div>}
          {docs && docs.length === 0 && (
            <div className="text-[12px] text-neutral-600">
              No documents on this deal yet.
            </div>
          )}

          {(docs || []).map((d) => {
            const sensitive = ["loan_request", "settlement", "closing", "note"].some((k) =>
              String(d.doc_type || "").includes(k)
            );
            return (
              <label
                key={d.id}
                className="flex items-center gap-3 border-b border-neutral-200 py-2 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={!!d.buyer_visible}
                  onChange={() => toggleDoc(d)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-neutral-900">{d.title}</span>
                  <span className="text-[11px] text-neutral-500">
                    {d.doc_type}
                    {d.file_type ? ` · ${d.file_type}` : ""}
                  </span>
                </span>
                {sensitive && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                    Ours only
                  </span>
                )}
              </label>
            );
          })}
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

              {orgs.length > 0 && (
                <div className="flex w-full flex-wrap items-end gap-2 border-t border-neutral-200 pt-3">
                  <label className="block">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                      Or assign to a buyer
                    </span>
                    <select
                      value={assignOrg}
                      onChange={(e) => setAssignOrg(e.target.value)}
                      className="mt-1 rounded border border-neutral-300 px-2 py-1.5 text-[13px]"
                    >
                      <option value="">Choose…</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </label>

                  <select
                    value={assignStatus}
                    onChange={(e) => setAssignStatus(e.target.value)}
                    className="rounded border border-neutral-300 px-2 py-1.5 text-[13px]"
                  >
                    <option value="offered">Offered — others still see it</option>
                    <option value="exclusive">Exclusive — hidden from others</option>
                    <option value="reserved">Reserved — off the market</option>
                  </select>

                  <button
                    onClick={assign}
                    disabled={!assignOrg}
                    className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-700 ring-1 ring-neutral-300 disabled:opacity-40"
                  >
                    Assign
                  </button>

                  {assignMsg && (
                    <span className="text-[12px]" style={{ color: GREEN }}>{assignMsg}</span>
                  )}

                  <span className="w-full text-[11px] text-neutral-500">
                    Appears in their portal marked as theirs — no link needed.
                    They must have a login.
                  </span>
                </div>
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
        rooms={bundle.rooms}
        orgRows={bundle.orgRows}
        marketReport={preview ? marketReport : null}
        nearbyMarkets={preview ? nearbyMarkets : []}
        defaults={preview ? defaults : null}
        onModelChange={onModelChange}
      />
    </div>
  );
}

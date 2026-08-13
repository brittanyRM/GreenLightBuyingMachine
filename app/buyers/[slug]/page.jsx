"use client";

// A single property for a buyer: the club sheet plus the raise-hand
// panel. The sheet is built from list_price — the buyer's basis, not
// ours — and the investor-subscription panel is suppressed, since a
// firm buying the whole house does its own per-investor math.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BuyerNav, { useBuyer } from "../../../components/BuyerNav";
import ClubProForma from "../../../components/ClubProForma";
import { inputsFromDeal, applySavedInputs } from "../../../lib/proformaClubPresets";
import { usd, amortizedPayment, runClubProForma } from "../../../lib/proformaClub";

// Each tier prices at its own rate, so more equity buys both a smaller
// loan and a cheaper one. Figures are for this property using the same
// NOI the sheet above is built on — not a generic illustration.
function priceTiers(option, price, noi) {
  const tiers = Array.isArray(option.tiers) ? option.tiers : [];
  if (!tiers.length || !price) return [];

  const points = Number(option.points) || 0;
  const closingPct = Number(option.closing_cost_pct ?? 1) / 100;
  const term = Number(option.term_months) || 360;

  return tiers
    .slice()
    .sort((a, b) => Number(a.down_pct) - Number(b.down_pct))
    .map((t) => {
      const downPct = Number(t.down_pct) || 0;
      const rate = Number(t.rate_pct) || 0;
      const down = price * (downPct / 100);
      const loan = price - down;
      const origination = loan * (points / 100);
      const closing = price * closingPct;
      const cashToClose = down + origination + closing;
      const monthly = amortizedPayment(loan, rate, term);
      const annualDebt = monthly * 12;

      return {
        downPct, rate, down, loan, origination, closing, cashToClose,
        monthly,
        cashFlowMonthly: noi ? noi / 12 - monthly : null,
        cashOnCash: noi && cashToClose ? (noi - annualDebt) / cashToClose : null,
        dscr: annualDebt ? noi / annualDebt : null,
      };
    });
}

const GREEN = "#00A651";

export default function BuyerDeal({ params }) {
  const router = useRouter();
  const buyer = useBuyer();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("interested");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [financing, setFinancing] = useState(null);
  const [uploads, setUploads] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const loadUploads = () =>
    fetch(`/api/buyer/uploads?slug=${params.slug}`)
      .then((r) => r.json())
      .then((j) => setUploads(j.uploads || []))
      .catch(() => setUploads([]));

  async function uploadFile(file, kind) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slug", params.slug);
      fd.append("kind", kind);
      const res = await fetch("/api/buyer/uploads", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed.");
      loadUploads();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeUpload(id) {
    await fetch("/api/buyer/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadUploads();
  }

  // Lender introductions, revealed once they've engaged. Refetched
  // after raising a hand so the section appears without a reload.
  const loadFinancing = () =>
    fetch(`/api/buyer/financing?slug=${params.slug}`)
      .then((r) => r.json())
      .then(setFinancing)
      .catch(() => {});

  useEffect(() => {
    fetch(`/api/buyer/deals/${params.slug}`)
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/buyers/login");
          return null;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't load this property.");
        return j;
      })
      .then((j) => {
        if (!j) return;
        setData(j);
        loadFinancing();
        loadUploads();
      })
      .catch((e) => setError(e.message));
    // loadFinancing is stable for a given slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, router]);

  async function raiseHand() {
    setBusy(true);
    try {
      const res = await fetch("/api/buyer/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: params.slug,
          kind,
          offer_price: null,
          note: note || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong.");
      setDone(true);
      loadFinancing();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data)
    return <div className="p-10 font-sans text-sm text-red-700">{error}</div>;
  if (!data) return <div className="p-10 font-sans text-sm text-neutral-500">Loading…</div>;

  const inputs = applySavedInputs(
    inputsFromDeal({
      deal: data.deal,
      rooms: data.rooms,
      market: data.market,
      org: data.org,
    }),
    data.savedInputs,
    { audience: "buyer" }
  );

  const already = data.interest?.[0];

  // Year-1 NOI from the same engine and assumptions as the sheet, so
  // the tier table and the pro forma can't quote different cash flow.
  let noi = 0;
  try {
    noi = runClubProForma(inputs).base.years[0].noi;
  } catch {
    noi = 0;
  }

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      <BuyerNav buyer={buyer} />

      <ClubProForma
        initialInputs={inputs}
        backHref="/buyers"
        backLabel="All properties"
        audience="buyer"
        deal={data.deal}
        comps={data.comps || []}
        documents={data.documents || []}
        documents={data.documents || []}
        market={data.market}
        rooms={data.rooms}
        orgRows={data.org}
        marketReport={data.marketReport}
        defaults={data.defaults}
        allowAdjust
      />

      <div className="mx-auto max-w-4xl px-4 pb-12 sm:px-8">
        <div className="rounded border-2 bg-white p-5" style={{ borderColor: GREEN }}>
          {done || already ? (
            <div>
              <h2 className="text-[15px] font-bold text-neutral-900">
                {done ? "Thanks — we've got it." : "You've already been in touch on this one."}
              </h2>
              <p className="mt-1 text-[13px] text-neutral-600">
                {already && !done
                  ? `Logged ${new Date(already.created_at).toLocaleDateString()}${
                      already.offer_price ? ` — offer ${usd(already.offer_price)}` : ""
                    }. We'll follow up directly.`
                  : "Someone from Green Light Buying Machine will follow up shortly."}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-[15px] font-bold text-neutral-900">
                Interested in this property?
              </h2>
              <p className="mt-1 text-[13px] text-neutral-600">
                Let us know and we&rsquo;ll take it off general circulation while
                we talk.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { id: "interested", label: "Raise my hand" },
                  { id: "passed", label: "Pass on this one" },
                ].map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                      kind === k.id
                        ? "text-white"
                        : "bg-neutral-100 text-neutral-500 hover:text-neutral-900"
                    }`}
                    style={kind === k.id ? { backgroundColor: GREEN } : undefined}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Anything we should know
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-[13px] outline-none focus:border-[#00A651]"
                  placeholder="Timing, financing, diligence questions…"
                />
              </div>

              {error && <div className="mt-2 text-[12px] text-red-700">{error}</div>}

              <button
                onClick={raiseHand}
                disabled={busy}
                className="mt-4 rounded px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition disabled:opacity-50"
                style={{ backgroundColor: GREEN }}
              >
                {busy ? "Sending…" : "Send to Green Light"}
              </button>
            </>
          )}
        </div>

        {financing?.options?.length > 0 && (
          <div className="mt-4 rounded border-2 bg-white p-5" style={{ borderColor: GREEN }}>
            <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: GREEN }}>
              Included with the deal
            </div>
            <h2 className="mt-0.5 text-[17px] font-bold text-neutral-900">
              Financing already lined up
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-neutral-600">
              A lender who has funded co-living in this market and underwrites
              room-by-room income. You deal with them directly — Green Light
              Buying Machine takes no part in the loan and is paid nothing for
              the introduction.
            </p>

            <div className="mt-4 space-y-3">
              {financing.options.map((o) => (
                <div key={o.id} className="rounded-lg border border-neutral-200 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {o.contact_photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.contact_photo_url}
                        alt={o.contact_name || ""}
                        className="h-16 w-16 shrink-0 rounded-full object-cover"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-neutral-900">
                        {o.contact_name || o.label}
                      </div>
                      {o.lender_name && (
                        <div className="text-[12px] text-neutral-600">{o.lender_name}</div>
                      )}
                      {o.nmls && (
                        <div className="text-[11px] text-neutral-400">NMLS {o.nmls}</div>
                      )}

                      <div className="mt-1 flex flex-wrap gap-x-3 text-[12px]">
                        {o.contact_email && (
                          <a href={`mailto:${o.contact_email}`} className="underline underline-offset-2">
                            {o.contact_email}
                          </a>
                        )}
                        {o.contact_phone && (
                          <a href={`tel:${o.contact_phone.replace(/[^0-9+]/g, "")}`} className="text-neutral-600">
                            {o.contact_phone}
                          </a>
                        )}
                      </div>
                    </div>

                    {o.lender_logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.lender_logo_url} alt="" className="h-10 w-auto shrink-0" />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-3">
                    {[
                      o.max_ltv_pct != null && [`${o.max_ltv_pct}%`, "max LTV"],
                      o.rate_from_pct != null && [`${o.rate_from_pct}%`, "rate from"],
                      o.term_months != null && [`${Math.round(o.term_months / 12)} yr`, "term"],
                      o.points != null && [`${o.points}`, "points"],
                      o.min_dscr != null && [`${o.min_dscr}`, "min DSCR"],
                    ]
                      .filter(Boolean)
                      .map(([v, l]) => (
                        <div key={l}>
                          <div className="text-[17px] font-bold tabular-nums leading-tight text-neutral-900">
                            {v}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-neutral-400">{l}</div>
                        </div>
                      ))}
                  </div>

                  {priceTiers(o, Number(data.deal?.list_price), noi).length > 0 && (
                    <div className="mt-3 overflow-x-auto border-t border-neutral-100 pt-3">
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
                        Down payment options on this property
                      </div>
                      <table className="w-full min-w-[460px]">
                        <thead>
                          <tr className="border-b border-neutral-300 text-left">
                            <th className="py-1.5 text-[9px] font-bold uppercase tracking-wider text-neutral-500" />
                            {priceTiers(o, Number(data.deal?.list_price), noi).map((t) => (
                              <th
                                key={t.downPct}
                                className="py-1.5 text-right text-[12px] font-bold text-neutral-900"
                              >
                                {t.downPct}% down
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["Down payment", (t) => usd(t.down)],
                            ["Loan amount", (t) => usd(t.loan)],
                            ["Rate", (t) => `${t.rate.toFixed(3)}%`],
                            ["Origination", (t) => usd(t.origination)],
                            ["Closing costs", (t) => usd(t.closing)],
                            ["Total cash to close", (t) => usd(t.cashToClose), true],
                            ["Debt service / mo", (t) => `(${usd(t.monthly)})`],
                            ["Cash flow / mo", (t) => (t.cashFlowMonthly == null ? "—" : usd(t.cashFlowMonthly)), false, true],
                            ["Cash on cash", (t) => (t.cashOnCash == null ? "—" : `${(t.cashOnCash * 100).toFixed(1)}%`)],
                            ["DSCR", (t) => (t.dscr == null ? "—" : t.dscr.toFixed(2))],
                          ].map(([label, fn, bold, green]) => (
                            <tr
                              key={label}
                              className={bold ? "border-b-2 border-neutral-900" : "border-b border-neutral-100"}
                            >
                              <td className={`py-1.5 text-[12px] ${bold ? "font-bold text-neutral-900" : "text-neutral-700"}`}>
                                {label}
                              </td>
                              {priceTiers(o, Number(data.deal?.list_price), noi).map((t) => (
                                <td
                                  key={t.downPct}
                                  className={`py-1.5 text-right text-[12px] tabular-nums ${
                                    bold ? "font-bold text-neutral-900" : "text-neutral-800"
                                  }`}
                                  style={green ? { color: GREEN, fontWeight: 600 } : undefined}
                                >
                                  {fn(t)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(() => {
                        const ts = priceTiers(o, Number(data.deal?.list_price), noi);
                        if (!ts.length) return null;

                        // Which tier actually returns most on the cash put in.
                        // Computed rather than assumed — the answer is rarely
                        // the cheapest rate, because the last tier usually buys
                        // very little rate for a lot of equity.
                        const best = ts.reduce(
                          (a, b) => ((b.cashOnCash ?? -1) > (a.cashOnCash ?? -1) ? b : a),
                          ts[0]
                        );
                        const cheapest = ts.reduce((a, b) => (b.rate < a.rate ? b : a), ts[0]);
                        const lightest = ts.reduce((a, b) => (b.downPct < a.downPct ? b : a), ts[0]);
                        const strongest = ts.reduce(
                          (a, b) => ((b.dscr ?? 0) > (a.dscr ?? 0) ? b : a),
                          ts[0]
                        );

                        const meaning = (t) => {
                          if (t.downPct === lightest.downPct)
                            return "Least cash in, most leverage. The rate is highest here and coverage is thinnest, so it's the tier a lender scrutinises most.";
                          if (t.downPct === strongest.downPct)
                            return "Most cash in, strongest coverage, cheapest rate. Easiest to get written, and the safest if occupancy disappoints.";
                          return "The middle. Usually where the rate improvement is largest relative to the extra equity.";
                        };

                        return (
                          <div className="mt-3 border-t border-neutral-100 pt-3">
                            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
                              What each option means
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3">
                              {ts.map((t) => (
                                <div
                                  key={t.downPct}
                                  className="rounded-lg border px-3 py-2.5"
                                  style={{
                                    borderColor: t.downPct === best.downPct ? GREEN : "#E5E7EB",
                                    backgroundColor:
                                      t.downPct === best.downPct ? "#F2FAF5" : "white",
                                  }}
                                >
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-[13px] font-bold text-neutral-900">
                                      {t.downPct}% down
                                    </span>
                                    {t.downPct === best.downPct && (
                                      <span
                                        className="text-[8px] font-black uppercase tracking-wider"
                                        style={{ color: GREEN }}
                                      >
                                        Best return
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 text-[11px] tabular-nums text-neutral-600">
                                    {usd(t.cashToClose)} in ·{" "}
                                    {t.cashOnCash == null
                                      ? "—"
                                      : `${(t.cashOnCash * 100).toFixed(1)}% back`}
                                  </div>
                                  <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">
                                    {meaning(t)}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
                              <strong>The trade-off:</strong> more equity buys
                              both a smaller loan and a cheaper rate, so monthly
                              cash flow rises with every tier. Return on the cash
                              you put in does not — it peaks at{" "}
                              <strong>{best.downPct}% down</strong> here, because
                              the step from {lightest.downPct}% to{" "}
                              {best.downPct}% buys{" "}
                              {(lightest.rate - best.rate).toFixed(3)} points of
                              rate, while going further to{" "}
                              {cheapest.downPct}% buys only{" "}
                              {(best.rate - cheapest.rate).toFixed(3)}.
                              {strongest.dscr != null && (
                                <>
                                  {" "}
                                  Coverage runs from{" "}
                                  {lightest.dscr?.toFixed(2)} at{" "}
                                  {lightest.downPct}% to{" "}
                                  {strongest.dscr.toFixed(2)} at{" "}
                                  {strongest.downPct}%
                                  {lightest.dscr != null && lightest.dscr < 1.25
                                    ? " — the lowest tier sits close to where most lenders stop writing."
                                    : "."}
                                </>
                              )}
                            </p>

                            <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                              Same price and term throughout. Cash flow and
                              coverage use the net operating income from the
                              underwriting above.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {o.summary && (
                    <p className="mt-2 text-[12px] leading-snug text-neutral-600">{o.summary}</p>
                  )}

                  {o.states?.length > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Licensed in {o.states.join(", ")}.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {financing.moreAfterInterest && (
              <p className="mt-3 text-[12px] text-neutral-600">
                Further lender options are available once you&rsquo;ve raised
                your hand on this property.
              </p>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-neutral-500">
              Terms are indicative and subject to each lender&rsquo;s own
              underwriting. Nothing here is a commitment to lend or an offer of
              credit. Equal Housing Lender.
            </p>
          </div>
        )}

        <div className="mt-4 rounded border border-neutral-200 bg-white p-5">
          <h2 className="text-[15px] font-bold text-neutral-900">Your documents</h2>
          <p className="mt-1 text-[13px] leading-snug text-neutral-600">
            Your own comps, market pulls or notes on this property. Only your
            team can see them, and nothing here changes the underwriting above —
            it&rsquo;s a place to keep your working papers with the deal.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {[
              ["comps", "Comps"],
              ["market", "Market data"],
              ["other", "Other"],
            ].map(([kind, label]) => (
              <label
                key={kind}
                className="cursor-pointer rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-700 ring-1 ring-neutral-300 hover:text-neutral-900"
              >
                + {label}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.csv"
                  className="hidden"
                  onChange={(e) => {
                    uploadFile(e.target.files?.[0], kind);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
            {uploading && <span className="text-[12px] text-neutral-500">Uploading…</span>}
            {uploadError && (
              <span className="text-[12px] text-red-700">{uploadError}</span>
            )}
            <span className="text-[11px] text-neutral-400">
              PDF, PNG, JPEG or CSV · up to 15 MB
            </span>
          </div>

          {uploads?.length > 0 && (
            <div className="mt-4">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 border-b border-neutral-100 py-2 last:border-b-0"
                >
                  <span className="text-[14px] text-neutral-400">▤</span>
                  <a
                    href={u.public_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[13px] text-neutral-900 underline-offset-2 hover:underline"
                  >
                    {u.label || "Document"}
                  </a>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    {u.kind}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => removeUpload(u.id)}
                    className="text-[11px] text-neutral-500 underline underline-offset-2 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {financing?.locked && (
          <div className="mt-4 rounded border border-dashed border-neutral-300 bg-white px-5 py-4 text-[13px] text-neutral-600">
            <strong className="text-neutral-900">Financing options</strong> —
            raise your hand above and we&rsquo;ll introduce you to lenders who
            fund this asset class.
          </div>
        )}
      </div>
    </div>
  );
}

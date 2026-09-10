"use client";

// ============================================================
// /financing/[slug] — gap funding and the loan checklist.
//
// The first lender advances a share of purchase and rehab; this works
// out what the borrower still has to bring, which is what the second
// deed of trust funds.
//
// Reconciled against Brian's worked example. His written formula gives
// $73K on the 323,000 / 130,000 deal; the note was actually written at
// $80,000 — the difference is the doc fee and the interest owed from
// closing to the first of the month, both of which are included here.
//
// Never buyer-facing. deal_financing has no anon policy.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/queries";
import { LoanApplication, PromissoryNote } from "../../../components/LoanDocs";
import { ClosingStatement, defaultClosingLines } from "../../../components/ClosingStatement";
import { PayoffTable, SourcesUses, TitleEmail } from "../../../components/FinancingDocs";
import {
  GAP_DEFAULTS,
  LOAN_STEPS,
  computeGapFunding,
  gapFundingRows,
  payoffSchedule,
  sourcesAndUses,
  titleEmail,
} from "../../../lib/gapFunding";

const GREEN = "#00A651";
const usd = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";

function Field({ label, hint, wide, ...props }) {
  return (
    <label className={wide ? "col-span-2 block" : "block"}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </span>
      <input
        {...props}
        className="mt-1 w-full rounded border border-neutral-300 px-2.5 py-2 text-[13px] outline-none focus:border-[#00A651]"
      />
      {hint && <span className="mt-0.5 block text-[10px] text-neutral-400">{hint}</span>}
    </label>
  );
}

function Row({ label, value, note, tone }) {
  return (
    <div
      className={`grid grid-cols-[1fr_7rem] items-start gap-3 py-1.5 ${
        tone === "total" ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"
      }`}
    >
      <div className={`text-[13px] leading-5 ${tone === "total" ? "font-bold" : "text-neutral-700"}`}>
        {label}
        {note && <span className="ml-1.5 text-[10px] text-neutral-400">{note}</span>}
      </div>
      <div
        className={`text-right text-[13px] leading-5 tabular-nums ${
          tone === "total" ? "font-bold text-neutral-900" : "text-neutral-800"
        }`}
      >
        {usd(value)}
      </div>
    </div>
  );
}

export default function FinancingPage({ params }) {
  const [deal, setDeal] = useState(null);
  const [row, setRow] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [doc, setDoc] = useState(null);
  // Closing-statement lines. Seeded from the deal and the worksheet the
  // first time the statement is opened, then edited freely — the
  // defaults are a starting point, not an answer.
  const [closingLines, setClosingLines] = useState(null);
  const [closingMeta, setClosingMeta] = useState({
    buyer: "",
    seller: "",
    lender: "",
    escrowAgent: "",
    escrowNumber: "",
    closing: "",
    disbursement: "",
  }); // null | "app" | "note"

  useEffect(() => {
    (async () => {
      try {
        const { data: d, error: de } = await supabase
          .from("deals")
          .select("id, slug, address_line, city, state, zip, purchase_price, rehab_budget")
          .eq("slug", params.slug)
          .single();
        if (de) throw de;
        setDeal(d);

        const { data: f } = await supabase
          .from("deal_financing")
          .select("*")
          .eq("deal_id", d.id)
          .maybeSingle();

        setRow(f || null);
        setForm({
          purchasePrice: d.purchase_price ?? "",
          rehabBudget: d.rehab_budget ?? "",
          ltcPct: (f?.ltc_pct ?? GAP_DEFAULTS.ltcPct) * 100,
          ratePct: f?.rate_pct ?? GAP_DEFAULTS.ratePct,
          docFee: f?.doc_fee ?? GAP_DEFAULTS.docFee,
          earnestMoney: f?.earnest_money ?? GAP_DEFAULTS.earnestMoney,
          estClosingCosts: f?.est_closing_costs ?? GAP_DEFAULTS.estClosingCosts,
          prepaidMonths: f?.prepaid_months ?? GAP_DEFAULTS.prepaidMonths,
          closingDate: f?.closing_date ?? "",
          includeStub: f?.include_stub ?? true,
          roundUpTo: f?.round_up_to ?? GAP_DEFAULTS.roundUpTo,
          borrowerEntity: f?.borrower_entity ?? "",
          signerName: f?.signer_name ?? "",
          lenderName: f?.lender_name ?? "",
          titleCompany: f?.title_company ?? "",
          titleContact: f?.title_contact ?? "",
          titleEmail: f?.title_email ?? "",
          insuranceAgent: f?.insurance_agent ?? "",
          titlePhone: f?.title_phone ?? "",
          lenderAddress: f?.lender_address ?? "",
          noteRatePct: f?.note_rate_pct ?? 25,
          noteMaturity: f?.note_maturity ?? "",
          signerTitle: f?.signer_title ?? "Member",
          borrowerEmail: "",
          steps: f?.steps ?? {},
        });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [params.slug]);

  const result = useMemo(() => {
    if (!form) return null;
    return computeGapFunding({
      purchasePrice: Number(form.purchasePrice) || 0,
      rehabBudget: Number(form.rehabBudget) || 0,
      ltcPct: (Number(form.ltcPct) || 0) / 100,
      ratePct: Number(form.ratePct) || 0,
      docFee: Number(form.docFee) || 0,
      earnestMoney: Number(form.earnestMoney) || 0,
      estClosingCosts: Number(form.estClosingCosts) || 0,
      prepaidMonths: Number(form.prepaidMonths) || 0,
      includeStubInterest: !!form.includeStub,
      closingDate: form.closingDate || null,
      roundUpTo: Number(form.roundUpTo) || 0,
    });
  }, [form]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const toggleStep = useCallback((id) => {
    setForm((f) => {
      const cur = f.steps?.[id]?.done;
      return {
        ...f,
        steps: { ...f.steps, [id]: cur ? { done: false } : { done: true, at: new Date().toISOString() } },
      };
    });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        deal_id: deal.id,
        ltc_pct: (Number(form.ltcPct) || 0) / 100,
        rate_pct: Number(form.ratePct) || 0,
        doc_fee: Number(form.docFee) || 0,
        earnest_money: Number(form.earnestMoney) || 0,
        est_closing_costs: Number(form.estClosingCosts) || 0,
        prepaid_months: Number(form.prepaidMonths) || 0,
        include_stub: !!form.includeStub,
        closing_date: form.closingDate || null,
        round_up_to: Number(form.roundUpTo) || 0,
        note_amount: result?.recommendedNote ?? null,
        borrower_entity: form.borrowerEntity || null,
        signer_name: form.signerName || null,
        lender_name: form.lenderName || null,
        title_company: form.titleCompany || null,
        title_contact: form.titleContact || null,
        title_email: form.titleEmail || null,
        insurance_agent: form.insuranceAgent || null,
        title_phone: form.titlePhone || null,
        lender_address: form.lenderAddress || null,
        note_rate_pct: Number(form.noteRatePct) || null,
        note_maturity: form.noteMaturity || null,
        signer_title: form.signerTitle || null,
        steps: form.steps || {},
      };

      const q = row
        ? supabase.from("deal_financing").update(payload).eq("id", row.id)
        : supabase.from("deal_financing").insert(payload);

      const { data, error: se } = await q.select().single();
      if (se) throw se;
      setRow(data);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !form)
    return <div className="p-8 font-sans text-sm text-red-700">{error}</div>;
  if (!form || !result)
    return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  const doneCount = LOAN_STEPS.filter((s) => form.steps?.[s.id]?.done).length;

  if (doc) {
    return (
      <div className="bg-neutral-100 p-4 font-sans sm:p-8">
        <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-3">
          <button
            onClick={() => setDoc(null)}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            ← Back to financing
          </button>
          <button
            onClick={() => setDoc(doc === "app" ? "note" : "app")}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            {doc === "app" ? "Promissory note →" : "Loan application →"}
          </button>
          <button
            onClick={() => {
              if (!closingLines) {
                setClosingLines(defaultClosingLines({ deal, form, result }));
              }
              setDoc("closing");
            }}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            Closing statement →
          </button>
          <button
            onClick={() => setDoc("payoff")}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            Payoff →
          </button>
          <button
            onClick={() => setDoc("sources")}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            Sources &amp; uses →
          </button>
          <button
            onClick={() => setDoc("email")}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            Email title →
          </button>
          <button
            onClick={() => {
              if (!closingLines) setClosingLines(defaultClosingLines({ deal, form, result }));
              setDoc("bundle");
            }}
            className="rounded border border-neutral-900 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-900"
          >
            Full package
          </button>
          <button
            onClick={() => window.print()}
            className="ml-auto rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            Print / Save PDF
          </button>
        </div>

        <div className="mx-auto max-w-3xl shadow-xl">
          {doc === "app" && (
            <LoanApplication
              deal={deal}
              form={form}
              result={result}
              lender={form.firstLenderName || "Sound Capital LLC"}
            />
          )}
          {doc === "note" && <PromissoryNote deal={deal} form={form} result={result} />}
          {doc === "payoff" && <PayoffTable form={form} result={result} deal={deal} />}
          {doc === "sources" && <SourcesUses form={form} result={result} deal={deal} />}
          {doc === "email" && (
            <TitleEmail deal={deal} form={form} result={result} meta={closingMeta} />
          )}

          {/* Every document in one print. Browsers make one PDF of a
              page, so the bundle is a page rather than a stitched file
              — each document forces a page break and prints as it does
              on its own. Save it, and it can be uploaded to the deal's
              documents and attached to an email like any other file. */}
          {doc === "bundle" && (
            <div>
              <div className="no-print border-b-2 border-neutral-900 bg-white px-6 py-4">
                <div className="text-[13px] font-bold">Full financing package</div>
                <p className="mt-0.5 text-[12px] text-neutral-600">
                  Loan application, promissory note, sources and uses, payoff
                  schedule and the estimated closing statement, in that order.
                  Print or save as PDF — one file, five documents.
                </p>
              </div>
              <div className="print-page">
                <LoanApplication
                  deal={deal}
                  form={form}
                  result={result}
                  lender={form.firstLenderName || "Sound Capital LLC"}
                />
              </div>
              <div className="print-page">
                <PromissoryNote deal={deal} form={form} result={result} />
              </div>
              <div className="print-page">
                <SourcesUses deal={deal} form={form} result={result} />
              </div>
              <div className="print-page">
                <PayoffTable deal={deal} form={form} result={result} />
              </div>
              <div className="print-page">
                <ClosingStatement
                  deal={deal}
                  form={form}
                  result={result}
                  lines={closingLines || []}
                  meta={{ ...closingMeta, closing: closingMeta.closing || form.closingDate }}
                />
              </div>
            </div>
          )}
          {doc === "closing" && (
            <>
              <div className="no-print border-b-2 border-neutral-900 bg-white px-6 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  Parties &amp; escrow
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    ["buyer", "Buyer (entity + address)"],
                    ["seller", "Seller"],
                    ["lender", "Lender"],
                    ["escrowAgent", "Escrow / title agency"],
                    ["escrowNumber", "Escrow number"],
                    ["disbursement", "Disbursement date"],
                  ].map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                        {label}
                      </span>
                      <input
                        value={closingMeta[k] || ""}
                        onChange={(e) =>
                          setClosingMeta((m) => ({ ...m, [k]: e.target.value }))
                        }
                        className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1 text-[12px]"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                    Charges
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setClosingLines((l) => [
                          ...(l || []),
                          { section: "Miscellaneous Charges", label: "" },
                        ])
                      }
                      className="rounded border border-neutral-300 px-2 py-1 text-[11px] font-semibold"
                    >
                      Add a line
                    </button>
                    <button
                      onClick={() =>
                        setClosingLines(defaultClosingLines({ deal, form, result }))
                      }
                      className="rounded border border-neutral-300 px-2 py-1 text-[11px] font-semibold"
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>

                <div className="mt-2 max-h-80 overflow-y-auto rounded border border-neutral-200">
                  <table className="w-full text-[11.5px]">
                    <thead className="sticky top-0 bg-neutral-900 text-white">
                      <tr>
                        <th className="px-2 py-1 text-left font-semibold">Section</th>
                        <th className="px-2 py-1 text-left font-semibold">Charge</th>
                        <th className="px-2 py-1 text-right font-semibold">Buyer debit</th>
                        <th className="px-2 py-1 text-right font-semibold">Buyer credit</th>
                        <th className="px-2 py-1 text-right font-semibold">Seller debit</th>
                        <th className="px-2 py-1 text-right font-semibold">Seller credit</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(closingLines || []).map((row, i) => {
                        const upd = (k, v) =>
                          setClosingLines((l) =>
                            l.map((r, j) =>
                              j === i
                                ? { ...r, [k]: k === "label" || k === "section" ? v : Number(v) || 0 }
                                : r
                            )
                          );
                        return (
                          <tr key={i} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                            <td className="px-1 py-0.5">
                              <select
                                value={row.section || "Primary Charges & Credits"}
                                onChange={(e) => upd("section", e.target.value)}
                                className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[11px]"
                              >
                                {[
                                  "Primary Charges & Credits",
                                  "Loan Charges",
                                  "Title Charges",
                                  "Escrow Charges",
                                  "Miscellaneous Charges",
                                ].map((sname) => (
                                  <option key={sname} value={sname}>
                                    {sname}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-0.5">
                              <input
                                value={row.label || ""}
                                onChange={(e) => upd("label", e.target.value)}
                                className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[11px]"
                              />
                            </td>
                            {["buyerDebit", "buyerCredit", "sellerDebit", "sellerCredit"].map((k) => (
                              <td key={k} className="px-1 py-0.5">
                                <input
                                  value={row[k] || ""}
                                  onChange={(e) => upd(k, e.target.value)}
                                  inputMode="decimal"
                                  className="w-24 rounded border border-neutral-200 px-1 py-0.5 text-right text-[11px] tabular-nums"
                                />
                              </td>
                            ))}
                            <td className="px-1 py-0.5 text-right">
                              <button
                                onClick={() =>
                                  setClosingLines((l) => l.filter((_, j) => j !== i))
                                }
                                className="text-[11px] text-neutral-400 hover:text-red-700"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10.5px] text-neutral-500">
                  Defaults are standard Arizona charges taken from a Magnus Title
                  statement. Title sets the real figures — edit these to match
                  the estimate they send.
                </p>
              </div>

            <ClosingStatement
              deal={deal}
              form={form}
              result={result}
              lines={closingLines || []}
              meta={{ ...closingMeta, closing: closingMeta.closing || form.closingDate }}
            />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 font-sans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            Financing
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">{deal.address_line}</h1>
          <p className="text-[13px] text-neutral-600">
            {deal.city}, {deal.state} {deal.zip}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/deals/${deal.slug}`}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            ← Deal
          </a>
          <button
            onClick={save}
            disabled={saving}
            className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="mt-4 text-[12px]" style={{ color: GREEN }}>
          Saved {savedAt.toLocaleTimeString()}.
        </div>
      )}

      {/* Headline */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "1st position", value: usd(result.firstLoan), sub: `${form.ltcPct}% of cost` },
          { label: "Cash to close", value: usd(result.cashToClose), sub: "before interest" },
          { label: "Total need", value: usd(result.totalNeed), sub: "including prepaids" },
          {
            label: "2nd note",
            value: usd(result.recommendedNote),
            sub: `${usd(result.cushion)} cushion`,
            hero: true,
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: c.hero ? GREEN : "#E5E7EB",
              backgroundColor: c.hero ? "#F2FAF5" : "white",
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              {c.label}
            </div>
            <div className="text-[21px] font-bold tabular-nums leading-tight text-neutral-900">
              {c.value}
            </div>
            <div className="text-[10px] text-neutral-500">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Terms */}
        <section className="rounded border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
            Terms
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase price" inputMode="decimal" value={form.purchasePrice} onChange={set("purchasePrice")} />
            <Field label="Rehab budget" inputMode="decimal" value={form.rehabBudget} onChange={set("rehabBudget")} />
            <Field label="1st lender advances %" inputMode="decimal" value={form.ltcPct} onChange={set("ltcPct")} hint="of purchase and rehab" />
            <Field label="Rate %" inputMode="decimal" value={form.ratePct} onChange={set("ratePct")} hint="annual, 360-day basis" />
            <Field label="Doc fee" inputMode="decimal" value={form.docFee} onChange={set("docFee")} />
            <Field label="Earnest money" inputMode="decimal" value={form.earnestMoney} onChange={set("earnestMoney")} />
            <Field label="Est. closing costs" inputMode="decimal" value={form.estClosingCosts} onChange={set("estClosingCosts")} />
            <Field label="Prepaid months" inputMode="decimal" value={form.prepaidMonths} onChange={set("prepaidMonths")} hint="30 days each" />
            <Field label="Closing date" type="date" value={form.closingDate} onChange={set("closingDate")} />
            <Field label="Round note up to" inputMode="decimal" value={form.roundUpTo} onChange={set("roundUpTo")} />
          </div>

          <label className="mt-3 flex items-center gap-2 text-[12px] text-neutral-700">
            <input type="checkbox" checked={form.includeStub} onChange={set("includeStub")} />
            Include interest from closing to the 1st
            {result.stubDays > 0 && (
              <span className="text-neutral-500">
                — {result.stubDays} days, {usd(result.stubInterest)}
              </span>
            )}
          </label>
        </section>

        {/* Breakdown */}
        <section className="rounded border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
            What the borrower brings
          </h2>
          {gapFundingRows(result).map((r) => (
            <Row key={r.label} label={r.label} value={r.value} note={r.note} />
          ))}
          <Row label="Total need" value={result.totalNeed} tone="total" />
          <Row label="Note, rounded" value={result.recommendedNote} tone="total" />

          <p className="mt-3 text-[11px] leading-snug text-neutral-500">
            Interest is calculated on the full first-position balance —{" "}
            {usd(result.firstLoan)} at {form.ratePct}% is{" "}
            <strong>{usd(result.dailyInterest)}</strong> a day on a 360-day
            basis. Lenders charge on the committed amount, not on draws taken.
          </p>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            Combined against total project cost: {(result.combinedLtc * 100).toFixed(1)}%.
            {result.combinedLtc > 1 &&
              " Above 100% — the two loans exceed purchase plus rehab, which means fees and prepaids are being financed."}
          </p>
        </section>

        {/* Steps */}
        <section className="rounded border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">
              Loan steps
            </h2>
            <span className="text-[11px] text-neutral-500">
              {doneCount} of {LOAN_STEPS.length}
            </span>
          </div>

          {LOAN_STEPS.map((s, i) => {
            const done = !!form.steps?.[s.id]?.done;
            return (
              <button
                key={s.id}
                onClick={() => toggleStep(s.id)}
                className="flex w-full gap-3 border-b border-neutral-100 py-2.5 text-left last:border-b-0"
              >
                <span
                  className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: done ? GREEN : "#D4D4D4" }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-semibold ${
                      done ? "text-neutral-400 line-through" : "text-neutral-900"
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-neutral-500">
                    {s.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        {/* Parties */}
        <section className="rounded border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-900">
            Parties
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Borrower entity" value={form.borrowerEntity} onChange={set("borrowerEntity")} placeholder="MC Prop 150 LLC" />
            <Field label="Signer" value={form.signerName} onChange={set("signerName")} />
            <Field label="2nd lender" value={form.lenderName} onChange={set("lenderName")} wide />
            <Field label="Title company" value={form.titleCompany} onChange={set("titleCompany")} />
            <Field label="Title contact" value={form.titleContact} onChange={set("titleContact")} />
            <Field label="Title email" value={form.titleEmail} onChange={set("titleEmail")} />
            <Field label="Insurance agent" value={form.insuranceAgent} onChange={set("insuranceAgent")} />
            <Field label="Title phone" value={form.titlePhone} onChange={set("titlePhone")} />
            <Field label="2nd lender address" value={form.lenderAddress} onChange={set("lenderAddress")} wide />
            <Field label="Note rate %" inputMode="decimal" value={form.noteRatePct} onChange={set("noteRatePct")} />
            <Field label="Note maturity" type="date" value={form.noteMaturity} onChange={set("noteMaturity")} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
            <button
              onClick={() => setDoc("app")}
              className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: GREEN }}
            >
              Loan application
            </button>
            <button
              onClick={() => setDoc("note")}
              className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-700 ring-1 ring-neutral-300"
            >
              Promissory note
            </button>
            <span className="w-full text-[11px] text-neutral-500">
              Both carry a confidential band and are never reachable from a
              buyer link. Save your changes first — documents render from what
              is on screen.
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-neutral-500">
            Title needs the loan details and the insurance agent before they can
            prepare the settlement statement — that&rsquo;s the last step, and
            the one that holds up closing when it&rsquo;s missed.
          </p>
        </section>
      </div>
    </div>
  );
}

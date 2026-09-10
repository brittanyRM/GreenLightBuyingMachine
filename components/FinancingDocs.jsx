"use client";

// ============================================================
// Three more financing documents.
//
// CONFIDENTIAL, like the rest of /financing/[slug] — acquisition cost,
// lender terms and payoff figures. No buyer route imports this file.
// ============================================================

import { useState } from "react";
import { payoffSchedule, sourcesAndUses, titleEmail, pointsComparison } from "../lib/gapFunding";

const INK = "#141914";
const GREEN = "#00A651";

const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

// Prints, deliberately. A confidential marking that disappears when
// the page becomes a PDF is marking the one copy nobody can forward.
function Band({ note }) {
  return (
    <div
      className="print-keep mb-4 flex items-center gap-2 rounded px-4 py-2"
      style={{ backgroundColor: INK }}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
        Confidential — not for buyer distribution
      </span>
      <span className="text-[10px] text-neutral-400">{note}</span>
    </div>
  );
}

// ---------- payoff at exit ----------

export function PayoffTable({ deal, form, result }) {
  const [extensionFee, setExtensionFee] = useState(0);
  const rows = payoffSchedule(result, { months: 12, extensionFee: Number(extensionFee) || 0 });
  const carry = Number(result?.dailyInterest || 0) * 30;
  const freeMonths = Math.floor((Number(result?.prepaidDays) || 0) / 30);

  return (
    <div className="print-doc print-section bg-white p-6 text-neutral-900 sm:p-10">
      <Band note="Payoff figures — lender and internal use only" />

      <div className="text-[15px] font-bold">Payoff at exit</div>
      <div className="mt-0.5 text-[11px] text-neutral-600">
        {deal?.address_line} · {usd(result?.firstLoan)} at {form?.ratePct}% ·
        interest simple, 360-day basis
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Principal", usd(result?.firstLoan)],
          ["Monthly carry", usd(carry)],
          ["Prepaid covers", `${freeMonths} month${freeMonths === 1 ? "" : "s"}`],
          ["Daily", usd(result?.dailyInterest)],
        ].map(([k, v]) => (
          <div key={k} className="rounded border border-neutral-300 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">{k}</div>
            <div className="text-[16px] font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <label className="no-print mt-4 flex items-center gap-2 text-[12px] text-neutral-700">
        Extension fee, charged each 3 months past month 6:
        <span className="flex items-center rounded border border-neutral-300 px-2 py-1">
          <span className="mr-1 text-neutral-400">$</span>
          <input
            value={extensionFee}
            onChange={(e) => setExtensionFee(e.target.value)}
            inputMode="decimal"
            className="w-24 text-[12px] tabular-nums outline-none"
          />
        </span>
      </label>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-neutral-900 text-[9px] uppercase tracking-wider text-neutral-600">
            <th className="px-2 py-1 text-left font-bold">Month</th>
            <th className="px-2 py-1 text-right font-bold">Unpaid days</th>
            <th className="px-2 py-1 text-right font-bold">Accrued interest</th>
            <th className="px-2 py-1 text-right font-bold">Extensions</th>
            <th className="px-2 py-1 text-right font-bold">Payoff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.month}
              className={`print-keep border-b border-neutral-100 ${
                r.unpaidDays === 0 ? "text-neutral-500" : ""
              }`}
            >
              <td className="px-2 py-1 font-semibold">{r.month}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.unpaidDays}</td>
              <td className="px-2 py-1 text-right tabular-nums">{usd(r.accrued)}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {r.extensions ? usd(r.extensions) : ""}
              </td>
              <td className="px-2 py-1 text-right font-bold tabular-nums">{usd(r.payoff)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-600">
        The greyed months are covered by the prepaid interest paid at closing —
        no payment is due and the payoff does not move. From month{" "}
        {freeMonths + 1} the loan costs {usd(carry)} a month whether or not the
        house has sold.
      </p>
      <p className="mt-1 text-[9.5px] leading-relaxed text-neutral-500">
        An estimate. Interest is calculated simple on the committed balance at
        the stated rate over a 360-day year, which is the convention these
        lenders use. The payoff demand from the lender governs.
      </p>

      <PointsBlock result={result} />
    </div>
  );
}

// ---------- points or no points ----------
//
// Sound Capital price this two ways and which is cheaper depends only
// on how long the house is held. It was being decided from memory,
// against a crossover that moves with the loan size.
function PointsBlock({ result }) {
  const pc = pointsComparison(result);
  if (!pc.rows.length) return null;

  return (
    <div className="print-keep mt-8">
      <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
        Points or no points
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-600">
        17% with no points against 12% with two points. Two points on{" "}
        {usd(result?.firstLoan)} costs {usd(pc.pointsCost)} at the table, so
        paying it only makes sense if the house is held long enough for the
        cheaper rate to earn it back — which happens in{" "}
        <strong>month {pc.breakEvenMonths}</strong>.
      </p>
      <table className="mt-2 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b-2 border-neutral-900 text-[9px] uppercase tracking-wider text-neutral-600">
            <th className="px-2 py-1 text-left font-bold">Month</th>
            <th className="px-2 py-1 text-right font-bold">17%, no points</th>
            <th className="px-2 py-1 text-right font-bold">12% + 2 points</th>
            <th className="px-2 py-1 text-right font-bold">Difference</th>
          </tr>
        </thead>
        <tbody>
          {pc.rows.slice(0, 9).map((r) => (
            <tr
              key={r.month}
              className={`print-keep border-b border-neutral-100 ${
                r.month === pc.breakEvenMonths ? "font-bold" : ""
              }`}
            >
              <td className="px-2 py-1">{r.month}</td>
              <td className="px-2 py-1 text-right tabular-nums">{usd(r.noPoints)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{usd(r.withPoints)}</td>
              <td
                className="px-2 py-1 text-right tabular-nums"
                style={{ color: r.saving >= 0 ? GREEN : "#B91C1C" }}
              >
                {r.saving >= 0 ? "+" : ""}
                {usd(r.saving)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-neutral-500">
        Green means points are the cheaper of the two by that month. A flip that
        slips past month {pc.breakEvenMonths} would have been better off with
        them.
      </p>
    </div>
  );
}

// ---------- sources and uses ----------

export function SourcesUses({ deal, form, result }) {
  const su = sourcesAndUses(result, {
    purchasePrice: Number(form?.purchasePrice) || 0,
    rehabBudget: Number(form?.rehabBudget) || 0,
    earnestMoney: Number(form?.earnestMoney) || 0,
    ltcPct: (Number(form?.ltcPct) || 90) / 100,
  });

  const Col = ({ title, rows, total }) => (
    <div>
      <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
        {title}
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="print-keep flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1.5"
        >
          <span className="text-[12px]">
            {r.label}
            {r.note && (
              <span className="block text-[10px] text-neutral-500">{r.note}</span>
            )}
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums">
            {usd(r.value)}
          </span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t-2 border-neutral-900 pt-1.5">
        <span className="text-[12px] font-bold uppercase tracking-wider">Total</span>
        <span className="text-[15px] font-bold tabular-nums">{usd(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="print-doc print-section bg-white p-6 text-neutral-900 sm:p-10">
      <Band note="Sources and uses — lender and internal use only" />

      <div className="text-[15px] font-bold">Sources and uses</div>
      <div className="mt-0.5 text-[11px] text-neutral-600">{deal?.address_line}</div>

      <div className="mt-5 grid gap-8 sm:grid-cols-2">
        <Col title="Sources" rows={su.sources} total={su.totalSources} />
        <Col title="Uses" rows={su.uses} total={su.totalUses} />
      </div>

      <div
        className="print-keep mt-5 rounded border-2 px-4 py-3"
        style={{
          borderColor: su.difference === 0 ? GREEN : "#B91C1C",
          backgroundColor: su.difference === 0 ? "#F2FAF5" : "#FEF2F2",
        }}
      >
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500">
          {su.difference === 0 ? "Balanced" : "Out of balance"}
        </div>
        <div className="text-[16px] font-bold tabular-nums">
          {su.difference === 0 ? "Sources equal uses" : usd(su.difference)}
        </div>
        {su.difference !== 0 && (
          <div className="mt-1 text-[11px] text-red-900">
            Sources and uses should agree exactly. A difference means a figure on
            the worksheet has gone astray — check it before this goes to a lender.
          </div>
        )}
      </div>

      <p className="mt-3 text-[9.5px] leading-relaxed text-neutral-500">
        Derived from the gap-funding worksheet rather than recalculated, so these
        figures cannot disagree with it. The earnest deposit appears under uses
        because it is already in escrow and is credited back to the buyer at the
        table — it is not a second source of funds.
      </p>
    </div>
  );
}

// ---------- the email to title ----------

export function TitleEmail({ deal, form, result, meta = {} }) {
  // The people Brian names on the call: title leads, and everyone who
  // has to act is copied so nobody is waiting on a forward.
  const [extra, setExtra] = useState({
    titleAgent: meta.escrowOfficer || "",
    firstLenderContact: "",
    secondLender: "",
    secondLenderContact: "",
    insuranceAgent: "",
  });
  const [copied, setCopied] = useState(false);

  const { subject, body, to, cc } = titleEmail({
    deal,
    form,
    result,
    meta: { ...meta, ...extra },
  });

  const field =
    "w-full rounded border border-neutral-300 px-2 py-1 text-[12px] outline-none focus:border-neutral-500";

  return (
    <div className="print-doc bg-white p-6 text-neutral-900 sm:p-10">
      <div className="no-print">
        <Band note="Contains loan terms — send to escrow and the lender only" />

        <div className="text-[15px] font-bold">Email title</div>
        <p className="mt-0.5 text-[12px] text-neutral-600">
          Step five: send escrow the loan details and the insurance agent so they
          can prepare the statement. Everything here comes from the deal — fill
          the gaps below and copy it.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ["titleAgent", "Title agent — the recipient"],
            ["firstLenderContact", "Hard money contact (cc)"],
            ["secondLender", "Second lender entity"],
            ["secondLenderContact", "Second lender contact (cc)"],
            ["insuranceAgent", "Insurance agent (cc)"],
          ].map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                {label}
              </span>
              <input
                value={extra[k]}
                onChange={(e) => setExtra((x) => ({ ...x, [k]: e.target.value }))}
                className={field}
              />
            </label>
          ))}
        </div>

        {(subject || body) && (
          <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px]">
            <div>
              <strong>To:</strong> {(to || []).join(", ") || "the title agent"}
            </div>
            <div className="mt-0.5">
              <strong>Cc:</strong> {(cc || []).join(", ")}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`);
              setCopied(true);
            }}
            className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            {copied ? "Copied" : "Copy email"}
          </button>
          <a
            href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
          >
            Open in mail →
          </a>
        </div>
      </div>

      <div className="mt-4 rounded border border-neutral-300">
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px]">
          <strong>Subject:</strong> {subject}
        </div>
        <pre className="whitespace-pre-wrap px-3 py-3 font-sans text-[12px] leading-relaxed">
          {body}
        </pre>
      </div>
    </div>
  );
}

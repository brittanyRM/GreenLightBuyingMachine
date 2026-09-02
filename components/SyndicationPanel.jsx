"use client";

// ============================================================
// The syndication view.
//
// Shown only to firms that have it enabled. A syndicator raises other
// people's money against the deal, so the questions are different from
// a buyer's: how much has to be raised (more than the cash to close),
// what the investor nets after the pref and the promote (less than the
// project makes), and how far occupancy can fall before the debt is at
// risk (much further than people expect, room-by-room).
//
// Every figure is derived from the same cash flows the rest of the
// sheet renders. Nothing here recomputes NOI or debt service.
// ============================================================

import { useMemo, useState } from "react";
import {
  sourcesAndUses,
  waterfall,
  breakEven,
  portfolioDrag,
} from "../lib/syndication";

const GREEN = "#00A651";
const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
const pct = (n, d = 1) => (Number.isFinite(Number(n)) ? `${(Number(n) * 100).toFixed(d)}%` : "—");

function Title({ kicker, children }) {
  return (
    <div className="print-keep mb-3">
      {kicker && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          {kicker}
        </div>
      )}
      <h3 className="text-[15px] font-bold text-neutral-900">{children}</h3>
    </div>
  );
}

function Row({ label, value, tone = "normal", note }) {
  const styles = {
    normal: "text-neutral-800",
    minus: "text-neutral-600",
    total: "font-bold text-neutral-900",
  };
  return (
    <div
      className={`print-keep grid grid-cols-[1fr_7rem] items-start gap-x-3 py-1.5 ${
        tone === "total" ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"
      }`}
    >
      <div className={`text-[13px] leading-5 ${styles[tone]}`}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>}
      </div>
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>{value}</div>
    </div>
  );
}

function NumberInput({ label, value, onChange, suffix, step = 1, min = 0 }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className="mt-1 flex items-center rounded border border-neutral-300 bg-white px-2 py-1.5">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full text-[13px] tabular-nums outline-none"
        />
        {suffix && <span className="ml-1 text-[11px] text-neutral-400">{suffix}</span>}
      </span>
    </label>
  );
}

export default function SyndicationPanel({
  price,
  loan,
  cashToClose,
  grossScheduledRent,
  annualDebtService,
  monthlyDebtService,
  variableExpensePct,
  fixedExpenses,
  projectCashFlows,
  holdYears,
  occupancyLabel,
}) {
  const [prefRate, setPrefRate] = useState(8);
  const [lpSplit, setLpSplit] = useState(70);
  const [acqFee, setAcqFee] = useState(2);
  const [offering, setOffering] = useState(20000);
  const [reserveMonths, setReserveMonths] = useState(3);

  const su = useMemo(
    () =>
      sourcesAndUses({
        price,
        loan,
        cashToClose,
        acquisitionFeePct: acqFee / 100,
        offeringCost: offering,
        reserveMonths,
        monthlyDebtService,
        monthlyOpex: fixedExpenses / 12,
      }),
    [price, loan, cashToClose, acqFee, offering, reserveMonths, monthlyDebtService, fixedExpenses]
  );

  // The pro forma's cash flows are struck at the buyer's cash to close.
  // A raise is larger, so the year-0 outflow is replaced while the
  // operating years are left exactly as the engine produced them.
  const cfs = useMemo(() => {
    if (!projectCashFlows?.length) return null;
    return [-su.raise, ...projectCashFlows.slice(1)];
  }, [projectCashFlows, su.raise]);

  const w = useMemo(
    () => (cfs ? waterfall(cfs, { pref: prefRate / 100, lpSplit: lpSplit / 100 }) : null),
    [cfs, prefRate, lpSplit]
  );

  const be = useMemo(
    () =>
      breakEven({
        grossScheduledRent,
        variableExpensePct,
        fixedExpenses,
        annualDebtService,
      }),
    [grossScheduledRent, variableExpensePct, fixedExpenses, annualDebtService]
  );

  const drag = useMemo(
    () => portfolioDrag({ perHomeRaiseExOffering: su.raise - offering, offeringCost: offering }),
    [su.raise, offering]
  );

  return (
    <div className="space-y-8 px-6 py-8 sm:px-8">
      {/* ---------- sources and uses ---------- */}
      <section>
        <Title kicker="What has to be raised">Sources and uses</Title>
        <div className="max-w-md">
          <Row label="Down payment and closing" value={usd(su.cashToClose)} note="buyer basis" />
          <Row label={`Acquisition fee ${acqFee}%`} value={usd(su.acquisitionFee)} tone="minus" />
          <Row label="Offering, legal, K-1 setup" value={usd(su.offeringCost)} tone="minus" />
          <Row
            label={`Operating reserve ${reserveMonths} months`}
            value={usd(su.reserve)}
            tone="minus"
          />
          <Row label="Total equity raise" value={usd(su.raise)} tone="total" />
          <Row label="Debt" value={usd(su.loan)} />
          <Row label="Total capitalization" value={usd(su.totalCapitalization)} tone="total" />
        </div>
        <p className="mt-2 max-w-md text-[11.5px] leading-relaxed text-neutral-500">
          The reserve is not padding. PadSplit reports roughly 45 days to 80% booked in this ZIP, so
          the property does not produce a full month's income on day one.
        </p>
      </section>

      {/* ---------- terms ---------- */}
      <section className="no-print">
        <Title kicker="Adjust and the figures below follow">Offering terms</Title>
        <div className="grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-5">
          <NumberInput label="Pref" value={prefRate} onChange={setPrefRate} suffix="%" step={0.5} />
          <NumberInput label="LP split" value={lpSplit} onChange={setLpSplit} suffix="%" />
          <NumberInput label="Acq fee" value={acqFee} onChange={setAcqFee} suffix="%" step={0.5} />
          <NumberInput label="Offering cost" value={offering} onChange={setOffering} step={1000} />
          <NumberInput label="Reserve" value={reserveMonths} onChange={setReserveMonths} suffix="mo" />
        </div>
      </section>

      {/* ---------- waterfall ---------- */}
      {w && (
        <section>
          <Title kicker={`${holdYears}-year hold · ${occupancyLabel}`}>
            Investor return after the promote
          </Title>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <div>
              <Row label="Project IRR" value={pct(w.projectIrr)} />
              <Row label="LP IRR, net of fees and promote" value={pct(w.lpIrr)} tone="total" />
              <Row label="LP equity multiple" value={`${w.lpMultiple.toFixed(2)}x`} />
            </div>
            <div>
              <Row label="Total to investors" value={usd(w.lpTotal)} />
              <Row label="Sponsor promote" value={usd(w.gpTotal)} />
              <Row
                label="Year-1 cash to investors"
                value={`${usd(w.lpCashFlows[1])} · ${pct(w.lpCashFlows[1] / su.raise)}`}
              />
            </div>
          </div>
          {!w.promoteEarned && (
            <p className="mt-3 max-w-xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              At these terms the deal never clears the preferred return, so the sponsor earns no
              promote and {usd(w.unpaidPref)} of pref is still owed at exit. LP and project IRR
              converge because there is nothing to split.
            </p>
          )}
        </section>
      )}

      {/* ---------- break-even ---------- */}
      <section>
        <Title kicker="How far it can fall">Break-even occupancy</Title>
        <div className="grid max-w-lg grid-cols-2 gap-4">
          {[
            ["Debt service covered", be.dscr100, "DSCR 1.00"],
            ["Typical covenant", be.dscr125, "DSCR 1.25"],
          ].map(([label, v, sub]) => (
            <div key={label} className="border-l-2 pl-3" style={{ borderColor: GREEN }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                {label}
              </div>
              <div className="text-2xl font-bold tabular-nums text-neutral-900">{pct(v, 1)}</div>
              <div className="text-[11px] text-neutral-500">{sub}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-xl text-[11.5px] leading-relaxed text-neutral-600">
          Let room by room, income steps down one room at a time rather than going to zero when a
          single tenant leaves. That is the structural difference from a whole-house rental, and it
          is why the floor sits this far below the market average.
        </p>
      </section>

      {/* ---------- scale ---------- */}
      <section>
        <Title kicker="Fixed cost, spread">One house or several</Title>
        <div className="max-w-lg overflow-hidden rounded border border-neutral-200">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-neutral-900 text-white">
                <th className="px-3 py-2 text-left font-semibold">Homes</th>
                <th className="px-3 py-2 text-right font-semibold">Equity raise</th>
                <th className="px-3 py-2 text-right font-semibold">Offering cost</th>
                <th className="px-3 py-2 text-right font-semibold">Drag</th>
              </tr>
            </thead>
            <tbody>
              {drag.map((r, i) => (
                <tr key={r.homes} className={i % 2 ? "bg-neutral-50" : "bg-white"}>
                  <td className="px-3 py-2 tabular-nums">{r.homes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(r.raise)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                    {usd(r.offeringCost)}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-bold tabular-nums"
                    style={{ color: r.dragPct > 0.05 ? "#B45309" : GREEN }}
                  >
                    {pct(r.dragPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-xl text-[11.5px] leading-relaxed text-neutral-600">
          Legal and offering costs barely move with deal size. On a single house they consume a
          double-digit share of the raise; across several they round to nothing. The per-home
          economics are identical either way.
        </p>
      </section>

      <p className="max-w-3xl border-t border-neutral-200 pt-4 text-[10.5px] leading-relaxed text-neutral-500">
        Projections computed from the deal record and the terms set above, not results. Fee,
        preferred return and split assumptions are illustrative defaults, not an offer. Whether an
        arrangement of this kind constitutes a security, and what disclosure it requires, is a
        question for qualified counsel.
      </p>
    </div>
  );
}

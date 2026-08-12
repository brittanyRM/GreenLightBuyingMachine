"use client";

// ============================================================
// Club-format pro forma.
//
// A standalone screen. It imports the two club-format libs and the
// formatters from lib/proforma.js, and nothing else from the app —
// no shared components, no shared state. Deleting this file and the
// two libs leaves everything else exactly as it was.
// ============================================================

import { useMemo, useState } from "react";
import { runClubProForma, usd, pct, multiple } from "../../lib/proformaClub";
import {
  buildBenchmarkExpenses,
  pepperPlaceInputs,
  resolveLabel,
} from "../../lib/proformaClubPresets";

const GREEN = "#00A651";

const SCENARIOS = [
  { key: "bear", label: "Bear" },
  { key: "base", label: "Base" },
  { key: "bull", label: "Bull" },
];

function Stat({ label, value, sub, good }) {
  return (
    <div
      className="print-keep border-l-2 pl-3"
      style={{ borderColor: good === false ? "#B91C1C" : GREEN }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

// Fixed grid tracks rather than flex, so a label that wraps doesn't
// drag its figure onto a second baseline.
function Row({ label, value, tone = "normal", note }) {
  const styles = {
    normal: "text-neutral-800",
    minus: "text-neutral-600",
    total: "font-bold text-neutral-900",
  };
  return (
    <div
      className={`print-keep grid grid-cols-[1fr_7rem] items-start gap-x-3 py-1.5 ${
        tone === "total"
          ? "border-b-2 border-neutral-900"
          : "border-b border-neutral-200"
      }`}
    >
      <div className={`text-[13px] leading-5 ${styles[tone]}`}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>}
      </div>
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({ title, children, note }) {
  return (
    <section className="rounded border border-neutral-200 bg-white">
      <header className="border-b border-neutral-200 px-4 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">
          {title}
        </h2>
        {note && <p className="mt-0.5 text-[11px] text-neutral-500">{note}</p>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export default function ClubProFormaPage() {
  const [inputs] = useState(() => pepperPlaceInputs());
  const [scenario, setScenario] = useState("base");
  const [subscription, setSubscription] = useState(25000);

  // Off by default and never persisted, so a reload returns to the
  // external label. The internal name can't ride along into a
  // screenshot or a PDF by accident.
  const [internalView, setInternalView] = useState(false);

  const result = useMemo(() => runClubProForma(inputs), [inputs]);
  const s = result[scenario];
  const y1 = s.years[0];
  const cap = s.capitalization;

  // The same deal run through a flat monthly catch-all, for the gap.
  const benchmarkNoi = useMemo(() => {
    const flat = buildBenchmarkExpenses(1000);
    const alt = {
      ...inputs,
      scenarios: {
        bear: { ...inputs.scenarios.bear, expenses: flat },
        base: { ...inputs.scenarios.base, expenses: flat },
        bull: { ...inputs.scenarios.bull, expenses: flat },
      },
    };
    return runClubProForma(alt)[scenario].years[0].noi;
  }, [inputs, scenario]);

  const dscrTight = s.minDscr < 1.2;
  const p = inputs.property;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              {resolveLabel(internalView)}
            </div>
            <h1 className="mt-0.5 text-2xl font-bold text-neutral-900">{p.name}</h1>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              {p.beds} bed · {p.baths} bath
              {p.sqft ? ` · ${p.sqft.toLocaleString()} sq ft` : ""} · {p.city}, {p.state}
              {p.assessorSqft
                ? ` — assessor shows ${p.assessorSqft.toLocaleString()}`
                : ""}
            </p>
          </div>

          <label className="no-print flex shrink-0 items-center gap-2 text-[11px] text-neutral-500">
            <input
              type="checkbox"
              checked={internalView}
              onChange={(e) => setInternalView(e.target.checked)}
            />
            Internal view
          </label>
        </div>

        {internalView && (
          <div className="mt-3 rounded border-l-4 border-neutral-900 bg-neutral-100 px-4 py-2 text-[12px] text-neutral-700">
            Internal view is on. Don&rsquo;t screenshot, export or share this screen.
          </div>
        )}
      </header>

      <div className="no-print mb-5 flex gap-1">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.key}
            onClick={() => setScenario(sc.key)}
            className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              scenario === sc.key
                ? "text-white"
                : "bg-neutral-100 text-neutral-500 hover:text-neutral-800"
            }`}
            style={scenario === sc.key ? { backgroundColor: GREEN } : undefined}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Levered IRR"
          value={pct(s.leveredIrr)}
          sub={`Unlevered ${pct(s.unleveredIrr)}`}
        />
        <Stat
          label="Cash-on-cash, Yr 1"
          value={pct(s.year1LeveredCashOnCash)}
          sub={`On ${usd(cap.totalCapitalizedEquity)}`}
        />
        <Stat
          label="Equity multiple"
          value={multiple(s.leveredMoic)}
          sub={`Profit ${usd(s.leveredProfit)}`}
        />
        <Stat
          label="DSCR, Yr 1"
          value={s.year1Dscr.toFixed(2)}
          sub={`Low year ${s.minDscr.toFixed(2)}`}
          good={!dscrTight}
        />
      </div>

      {dscrTight && (
        <div className="mb-5 rounded border-l-4 border-red-600 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          Coverage bottoms out at {s.minDscr.toFixed(2)}, under the 1.20 most DSCR
          lenders want. Expect lower proceeds or a rate add-on in this case.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Income — Year 1" note="Built room by room, down to what reaches the account.">
          <Row label="Gross scheduled rent" value={usd(y1.income.grossScheduledRent)} />
          <Row label="Vacancy" value={`(${usd(y1.income.vacancyLoss)})`} tone="minus" />
          <Row label="Collections loss" value={`(${usd(y1.income.collectionsLoss)})`} tone="minus" />
          <Row label="Gross collected" value={usd(y1.income.grossCollected)} />
          <Row
            label="PadSplit booking fees"
            value={`(${usd(y1.income.platformBookingFees)})`}
            tone="minus"
            note="per move-in"
          />
          <Row
            label="PadSplit service fee"
            value={`(${usd(y1.income.platformServiceFees)})`}
            tone="minus"
          />
          <Row label="Net to owner" value={usd(y1.income.netToOwner)} tone="total" />
          <p className="mt-2 text-[11px] text-neutral-500">
            {pct(1 - y1.income.netToOwner / y1.income.grossScheduledRent)} of gross
            scheduled rent never arrives.
          </p>
        </Panel>

        <Panel title="Operating expenses — Year 1" note="Itemized, not one catch-all line.">
          <Row label="Property taxes" value={usd(y1.expenses.propertyTaxes)} />
          <Row label="Insurance" value={usd(y1.expenses.insurance)} />
          <Row label="Utilities" value={usd(y1.expenses.utilities)} />
          <Row label="Repairs & maintenance" value={usd(y1.expenses.repairsMaintenance)} />
          <Row label="Turnover / make-ready" value={usd(y1.expenses.turnover)} />
          <Row label="Common-area cleaning" value={usd(y1.expenses.commonAreaCleaning)} />
          <Row label="Landscaping & pest" value={usd(y1.expenses.landscapingPest)} />
          <Row label="Supplies" value={usd(y1.expenses.supplies)} />
          {y1.expenses.management > 0 && (
            <Row label="Management" value={usd(y1.expenses.management)} />
          )}
          <Row label="Capital reserve" value={usd(y1.expenses.capexReserve)} />
          <Row label="Total expenses" value={usd(y1.expenses.total)} tone="total" />
          <Row label="NOI" value={usd(y1.noi)} tone="total" />
        </Panel>

        <Panel title="Capitalization">
          <Row label="Purchase price" value={usd(cap.purchasePrice)} />
          <Row label="Debt" value={`(${usd(cap.loanAmount)})`} tone="minus" />
          <Row label="Equity" value={usd(cap.equity)} />
          <Row label="Closing costs" value={usd(cap.closingCosts)} />
          <Row label="Loan costs" value={usd(cap.loanCosts)} />
          <Row label="Vacancy reserves" value={usd(cap.vacancyReserves)} />
          <Row label="Maintenance reserves" value={usd(cap.maintenanceReserves)} />
          {cap.platformFee > 0 && <Row label="Platform fee" value={usd(cap.platformFee)} />}
          {cap.conversionCapex > 0 && (
            <Row label="Conversion capex" value={usd(cap.conversionCapex)} />
          )}
          {cap.furnishingCost > 0 && (
            <Row label="Furnishing" value={usd(cap.furnishingCost)} />
          )}
          <Row label="Total capitalized equity" value={usd(cap.totalCapitalizedEquity)} tone="total" />
          <p className="mt-2 text-[11px] text-neutral-500">
            Reserves are{" "}
            {inputs.capitalization.capitalizeReserves
              ? "funded at close and sit in the equity denominator"
              : "accrued from cash flow and left out of the denominator"}
            . Confirm against the closing statement — it moves every figure above.
          </p>
        </Panel>

        <Panel title="Investor position" note="Subscription times the levered multiple.">
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Subscription
            </span>
            <div className="mt-1 flex items-center rounded border border-neutral-300 focus-within:border-[#00A651]">
              <span className="pl-2 text-sm text-neutral-500">$</span>
              <input
                type="number"
                step={1000}
                min={0}
                value={subscription}
                onChange={(e) => setSubscription(parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent px-2 py-1.5 text-sm text-neutral-900 outline-none"
              />
            </div>
          </label>

          <div className="mt-3">
            <Row
              label="Ownership share"
              value={pct(subscription / cap.totalCapitalizedEquity, 2)}
            />
            <Row
              label={`Projected value, year ${inputs.exit.holdYears}`}
              value={usd(s.projectedPositionValue(subscription))}
              tone="total"
            />
            <Row
              label="Projected gain"
              value={usd(s.projectedPositionValue(subscription) - subscription)}
            />
          </div>

          {internalView && (
            <div className="mt-3 rounded border-l-4 border-neutral-900 bg-neutral-100 px-3 py-2.5 text-[11px] leading-relaxed text-neutral-700">
              The published benchmark divides year-{inputs.exit.holdYears} gross
              property value by capitalized equity and never subtracts the loan
              payoff. On this deal that reads as{" "}
              <strong>{pct(s.benchmarkParity.grossValueOverEquityPct)}</strong>,
              overstating modeled levered profit by{" "}
              <strong>{usd(s.benchmarkParity.overstatementVsLevered)}</strong>.
              Internal only.
            </div>
          )}
        </Panel>
      </div>

      {internalView && (
        <div className="mt-4">
          <Panel
            title="Expense treatment — itemized vs. flat"
            note="Internal. Same income, same debt; only the operating stack differs."
          >
            <Row label="NOI, itemized stack" value={usd(y1.noi)} />
            <Row label="NOI, flat $1,000/mo catch-all" value={usd(benchmarkNoi)} />
            <Row label="Overstatement" value={usd(benchmarkNoi - y1.noi)} tone="total" />
            <p className="mt-2 text-[11px] text-neutral-500">
              One flat line cannot absorb landlord-paid utilities, turnover,
              cleaning and reserves for a {p.beds}-bed house.
            </p>
          </Panel>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <Panel title="Cash flows">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                {["Year", "Net to owner", "Expenses", "NOI", "Debt service", "Levered CF", "DSCR"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500 ${
                        i === 0 ? "" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {s.years.map((row) => (
                <tr key={row.year} className="border-b border-neutral-200">
                  <td className="py-1.5 text-[13px] text-neutral-800">{row.year}</td>
                  <td className="py-1.5 text-right text-[13px] tabular-nums text-neutral-800">
                    {usd(row.income.netToOwner)}
                  </td>
                  <td className="py-1.5 text-right text-[13px] tabular-nums text-neutral-600">
                    ({usd(row.expenses.total)})
                  </td>
                  <td className="py-1.5 text-right text-[13px] tabular-nums text-neutral-800">
                    {usd(row.noi)}
                  </td>
                  <td className="py-1.5 text-right text-[13px] tabular-nums text-neutral-600">
                    ({usd(row.debtService)})
                  </td>
                  <td className="py-1.5 text-right text-[13px] font-semibold tabular-nums text-neutral-900">
                    {usd(row.leveredCashFlow)}
                  </td>
                  <td className="py-1.5 text-right text-[13px] tabular-nums text-neutral-800">
                    {row.dscr.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <p className="mt-5 text-[11px] text-neutral-500">
        Projections only. Not investment advice, and not a guarantee of
        performance.
      </p>
    </div>
  );
}

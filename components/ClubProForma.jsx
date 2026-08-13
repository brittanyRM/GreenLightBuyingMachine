"use client";

// ============================================================
// Club-format pro forma — screen and printed sheet.
//
// Takes a fully built inputs object. The demo route seeds it from
// presets; /proforma-club/[slug] seeds it from the deals table.
//
// Laid out as a document rather than a dashboard, so Print produces
// the thing on screen instead of a reflowed approximation. It borrows
// the page furniture the rest of the app already prints with:
// print-doc, print-section, print-break-before, print-keep, no-print,
// and BrandMark from components/Brand.
//
// The only files it reads are the two club libs, the charts and the
// brand mark. Nothing else in the app knows this screen exists.
// ============================================================

import { useMemo, useState } from "react";
import { runClubProForma, usd, pct, multiple } from "../lib/proformaClub";
import { resolveLabel, toTemplateLens } from "../lib/proformaClubPresets";
import { BrandMark } from "./Brand";
import ClubAssumptions from "./ClubAssumptions";
import {
  CompsTable,
  HeadlineMetrics,
  PropertyFacts,
  PropertyGallery,
} from "./ClubPresentation";
import {
  BreakEvenCurve,
  CashOnCashBars,
  EquityCurve,
  ExpenseBars,
  IncomeWaterfall,
  ScenarioCompare,
} from "./ClubCharts";

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

// Fixed grid tracks rather than flex — a label that wraps to two
// lines would otherwise drop its figure to the second baseline.
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
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children, kicker }) {
  return (
    <div className="print-keep mb-3">
      {kicker && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {kicker}
        </div>
      )}
      <h2 className="text-[15px] font-black uppercase tracking-tight text-neutral-900">
        {children}
      </h2>
    </div>
  );
}

const HOLDS = [5, 7, 10];
const TICKETS = [10000, 25000, 50000, 100000];

export default function ClubProForma({
  initialInputs,
  backHref,
  backLabel,
  // "buyer" drops the controls and panels that only make sense on our
  // side: the assumptions editor, the lens toggle, internal view, and
  // the per-subscription investor block. A firm buying the whole house
  // does its own investor math downstream.
  audience = "seller",
  // Raw deal row and comps, when the caller has them. Buyer view leads
  // with the property; seller view doesn't need the photography.
  deal = null,
  comps = [],
}) {
  const isBuyer = audience === "buyer";
  // The model is editable now, so it's state rather than a frozen
  // seed. holdYears lives inside it; the buttons write through.
  const [base, setBase] = useState(initialInputs);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [scenario, setScenario] = useState("base");
  const [subscription, setSubscription] = useState(25000);

  // Off by default and never persisted, so a reload drops back to the
  // external label. Print also hides everything gated behind it.
  const [internalView, setInternalView] = useState(false);

  const holdYears = base.exit.holdYears;
  const setHoldYears = (h) =>
    setBase((m) => ({ ...m, exit: { ...m.exit, holdYears: h } }));

  const inputs = base;

  // A refinance scheduled on or after the sale year never happens.
  const refiApplies = base.refinance.enabled && base.refinance.year < holdYears;

  // Two lenses on the same house.
  //
  // "glbm" is the real operating stack. "template" is how a
  // syndicator's calculator reads it — one flat monthly catch-all,
  // management at 8%. The second number is always the better one,
  // which is exactly why a buyer needs to see both: without the
  // comparison, honest underwriting just looks like a worse deal.
  const [lens, setLens] = useState("glbm");

  const modelInputs = useMemo(
    () => (lens === "template" ? toTemplateLens(inputs) : inputs),
    [inputs, lens]
  );

  const result = useMemo(() => runClubProForma(modelInputs), [modelInputs]);
  const s = result[scenario];
  const y1 = s.years[0];
  const cap = s.capitalization;
  const p = inputs.property;

  // Each hold is its own run — the multiple changes because the exit
  // moves, not because the cash flows are being sliced differently.
  // Independent of subscription, so it survives typing in the box.
  const holdComparison = useMemo(
    () =>
      HOLDS.map((years) => {
        const withHold = { ...base, exit: { ...base.exit, holdYears: years } };
        const r = runClubProForma(
          lens === "template" ? toTemplateLens(withHold) : withHold
        )[scenario];
        return { years, moic: r.leveredMoic, irr: r.leveredIrr };
      }),
    [base, scenario, lens]
  );

  // The same house under the other lens, for the delta callout.
  const templateResult = useMemo(() => runClubProForma(toTemplateLens(inputs)), [inputs]);
  const glbmResult = useMemo(() => runClubProForma(inputs), [inputs]);

  const dscrTight = s.minDscr < 1.2;
  const scenarioLabel = SCENARIOS.find((x) => x.key === scenario).label;

  const asOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-neutral-100 p-4 font-sans sm:p-8">
      <div className="print-doc mx-auto max-w-4xl bg-white shadow-xl">
        {/* Masthead. Prints as-is — the dark plate and green rule are
            forced through by the print rules in globals.css. */}
        <div className="print-section bg-neutral-950 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <BrandMark height={30} />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.3em]"
                  style={{ color: GREEN }}
                >
                  Green Light Buying Machine
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-none text-white sm:text-3xl">
                {p.name}
              </h1>
              <div className="mt-1 text-sm text-neutral-400">
                {p.city}, {p.state} · {p.beds} bed / {p.baths} bath
                {p.sqft ? ` · ${p.sqft.toLocaleString()} sq ft` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
                {resolveLabel(internalView)} · {scenarioLabel} case
              </div>
              <div className="text-3xl font-bold tabular-nums text-white">
                {usd(cap.purchasePrice)}
              </div>
              <div className="text-[11px] text-neutral-400">
                {inputs.exit.holdYears}-year hold · {asOf}
              </div>
            </div>
          </div>
        </div>

        {!isBuyer && (
        <div className="print-section grid grid-cols-2 gap-4 border-b border-neutral-200 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <Stat
            label="Levered IRR"
            value={pct(s.leveredIrr)}
            sub={`Unlevered ${pct(s.unleveredIrr)}`}
          />
          <Stat
            label="Cash on cash, Yr 1"
            value={pct(s.year1LeveredCashOnCash)}
            sub={`on ${usd(cap.totalCapitalizedEquity)} in`}
            good={s.year1LeveredCashOnCash > 0}
          />
          <Stat
            label="Equity multiple"
            value={multiple(s.leveredMoic)}
            sub={`${usd(s.leveredProfit)} profit`}
          />
          <Stat
            label="DSCR"
            value={s.year1Dscr.toFixed(2)}
            sub={dscrTight ? `dips to ${s.minDscr.toFixed(2)}` : "lender-ready"}
            good={!dscrTight}
          />
        </div>
        )}

        {isBuyer && deal && (
          <PropertyGallery
            heroUrl={deal.hero_image_url}
            gallery={deal.gallery}
            floorPlanUrl={deal.floor_plan_url}
            address={deal.address_line}
          />
        )}

        {isBuyer && (
          <HeadlineMetrics
            scenario={s}
            holdYears={holdYears}
            listPrice={cap.purchasePrice}
            grossAnnual={y1.income.grossScheduledRent}
          />
        )}

        {/* Controls. Screen only. */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Scenario
          </span>
          {SCENARIOS.map((sc) => (
            <button
              key={sc.key}
              onClick={() => setScenario(sc.key)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                scenario === sc.key
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={scenario === sc.key ? { backgroundColor: GREEN } : undefined}
            >
              {sc.label}
            </button>
          ))}

          <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Hold
          </span>
          {HOLDS.map((h) => (
            <button
              key={h}
              onClick={() => setHoldYears(h)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                holdYears === h
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={holdYears === h ? { backgroundColor: GREEN } : undefined}
            >
              {h} yr
            </button>
          ))}

          {!isBuyer && (
          <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Lens
          </span>
          )}
          {!isBuyer && [
            { id: "glbm", label: "GLBM underwriting" },
            { id: "template", label: "Syndicator template" },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                lens === l.id
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={lens === l.id ? { backgroundColor: GREEN } : undefined}
            >
              {l.label}
            </button>
          ))}

          {backHref && (
            <a
              href={backHref}
              className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 ring-1 ring-neutral-300 transition hover:text-neutral-900"
            >
              ← {backLabel || "Back"}
            </a>
          )}

          {!isBuyer && (
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              showAssumptions
                ? "text-white"
                : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
            }`}
            style={showAssumptions ? { backgroundColor: "#0A0A0A" } : undefined}
          >
            {showAssumptions ? "Hide" : "Edit"} assumptions
          </button>
          )}

          <button
            onClick={() => window.print()}
            className="ml-auto rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Print / Save PDF
          </button>
        </div>

        {!isBuyer && (
        <>
        {/* Investment. Its own row — changing the ticket is the thing
            most people came to do, and it shouldn't be buried on the
            third page next to the capitalization table. */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Investment
          </span>
          {TICKETS.map((t) => (
            <button
              key={t}
              onClick={() => setSubscription(t)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold tabular-nums uppercase tracking-wider transition ${
                subscription === t
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={subscription === t ? { backgroundColor: GREEN } : undefined}
            >
              {usd(t)}
            </button>
          ))}

          <div className="flex items-center rounded border border-neutral-300 bg-white focus-within:border-[#00A651]">
            <span className="pl-2 text-sm text-neutral-500">$</span>
            <input
              type="number"
              step={1000}
              min={0}
              value={subscription}
              onChange={(e) => setSubscription(parseFloat(e.target.value) || 0)}
              className="w-28 bg-transparent px-2 py-1.5 text-sm tabular-nums text-neutral-900 outline-none"
              aria-label="Investment amount"
            />
          </div>

          <span className="ml-1 text-[12px] text-neutral-600">
            → <strong className="tabular-nums text-neutral-900">
              {usd(s.projectedPositionValue(subscription))}
            </strong>{" "}
            at year {holdYears}
            <span className="text-neutral-400">
              {" "}
              ({multiple(s.leveredMoic)})
            </span>
          </span>

          {!isBuyer && (
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
              <input
                type="checkbox"
                checked={internalView}
                onChange={(e) => setInternalView(e.target.checked)}
              />
              Internal view
            </label>
          )}
        </div>
        </>
        )}

        {internalView && (
          <div className="no-print border-b border-neutral-200 bg-neutral-100 px-6 py-2.5 text-[12px] text-neutral-700 sm:px-8">
            <span className="font-bold">Internal view is on.</span> The two
            benchmark panels below are visible on screen and are hidden from
            print. Don&rsquo;t screenshot or share this screen.
          </div>
        )}

        {dscrTight && (
          <div className="print-section border-b border-neutral-200 bg-red-50 px-6 py-3 text-[13px] text-red-900 sm:px-8">
            <span className="font-semibold">Coverage is tight.</span> DSCR bottoms
            out at {s.minDscr.toFixed(2)}, under the 1.20 most DSCR lenders
            require. Expect reduced proceeds or a rate add-on in this case.
          </div>
        )}

        {!isBuyer && showAssumptions && (
          <ClubAssumptions
            model={base}
            setModel={setBase}
            onReset={() => setBase(initialInputs)}
            perBedOpex={glbmResult[scenario].years[0].expenses.total / (p.beds || 1)}
          />
        )}

        {/* Basis. Prints — a buyer holding the sheet needs to know
            which stack produced the numbers above it. */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2.5 text-[11px] leading-snug text-neutral-600 sm:px-8">
          <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Expense basis:{" "}
          </span>
          {lens === "glbm" ? (
            <>
              Every operating line is itemized — landlord-paid utilities,
              turnover, common-area cleaning, landscaping, pest, supplies and a
              capital reserve, at {usd(y1.expenses.total / p.beds)} per bed per
              year. Most syndicated offerings model this as one flat monthly
              line, which reads{" "}
              <strong className="text-neutral-900">
                {usd(templateResult[scenario].years[0].noi - glbmResult[scenario].years[0].noi)}
              </strong>{" "}
              higher in year-1 NOI on this house. Both are shown so the figures
              can be compared like for like.
            </>
          ) : (
            <>
              Operating costs modeled the way a syndicated offering typically
              does — a flat $1,000/month catch-all plus management at 8%. Shown
              for comparability with offerings underwritten this way. Green
              Light Buying Machine&rsquo;s own figures itemize the stack and
              come in{" "}
              <strong className="text-neutral-900">
                {usd(templateResult[scenario].years[0].noi - glbmResult[scenario].years[0].noi)}
              </strong>{" "}
              lower on year-1 NOI.
            </>
          )}
          <br />
          Income is built room by room and reduced to net-to-owner before any
          return is calculated —{" "}
          {pct(1 - y1.income.netToOwner / y1.income.grossScheduledRent)} of gross
          scheduled rent is lost to vacancy, collections and PadSplit fees.
          Occupancy is modeled at{" "}
          {pct(modelInputs.scenarios[scenario].income.occupancyPct, 0)}
          {p.zip ? ` — the ${p.zip} average` : ""}. Rates, taxes, insurance and
          market rents move; these are projections, not quotes.
        </div>

        {/* Side-by-side. This is the sheet's argument: the same house
            under both conventions, with the gap named rather than
            left for the buyer to discover. */}
        <div className="print-section border-b border-neutral-200 px-6 py-4 sm:px-8">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Same house · both conventions · {scenarioLabel} case
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Year 1
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Syndicator template
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  GLBM underwriting
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Operating expenses",
                  templateResult[scenario].years[0].expenses.total,
                  glbmResult[scenario].years[0].expenses.total,
                ],
                [
                  "Net operating income",
                  templateResult[scenario].years[0].noi,
                  glbmResult[scenario].years[0].noi,
                ],
              ].map(([label, t, g]) => (
                <tr key={label} className="border-b border-neutral-200">
                  <td className="py-1.5 text-[12px] text-neutral-800">{label}</td>
                  <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                    {usd(t)}
                  </td>
                  <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-900">
                    {usd(g)}
                  </td>
                  <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                    {g - t >= 0 ? "+" : "−"}
                    {usd(Math.abs(g - t))}
                  </td>
                </tr>
              ))}
              <tr className="border-b-2 border-neutral-900">
                <td className="py-1.5 text-[12px] font-bold text-neutral-900">
                  Levered IRR, {holdYears} yr
                </td>
                <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                  {pct(templateResult[scenario].leveredIrr)}
                </td>
                <td className="py-1.5 text-right text-[12px] font-bold tabular-nums text-neutral-900">
                  {pct(glbmResult[scenario].leveredIrr)}
                </td>
                <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                  {pct(
                    glbmResult[scenario].leveredIrr - templateResult[scenario].leveredIrr
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            The right-hand column is the one to underwrite against. It already
            carries the utility, turnover and reserve load a nine-bed house
            actually generates, so it does not need a haircut applied on top.
          </p>
        </div>

        {/* ---------------- page one ---------------- */}
        <div className="px-6 py-6 sm:px-8">
          {isBuyer && deal && (
            <div className="print-section mb-7">
              <SectionTitle kicker="The property">Specifications</SectionTitle>
              <PropertyFacts deal={deal} beds={p.beds} baths={p.baths} />
            </div>
          )}

          {isBuyer && comps.length > 0 && (
            <div className="print-section mb-7">
              <SectionTitle kicker="Recent nearby sales">Comparable properties</SectionTitle>
              <CompsTable
                comps={comps}
                listPrice={cap.purchasePrice}
                sqft={p.sqft}
              />
            </div>
          )}

          <div className="print-section mb-7">
            <SectionTitle kicker="Where the rent goes">
              Gross scheduled to net to owner
            </SectionTitle>
            <IncomeWaterfall income={y1.income} />
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              Booking fees are charged per move-in on the full weekly rate, so
              they do not fall with occupancy. A high-turnover year costs twice —
              less rent collected and more fees paid on the churn.
            </p>
          </div>

          <div className="print-section mb-7 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle kicker="Year 1">Income</SectionTitle>
              <Row label="Gross scheduled rent" value={usd(y1.income.grossScheduledRent)} />
              <Row label="Vacancy" value={`(${usd(y1.income.vacancyLoss)})`} tone="minus" />
              <Row
                label="Collections loss"
                value={`(${usd(y1.income.collectionsLoss)})`}
                tone="minus"
              />
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
            </div>

            <div>
              <SectionTitle kicker="Year 1">Operating expenses</SectionTitle>
              <Row label="Property taxes" value={usd(y1.expenses.propertyTaxes)} />
              <Row label="Insurance" value={usd(y1.expenses.insurance)} />
              <Row label="Utilities" value={usd(y1.expenses.utilities)} note="landlord-paid" />
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
            </div>
          </div>

          <div className="print-section mb-2">
            <SectionTitle kicker="Year 1 · ranked">Expense stack</SectionTitle>
            <ExpenseBars expenses={y1.expenses} />
          </div>
        </div>

        {/* ---------------- page two ---------------- */}
        <div className="print-break-before px-6 py-6 sm:px-8">
          <div className="print-section mb-7">
            <SectionTitle kicker="Hold period">Equity, after the debt is repaid</SectionTitle>
            <EquityCurve
              years={s.years}
              purchasePrice={cap.purchasePrice}
              equityBasis={cap.totalCapitalizedEquity}
            />
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              The solid line is what the position is actually worth: property
              value less the outstanding loan. The dashed line is gross property
              value, shown for reference only — it is not a return.
            </p>
          </div>

          <div className="print-section mb-7">
            <SectionTitle kicker="By year">Cash-on-cash yield</SectionTitle>
            <CashOnCashBars years={s.years} />
          </div>

          <div className="print-section mb-7">
            <SectionTitle kicker="Cumulative position">Return of capital</SectionTitle>
            <BreakEvenCurve
              years={s.years}
              equityBasis={cap.totalCapitalizedEquity}
              breakEvenMonths={s.breakEvenMonths}
            />
          </div>

          <div className="print-section">
            <SectionTitle kicker="Bear · base · bull">Levered IRR by scenario</SectionTitle>
            <ScenarioCompare result={result} metric="leveredIrr" format={(v) => pct(v)} />
            <div className="mt-3">
              <ScenarioCompare
                result={result}
                metric="leveredMoic"
                format={(v) => multiple(v)}
              />
            </div>
          </div>
        </div>

        {/* ---------------- page three ---------------- */}
        <div className="print-break-before px-6 py-6 sm:px-8">
          <div className="print-section mb-7 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle kicker="Sources and uses">Capitalization</SectionTitle>
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
              <Row
                label="Total capitalized equity"
                value={usd(cap.totalCapitalizedEquity)}
                tone="total"
              />
              <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                Reserves are{" "}
                {inputs.capitalization.capitalizeReserves
                  ? "funded at close and sit in the equity denominator"
                  : "accrued from cash flow and left out of the denominator"}
                . Confirm against the closing statement — it moves every figure
                on this sheet.
              </p>
            </div>

            {!isBuyer && (
            <div>
              <SectionTitle kicker={`${holdYears}-year hold`}>Investor position</SectionTitle>
              <Row label="Investment" value={usd(subscription)} />
              <Row
                label="Ownership share"
                value={pct(subscription / cap.totalCapitalizedEquity, 2)}
              />
              <Row label="Equity multiple" value={multiple(s.leveredMoic)} />
              <Row
                label={`Projected value, year ${holdYears}`}
                value={usd(s.projectedPositionValue(subscription))}
                tone="total"
              />
              <Row
                label="Projected gain"
                value={usd(s.projectedPositionValue(subscription) - subscription)}
              />
              <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                Investment times the levered equity multiple, after the loan is
                repaid and selling costs are taken out.
                {refiApplies
                  ? ` A year-${base.refinance.year} refinance returns capital along the way.`
                  : ` No refinance — the year-${base.refinance.year} refinance falls on or after the sale, so it never happens.`}
              </p>

              <div className="mt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Same investment, by hold period
                </div>
                {holdComparison.map((h) => (
                  <Row
                    key={h.years}
                    label={`${h.years} years`}
                    value={usd(subscription * h.moic)}
                    note={`${pct(h.irr)} IRR`}
                    tone={h.years === holdYears ? "total" : "normal"}
                  />
                ))}
              </div>
            </div>
            )}
          </div>

          <div className="print-section">
            <SectionTitle kicker={`${inputs.exit.holdYears}-year hold`}>Cash flows</SectionTitle>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  {["Yr", "Net to owner", "Expenses", "NOI", "Debt service", "Levered CF", "DSCR"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500 ${
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
                  <tr key={row.year} className="print-keep border-b border-neutral-200">
                    <td className="py-1.5 text-[12px] text-neutral-800">{row.year}</td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {usd(row.income.netToOwner)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                      ({usd(row.expenses.total)})
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {usd(row.noi)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                      ({usd(row.debtService)})
                    </td>
                    <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-900">
                      {usd(row.leveredCashFlow)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {row.dscr.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Internal only, and no-print on top of that — these two
              panels reference the benchmark method and must not reach
              paper even with internal view left on. */}
          {internalView && (
            <div className="no-print mt-7 space-y-4">
              <div className="rounded border-l-4 border-neutral-900 bg-neutral-100 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  Internal · benchmark parity
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">
                  The published template divides year-{inputs.exit.holdYears} gross
                  property value by capitalized equity and never subtracts the
                  loan payoff. On this deal that reads as{" "}
                  <strong>{pct(s.benchmarkParity.grossValueOverEquityPct)}</strong>,
                  overstating modeled levered profit by{" "}
                  <strong>{usd(s.benchmarkParity.overstatementVsLevered)}</strong>.
                </p>
              </div>

              <div className="rounded border-l-4 border-neutral-900 bg-neutral-100 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  Internal · lens delta
                </div>
                <div className="mt-2">
                  <Row label="NOI, GLBM stack" value={usd(glbmResult[scenario].years[0].noi)} />
                  <Row
                    label="NOI, syndicator template"
                    value={usd(templateResult[scenario].years[0].noi)}
                  />
                  <Row
                    label="Template runs higher by"
                    value={usd(
                      templateResult[scenario].years[0].noi -
                        glbmResult[scenario].years[0].noi
                    )}
                    tone="total"
                  />
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Keep this panel off anything a buyer sees. The side-by-side
                  table above is the version to present — it states the gap
                  without characterising anyone else&rsquo;s underwriting.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Closing band. Carries the mark onto the last sheet. */}
        <div
          className="print-keep flex items-center justify-between border-t-2 px-6 py-4 sm:px-8"
          style={{ borderColor: GREEN }}
        >
          <div className="text-[9px] leading-snug text-neutral-500">
            Figures are estimates for underwriting and are not a guarantee of
            performance. Not investment advice.
            <br />
            Green Light Buying Machine — The Coliving Ecosystem
          </div>
          <BrandMark height={26} />
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * GLBM Club-Format Pro Forma — standalone route
 *
 * ISOLATION: imports only from lib/proforma-club/. No shared layout, no shared
 * components, no shared styles. Delete this folder and the app is unchanged.
 *
 * Imports are relative on purpose — they resolve whether or not your tsconfig
 * defines an "@/*" path alias, and regardless of where that alias points.
 *
 * Styling is deliberately plain so it inherits whatever you already have.
 * Swap the local Card/Row/Tab helpers for your own primitives when you're ready.
 */

import { useMemo, useState } from 'react';
import {
  fmtCurrency,
  fmtMultiple,
  fmtPercent,
  runProforma,
} from '../../lib/proforma-club/engine';
import {
  buildBenchmarkExpenses,
  pepperPlaceInputs,
  resolveLabel,
} from '../../lib/proforma-club/presets';
import type { ProformaInputs, ScenarioKey } from '../../lib/proforma-club/types';

const SCENARIOS: { key: ScenarioKey; label: string }[] = [
  { key: 'bear', label: 'Bear case' },
  { key: 'base', label: 'Base case' },
  { key: 'bull', label: 'Bull case' },
];

function Card({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="border-b border-neutral-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {note ? <p className="mt-1 text-xs text-neutral-500">{note}</p> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  emphasis,
  negative,
  indent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-4 py-1.5',
        emphasis ? 'border-t border-neutral-200 mt-1 pt-2 font-semibold' : '',
      ].join(' ')}
    >
      <span
        className={[
          'text-sm',
          indent ? 'pl-4 text-neutral-500' : 'text-neutral-700',
        ].join(' ')}
      >
        {label}
      </span>
      <span
        className={[
          'tabular-nums text-sm',
          negative ? 'text-rose-700' : 'text-neutral-900',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-neutral-400">{sub}</div> : null}
    </div>
  );
}

export default function ClubProformaPage() {
  const [inputs] = useState<ProformaInputs>(() => pepperPlaceInputs());
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [subscription, setSubscription] = useState(25_000);

  /**
   * Internal view. Off by default and never persisted — reloading returns to
   * the external label, so the internal one can't survive into a screenshot or
   * an export by accident.
   */
  const [internalView, setInternalView] = useState(false);
  const showParity = internalView;

  const result = useMemo(() => runProforma(inputs), [inputs]);
  const s = result[scenario];
  const y1 = s.years[0];
  const cap = s.capitalization;

  // Same deal run through the benchmark's flat-expense treatment, for the gap.
  const benchmarkResult = useMemo(() => {
    const alt: ProformaInputs = {
      ...inputs,
      scenarios: {
        bear: {
          ...inputs.scenarios.bear,
          expenses: buildBenchmarkExpenses(1_000),
        },
        base: {
          ...inputs.scenarios.base,
          expenses: buildBenchmarkExpenses(1_000),
        },
        bull: {
          ...inputs.scenarios.bull,
          expenses: buildBenchmarkExpenses(1_000),
        },
      },
    };
    return runProforma(alt);
  }, [inputs]);
  const benchmarkNoi = benchmarkResult[scenario].years[0].noi;

  const dscrTight = s.minDscr < 1.2;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {resolveLabel(internalView)}
          </p>
          <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={internalView}
              onChange={(e) => setInternalView(e.target.checked)}
              className="rounded border-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            />
            Internal view
          </label>
        </div>
        {internalView ? (
          <p className="mt-2 rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
            Internal view is on. Don&rsquo;t screenshot, export, or share this
            screen.
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">
          {inputs.property.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {inputs.property.beds} bed · {inputs.property.baths} bath ·{' '}
          {inputs.property.sqft.toLocaleString()} sq ft ·{' '}
          {inputs.property.city}, {inputs.property.state}
          {inputs.property.assessorSqft
            ? ` · assessor shows ${inputs.property.assessorSqft.toLocaleString()} sq ft`
            : ''}
        </p>
      </header>

      <div className="mb-6 flex gap-2" role="tablist" aria-label="Scenario">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.key}
            role="tab"
            aria-selected={scenario === sc.key}
            onClick={() => setScenario(sc.key)}
            className={[
              'rounded-md border px-4 py-2 text-sm transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
              scenario === sc.key
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Levered IRR"
          value={fmtPercent(s.leveredIrr)}
          sub={`Unlevered ${fmtPercent(s.unleveredIrr)}`}
        />
        <Stat
          label="Cash-on-cash, Yr 1"
          value={fmtPercent(s.year1LeveredCashOnCash)}
          sub={`Levered on ${fmtCurrency(cap.totalCapitalizedEquity)}`}
        />
        <Stat
          label="Equity multiple"
          value={fmtMultiple(s.leveredMoic)}
          sub={`Profit ${fmtCurrency(s.leveredProfit)}`}
        />
        <Stat
          label="DSCR, Yr 1"
          value={y1.dscr.toFixed(2)}
          sub={`Low year ${s.minDscr.toFixed(2)}`}
        />
      </div>

      {dscrTight ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Debt coverage bottoms out at {s.minDscr.toFixed(2)}, below the 1.20 most
          DSCR lenders require. Expect a lower proceeds cap or a rate add-on in
          this scenario.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Income — Year 1"
          note="Built room by room, then reduced to what reaches the owner."
        >
          <Row
            label="Gross scheduled rent"
            value={fmtCurrency(y1.income.grossScheduledRent)}
          />
          <Row
            label="Vacancy"
            value={`(${fmtCurrency(y1.income.vacancyLoss)})`}
            negative
            indent
          />
          <Row
            label="Collections loss"
            value={`(${fmtCurrency(y1.income.collectionsLoss)})`}
            negative
            indent
          />
          <Row label="Gross collected" value={fmtCurrency(y1.income.grossCollected)} />
          <Row
            label="Platform booking fees"
            value={`(${fmtCurrency(y1.income.platformBookingFees)})`}
            negative
            indent
          />
          <Row
            label="Platform service fee"
            value={`(${fmtCurrency(y1.income.platformServiceFees)})`}
            negative
            indent
          />
          <Row
            label="Net to owner"
            value={fmtCurrency(y1.income.netToOwner)}
            emphasis
          />
          <p className="mt-3 text-xs text-neutral-500">
            {fmtPercent(
              1 - y1.income.netToOwner / y1.income.grossScheduledRent,
              1
            )}{' '}
            of gross scheduled rent never reaches the account.
          </p>
        </Card>

        <Card
          title="Operating expenses — Year 1"
          note="Itemized rather than a single catch-all line."
        >
          <Row label="Property taxes" value={fmtCurrency(y1.expenses.propertyTaxes)} />
          <Row label="Insurance" value={fmtCurrency(y1.expenses.insurance)} />
          <Row label="Utilities" value={fmtCurrency(y1.expenses.utilities)} />
          <Row
            label="Repairs & maintenance"
            value={fmtCurrency(y1.expenses.repairsMaintenance)}
          />
          <Row label="Turnover / make-ready" value={fmtCurrency(y1.expenses.turnover)} />
          <Row
            label="Common-area cleaning"
            value={fmtCurrency(y1.expenses.commonAreaCleaning)}
          />
          <Row
            label="Landscaping & pest"
            value={fmtCurrency(y1.expenses.landscapingPest)}
          />
          <Row label="Supplies" value={fmtCurrency(y1.expenses.supplies)} />
          {y1.expenses.management > 0 ? (
            <Row label="Management" value={fmtCurrency(y1.expenses.management)} />
          ) : null}
          <Row label="Capital reserve" value={fmtCurrency(y1.expenses.capexReserve)} />
          <Row label="Total" value={fmtCurrency(y1.expenses.total)} emphasis />
          <Row label="NOI" value={fmtCurrency(y1.noi)} emphasis />
        </Card>

        <Card title="Capitalization">
          <Row label="Purchase price" value={fmtCurrency(cap.purchasePrice)} />
          <Row label="Debt" value={`(${fmtCurrency(cap.loanAmount)})`} negative />
          <Row label="Equity" value={fmtCurrency(cap.equity)} />
          <Row label="Closing costs" value={fmtCurrency(cap.closingCosts)} indent />
          <Row label="Loan costs" value={fmtCurrency(cap.loanCosts)} indent />
          <Row label="Vacancy reserves" value={fmtCurrency(cap.vacancyReserves)} indent />
          <Row
            label="Maintenance reserves"
            value={fmtCurrency(cap.maintenanceReserves)}
            indent
          />
          {cap.platformFee > 0 ? (
            <Row label="Platform fee" value={fmtCurrency(cap.platformFee)} indent />
          ) : null}
          {cap.conversionCapex > 0 ? (
            <Row
              label="Conversion capex"
              value={fmtCurrency(cap.conversionCapex)}
              indent
            />
          ) : null}
          {cap.furnishingCost > 0 ? (
            <Row label="Furnishing" value={fmtCurrency(cap.furnishingCost)} indent />
          ) : null}
          <Row
            label="Total capitalized equity"
            value={fmtCurrency(cap.totalCapitalizedEquity)}
            emphasis
          />
          <p className="mt-3 text-xs text-neutral-500">
            Reserves are{' '}
            {inputs.capitalization.capitalizeReserves
              ? 'funded at close and sit in the equity denominator'
              : 'accrued from cash flow and excluded from the denominator'}
            . Confirm against the closing statement — it moves every return metric.
          </p>
        </Card>

        <Card
          title="Investor position"
          note="Subscription times the levered equity multiple. Nothing else."
        >
          <label
            htmlFor="subscription"
            className="block text-xs text-neutral-600"
          >
            Subscription amount
          </label>
          <input
            id="subscription"
            type="number"
            step={1000}
            min={0}
            value={subscription}
            onChange={(e) => setSubscription(Number(e.target.value) || 0)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          />
          <div className="mt-4">
            <Row
              label="Ownership share"
              value={fmtPercent(subscription / cap.totalCapitalizedEquity, 2)}
            />
            <Row
              label={`Projected value, year ${inputs.exit.holdYears}`}
              value={fmtCurrency(s.projectedPositionValue(subscription))}
              emphasis
            />
            <Row
              label="Projected gain"
              value={fmtCurrency(s.projectedPositionValue(subscription) - subscription)}
            />
          </div>

          {showParity ? (
            <div className="mt-4 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-3 text-xs text-neutral-700">
              <p>
                The published template divides year-{inputs.exit.holdYears} gross
                property value by capitalized equity and never subtracts the loan
                payoff. On this deal that reads as{' '}
                <strong>
                  {fmtPercent(s.benchmarkParity.grossValueOverEquityPct, 1)}
                </strong>
                , overstating the modeled levered profit by{' '}
                <strong>{fmtCurrency(s.benchmarkParity.overstatementVsLevered)}</strong>.
                Internal reference only — do not publish.
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      {internalView ? (
      <div className="mt-4">
        <Card
          title="Expense treatment — itemized vs. flat catch-all"
          note="Internal comparison. Same income, same debt; only the operating stack differs."
        >
          <Row label="NOI, itemized stack" value={fmtCurrency(y1.noi)} />
          <Row label="NOI, flat $1,000/mo catch-all" value={fmtCurrency(benchmarkNoi)} />
          <Row
            label="Overstatement"
            value={fmtCurrency(benchmarkNoi - y1.noi)}
            emphasis
            negative={benchmarkNoi > y1.noi}
          />
          <p className="mt-3 text-xs text-neutral-500">
            A single flat line cannot absorb landlord-paid utilities, turnover,
            cleaning, and reserves for a {inputs.property.beds}-bed house.
          </p>
        </Card>
      </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <Card title="Cash flows">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th scope="col" className="py-2 pr-4 font-medium">Year</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Net to owner</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Expenses</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">NOI</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Debt service</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Levered CF</th>
                <th scope="col" className="py-2 text-right font-medium">DSCR</th>
              </tr>
            </thead>
            <tbody>
              {s.years.map((row) => (
                <tr key={row.year} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">{row.year}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtCurrency(row.income.netToOwner)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-rose-700">
                    ({fmtCurrency(row.expenses.total)})
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {fmtCurrency(row.noi)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-rose-700">
                    ({fmtCurrency(row.debtService)})
                  </td>
                  <td className="py-2 pr-4 text-right font-medium tabular-nums">
                    {fmtCurrency(row.leveredCashFlow)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.dscr.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        Projections only. Not investment advice, and not a guarantee of
        performance.
      </p>
    </main>
  );
}

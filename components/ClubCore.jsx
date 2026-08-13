"use client";

// ============================================================
// The buyer sheet's financial core, rendered from computeProForma.
//
// One engine. Every figure here is the same object the deal page and
// the flyer read, so the three documents cannot disagree about the
// same house — which is exactly what happened while a second engine
// existed alongside this one.
//
// The club engine still runs, but only for what computeProForma
// doesn't cover: scenarios, ten-year cash flows, the equity curve.
// Year one belongs to computeProForma.
// ============================================================

import { usd, pct } from "../lib/proforma";

const GREEN = "#00A651";
const INK = "#141914";

function Line({ label, sub, monthly, annual, share, tone }) {
  const bold = tone === "total";
  return (
    <tr className={bold ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"}>
      <td className={`py-1.5 text-[12px] ${bold ? "font-bold text-neutral-900" : "text-neutral-800"}`}>
        {label}
        {sub && <span className="ml-1.5 text-[10px] text-neutral-400">{sub}</span>}
      </td>
      <td className={`py-1.5 text-right text-[12px] tabular-nums ${bold ? "font-bold" : ""}`}>
        {monthly}
      </td>
      <td className={`py-1.5 text-right text-[12px] tabular-nums ${bold ? "font-bold" : ""}`}>
        {annual}
      </td>
      <td className="py-1.5 text-right text-[11px] tabular-nums text-neutral-400">{share}</td>
    </tr>
  );
}

function Head() {
  return (
    <thead>
      <tr className="border-b border-neutral-400 text-left">
        <th />
        <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-500">
          Monthly
        </th>
        <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-500">
          Annual
        </th>
        <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-500">
          % of GSR
        </th>
      </tr>
    </thead>
  );
}

// ---------- room revenue stack ----------

// The product in one picture: how many rooms carry a private bath and
// what each is worth. It is the reason the price holds against comps
// that sold as ordinary houses.
export function RoomRevenueStack({ p, market }) {
  const ensuite = p.mix.ensuiteCount || 0;
  const shared = p.mix.sharedCount || 0;
  if (!ensuite && !shared) return null;

  const ensuiteRate = Number(market?.private_weekly) || 0;
  const sharedRate = Number(market?.shared_weekly) || 0;

  const Row = ({ count, colour, label, rate }) =>
    count > 0 && (
      <div className="print-keep mb-2 flex items-center gap-3">
        <div className="flex gap-[3px]">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="h-6 w-4 rounded-[2px]" style={{ backgroundColor: colour }} />
          ))}
        </div>
        <div className="text-[12px] text-neutral-800">
          <strong>{count}×</strong> {label}
          {rate ? ` · $${rate}/wk` : ""}
        </div>
      </div>
    );

  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        Room revenue stack
      </div>
      <Row count={ensuite} colour={GREEN} label="Ensuite — private bath" rate={ensuiteRate} />
      <Row count={shared} colour={INK} label="Shared bath" rate={sharedRate} />
      <div className="text-[11px] text-neutral-500">
        {usd(p.grossWeekly)}/week gross
      </div>
    </div>
  );
}

// ---------- income and expenses ----------

export function IncomeAndExpenses({ p }) {
  const gsr = p.grossAnnual || 1;
  const share = (annual) => pct(annual / gsr, 1);

  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        Income
      </div>
      <table className="w-full">
        <Head />
        <tbody>
          <Line
            label="Gross scheduled rent"
            monthly={usd(p.grossMonthly)}
            annual={usd(p.grossAnnual)}
            share="100.0%"
          />
          <Line
            label={`Vacancy at ${pct(1 - p.vacancy, 0)} occupancy`}
            sub="stabilised portfolio average"
            monthly={`(${usd(p.vacancyLoss)})`}
            annual={`(${usd(p.vacancyLoss * 12)})`}
            share={share(-p.vacancyLoss * 12)}
          />
          <Line
            label="Operating income"
            monthly={usd(p.collected)}
            annual={usd(p.collected * 12)}
            share={share(p.collected * 12)}
            tone="total"
          />
        </tbody>
      </table>

      <div className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        Operating expenses
      </div>
      <table className="w-full">
        <Head />
        <tbody>
          {[
            ["PadSplit fee", `${pct(p.padsplitFeeRate, 1)} of collected`, p.feePadsplit],
            ["Property management", `${pct(p.mgmtFeeRate, 1)} of collected`, p.feeMgmt],
            ["Maintenance / R&M", `${pct(p.maintRate, 1)} of collected`, p.feeMaint],
            [
              "WiFi, cleaners, W/S/T, utilities",
              `${usd(p.opexPerRoom)}/room × ${p.mix.bedrooms}`,
              p.utilities,
            ],
            ["Taxes & insurance", `${pct(p.tiRate, 3)} of ${usd(p.price)}`, p.fixed],
          ].map(([label, sub, monthly]) => (
            <Line
              key={label}
              label={label}
              sub={sub}
              monthly={`(${usd(monthly)})`}
              annual={`(${usd(monthly * 12)})`}
              share={share(-monthly * 12)}
            />
          ))}
          <Line
            label="Total operating expenses"
            monthly={`(${usd(p.opex)})`}
            annual={`(${usd(p.opex * 12)})`}
            share={share(-p.opex * 12)}
            tone="total"
          />
        </tbody>
      </table>
    </div>
  );
}

// ---------- net performance ----------

// The four ways a buyer makes money on this, not just the one that
// shows up in the bank account. Cash flow alone understates a
// leveraged rental considerably.
export function NetPerformance({ p }) {
  const gsr = p.grossAnnual || 1;
  const share = (annual) => pct(annual / gsr, 1);

  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        Net performance
      </div>
      <table className="w-full">
        <Head />
        <tbody>
          <Line
            label="Net operating income"
            monthly={usd(p.noi)}
            annual={usd(p.noi * 12)}
            share={share(p.noi * 12)}
            tone="total"
          />
          <Line
            label="Debt service"
            sub={`${pct(p.rate, 3)} / ${Math.round(p.term / 12)} yr`}
            monthly={`(${usd(p.payment)})`}
            annual={`(${usd(p.payment * 12)})`}
            share={share(-p.payment * 12)}
          />
          <Line
            label="Cash flow"
            monthly={usd(p.cashFlow)}
            annual={usd(p.cashFlow * 12)}
            share={share(p.cashFlow * 12)}
            tone="total"
          />
          <Line
            label="+ Principal reduction"
            sub={`${pct(p.rate, 3)} / ${Math.round(p.term / 12)} yr`}
            monthly={usd(p.year1Principal / 12)}
            annual={usd(p.year1Principal)}
            share={share(p.year1Principal)}
          />
          <Line
            label="+ Depreciation"
            sub="building basis"
            monthly={usd(p.depreciation / 12)}
            annual={usd(p.depreciation)}
            share={share(p.depreciation)}
          />
          <Line
            label="+ Appreciation"
            sub={`${pct(p.appreciationRate, 1)} of ${usd(p.price)}`}
            monthly={usd(p.appreciation / 12)}
            annual={usd(p.appreciation)}
            share={share(p.appreciation)}
          />
          <Line
            label="Gross equity income"
            monthly={usd(p.grossEquityIncome / 12)}
            annual={usd(p.grossEquityIncome)}
            share=""
            tone="total"
          />
        </tbody>
      </table>

      <div
        className="print-keep mt-3 rounded-lg px-4 py-3"
        style={{ backgroundColor: INK }}
      >
        <span className="text-[12px] text-neutral-300">
          Return on investment with IIDD:{" "}
        </span>
        <strong className="text-[17px]" style={{ color: GREEN }}>
          {pct(p.roiIidd, 1)}
        </strong>
        <p className="mt-1 text-[10px] leading-snug text-neutral-400">
          Income, principal reduction, depreciation and appreciation against the
          cash put in. Cash flow alone is {pct(p.coc, 1)}.
        </p>
      </div>
    </div>
  );
}

// ---------- capital required ----------

export function CapitalRequired({ p }) {
  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        Capital required
      </div>
      {[
        ["Down payment", `${pct(1 - p.ltv, 0)} of price`, p.down],
        ["Loan amount", `${pct(p.ltv, 0)} LTV at ${pct(p.rate, 3)}`, p.loan],
        ["Origination", `${pct(p.points, 1)} of loan`, p.origination],
        ["Closing costs", `${pct(p.closingPct, 0)} of price`, p.closingCosts],
      ].map(([label, sub, value]) => (
        <div key={label} className="flex items-baseline justify-between border-b border-neutral-200 py-1.5">
          <span className="text-[12px] text-neutral-800">
            {label}
            <span className="ml-1.5 text-[10px] text-neutral-400">{sub}</span>
          </span>
          <span className="text-[12px] tabular-nums text-neutral-900">{usd(value)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-b-2 border-neutral-900 py-1.5">
        <span className="text-[12px] font-bold text-neutral-900">Total cash to close</span>
        <span className="text-[12px] font-bold tabular-nums text-neutral-900">{usd(p.cashIn)}</span>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-500">
        {usd(p.costPerBed)} per bedroom
        {p.costPerSqft ? ` · ${usd(p.costPerSqft)} per sq ft` : ""}
      </p>
    </div>
  );
}

// ---------- market panel ----------

export function MarketPanel({ market, deal }) {
  if (!market) return null;

  const cards = [
    ["Active units", market.active_units],
    ["Upcoming units", market.upcoming_units],
    ["Shared room", market.shared_weekly ? `$${market.shared_weekly}/wk` : null],
    ["Private bath", market.private_weekly ? `$${market.private_weekly}/wk` : null],
    ["Avg occupancy", market.avg_occupancy ? pct(market.avg_occupancy, 0) : null],
    // Nulls printed literally as "null days" on the last sheet.
    ["To first booking", market.days_to_first_booking ? `${market.days_to_first_booking} days` : null],
    ["To 80% booked", market.days_to_80 ? `${market.days_to_80} days` : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  if (!cards.length) return null;

  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-500">
        PadSplit market — {deal?.zip}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="print-keep rounded-lg border border-neutral-200 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-neutral-500">{label}</div>
            <div className="text-[15px] font-bold tabular-nums text-neutral-900">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

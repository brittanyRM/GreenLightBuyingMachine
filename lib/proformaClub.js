// ============================================================
// Green Light Buying Machine — club-format pro forma
//
// A second, parallel engine written to the shape of a syndicated
// offering: capitalized equity, scenario tabs, IRR / MOIC / DSCR,
// a Year-5 refinance and a defined exit.
//
// lib/proforma.js stays the source of truth for deal math on the
// deal pages, the flyer and the loan request. Nothing here writes
// back into it. This file only reads its formatters so a dollar
// sign looks the same on both screens.
//
// Income is built from net-to-owner, never gross scheduled rent.
// On a nine-bed PadSplit the gap between the two is about 27%, and
// every return figure below hangs off the smaller number.
// ============================================================

import { usd, pct, rateForDown } from "./proforma";

export { usd, pct };

export const WEEKS_PER_YEAR = 52;
const DAYS_PER_WEEK = 7;

const safeDiv = (n, d) => (d === 0 ? 0 : n / d);

export const multiple = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}x` : "—");

// ---------- money math ----------

// IRR by bisection. Newton diverges on streams that flip sign more
// than once — a refinance year does exactly that — so this walks the
// interval instead and returns NaN rather than a made-up number when
// no root exists.
export function irr(cashFlows, lo = -0.9999, hi = 10) {
  const npv = (rate) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let a = lo;
  let b = hi;
  let fa = npv(a);
  const fb = npv(b);

  if (fa * fb > 0) return NaN;

  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fa * fm < 0) {
      b = mid;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

export function amortizedPayment(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export function amortizedBalance(principal, annualRatePct, months, elapsedMonths) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.max(0, principal * (1 - elapsedMonths / months));
  const pmt = amortizedPayment(principal, annualRatePct, months);
  const bal =
    principal * Math.pow(1 + r, elapsedMonths) -
    (pmt * (Math.pow(1 + r, elapsedMonths) - 1)) / r;
  return Math.max(0, bal);
}

// ---------- income ----------

// Booking fees are charged per move-in on the full weekly rate, so
// they do not fall with occupancy. A bad year costs twice: less rent
// collected and more fees paid on the churn.
export function computeIncome(income, yearIndex) {
  const growth = Math.pow(1 + income.growthPct, yearIndex);

  let grossScheduledRent = 0;
  let bookingRaw = 0;

  for (const room of income.rooms) {
    const weekly = room.weeklyRate * growth;
    grossScheduledRent += weekly * WEEKS_PER_YEAR;

    const turns =
      income.platform.turnsPerRoomPerYear *
      (room.isEnsuite ? income.platform.ensuiteTurnMultiplier : 1);
    bookingRaw += turns * (weekly / DAYS_PER_WEEK) * income.platform.bookingFeeDays;
  }

  const afterVacancy = grossScheduledRent * income.occupancyPct;
  const vacancyLoss = grossScheduledRent - afterVacancy;

  const grossCollected = afterVacancy * income.collectionsPct;
  const collectionsLoss = afterVacancy - grossCollected;

  const platformBookingFees = Math.min(bookingRaw, grossCollected);
  const platformServiceFees =
    Math.max(0, grossCollected - platformBookingFees) * income.platform.serviceFeePct;

  return {
    grossScheduledRent,
    vacancyLoss,
    collectionsLoss,
    grossCollected,
    platformBookingFees,
    platformServiceFees,
    netToOwner: grossCollected - platformBookingFees - platformServiceFees,
  };
}

// ---------- expenses ----------

// Itemized rather than one flat monthly line. A single catch-all
// cannot absorb landlord-paid utilities, turnover, cleaning and
// reserves for a nine-bed house — it lands roughly 45% light.
export function computeExpenses(expenses, netToOwner, yearIndex) {
  const g = Math.pow(1 + expenses.growthPct, yearIndex);

  const rows = {
    propertyTaxes: expenses.propertyTaxesAnnual * g,
    insurance: expenses.insuranceAnnual * g,
    hoa: expenses.hoaAnnual * g,
    utilities: expenses.utilitiesAnnual * g,
    repairsMaintenance: expenses.repairsMaintenanceAnnual * g,
    turnover: expenses.turnoverAnnual * g,
    commonAreaCleaning: expenses.commonAreaCleaningAnnual * g,
    landscapingPest: expenses.landscapingPestAnnual * g,
    supplies: expenses.suppliesAnnual * g,
    // These follow income, not inflation.
    management: netToOwner * expenses.managementPctOfNet,
    capexReserve: netToOwner * expenses.capexReservePctOfNet,
  };

  const total = Object.values(rows).reduce((a, b) => a + b, 0);
  return { ...rows, total };
}

// ---------- capitalization ----------

export function computeCapitalization(inputs) {
  const c = inputs.capitalization;
  const loanAmount = c.purchasePrice * c.ltv;
  const equity = c.purchasePrice - loanAmount;

  const closingCosts = c.purchasePrice * c.closingCostPct;
  const loanCosts = loanAmount * c.loanCostPct;
  const vacancyReserves = c.purchasePrice * c.vacancyReservePct;
  const maintenanceReserves = c.purchasePrice * c.maintenanceReservePct;
  const platformFee = c.purchasePrice * c.platformFeePct;

  // Whether reserves are funded at close or accrued from cash flow
  // moves every return figure. Confirm it against the closing
  // statement rather than assuming.
  const reserves = c.capitalizeReserves ? vacancyReserves + maintenanceReserves : 0;

  const totalCapitalizedEquity =
    equity + closingCosts + loanCosts + reserves + platformFee +
    c.conversionCapex + c.furnishingCost;

  // No loan in the unlevered case, so no loan costs.
  const unleveredBasis =
    c.purchasePrice + closingCosts + reserves + platformFee +
    c.conversionCapex + c.furnishingCost;

  return {
    purchasePrice: c.purchasePrice,
    loanAmount,
    equity,
    closingCosts,
    loanCosts,
    vacancyReserves,
    maintenanceReserves,
    platformFee,
    conversionCapex: c.conversionCapex,
    furnishingCost: c.furnishingCost,
    totalCapitalizedEquity,
    unleveredBasis,
  };
}

// ---------- scenario ----------

export function runScenario(inputs, key) {
  const scenario = inputs.scenarios[key];
  const cap = computeCapitalization(inputs);
  const { holdYears, brokerFeePct, otherClosingPct } = inputs.exit;
  const appreciation = scenario.exit.appreciationPct;

  const years = [];

  let currentLoan = cap.loanAmount;
  let currentRate = inputs.debt.interestRatePct;
  let currentInterestOnly = inputs.debt.interestOnly;
  let monthsOnCurrentLoan = 0;

  for (let y = 1; y <= holdYears; y++) {
    const yearIndex = y - 1;

    const income = computeIncome(scenario.income, yearIndex);
    const expenses = computeExpenses(scenario.expenses, income.netToOwner, yearIndex);
    const noi = income.netToOwner - expenses.total;

    const openingBalance = currentLoan;
    let debtService;
    let closingBalance;

    if (currentInterestOnly) {
      debtService = openingBalance * (currentRate / 100);
      closingBalance = openingBalance;
    } else {
      const remaining = inputs.debt.amortizationMonths - monthsOnCurrentLoan;
      debtService = amortizedPayment(openingBalance, currentRate, remaining) * 12;
      closingBalance = amortizedBalance(openingBalance, currentRate, remaining, 12);
    }
    monthsOnCurrentLoan += 12;

    const propertyValueEnd = cap.purchasePrice * Math.pow(1 + appreciation, y);

    let refinanceProceeds = 0;
    if (inputs.refinance.enabled && y === inputs.refinance.year && y < holdYears) {
      const newLoan = propertyValueEnd * inputs.refinance.ltv;
      const refiCosts = newLoan * inputs.refinance.loanCostPct;
      refinanceProceeds = newLoan - closingBalance - refiCosts;

      closingBalance = newLoan;
      currentRate = inputs.refinance.interestRatePct;
      currentInterestOnly = inputs.refinance.interestOnly;
      monthsOnCurrentLoan = 0;
    }

    let netSaleProceeds = 0;
    let unleveredExit = 0;
    if (y === holdYears) {
      const sellingCosts = propertyValueEnd * (brokerFeePct + otherClosingPct);
      unleveredExit = propertyValueEnd - sellingCosts;
      netSaleProceeds = unleveredExit - closingBalance;
    }

    currentLoan = closingBalance;

    years.push({
      year: y,
      income,
      expenses,
      noi,
      debtService,
      loanBalanceEnd: closingBalance,
      propertyValueEnd,
      equityValueEnd: propertyValueEnd - closingBalance,
      refinanceProceeds,
      netSaleProceeds,
      unleveredCashFlow: noi + unleveredExit,
      leveredCashFlow: noi - debtService + refinanceProceeds + netSaleProceeds,
      unleveredCashOnCash: safeDiv(noi, cap.unleveredBasis),
      leveredCashOnCash: safeDiv(noi - debtService, cap.totalCapitalizedEquity),
      dscr: safeDiv(noi, debtService),
    });
  }

  const unleveredStream = [-cap.unleveredBasis, ...years.map((r) => r.unleveredCashFlow)];
  const leveredStream = [-cap.totalCapitalizedEquity, ...years.map((r) => r.leveredCashFlow)];

  const unleveredReturned = unleveredStream.slice(1).reduce((a, b) => a + b, 0);
  const leveredReturned = leveredStream.slice(1).reduce((a, b) => a + b, 0);
  const leveredMoic = safeDiv(leveredReturned, cap.totalCapitalizedEquity);

  // First month the cumulative levered position turns positive.
  let cumulative = -cap.totalCapitalizedEquity;
  let breakEvenMonths = null;
  for (const row of years) {
    const prior = cumulative;
    cumulative += row.leveredCashFlow;
    if (prior < 0 && cumulative >= 0) {
      breakEvenMonths = Math.round((row.year - 1) * 12 + safeDiv(-prior, row.leveredCashFlow) * 12);
      break;
    }
  }

  // The published benchmark divides year-N gross property value by
  // capitalized equity and never subtracts the loan payoff. Kept only
  // so the gap can be measured. Never shown outside internal view.
  const finalValue = years.length ? years[years.length - 1].propertyValueEnd : 0;
  const grossValueOverEquityPct = safeDiv(finalValue, cap.totalCapitalizedEquity) - 1;
  const impliedProfit = grossValueOverEquityPct * cap.totalCapitalizedEquity;
  const leveredProfit = leveredReturned - cap.totalCapitalizedEquity;

  const dscrs = years.map((r) => r.dscr).filter((d) => Number.isFinite(d));

  return {
    key,
    years,
    capitalization: cap,
    // The levered stream, exposed rather than kept private: the
    // syndication waterfall is a function over these cash flows and
    // must not rebuild them. Year 0 is the buyer's capitalized equity;
    // a raise substitutes its own year 0 and leaves the rest alone.
    leveredStream,
    unleveredIrr: irr(unleveredStream),
    leveredIrr: irr(leveredStream),
    unleveredProfit: unleveredReturned - cap.unleveredBasis,
    leveredProfit,
    unleveredMoic: safeDiv(unleveredReturned, cap.unleveredBasis),
    leveredMoic,
    year1UnleveredCashOnCash: years.length ? years[0].unleveredCashOnCash : 0,
    year1LeveredCashOnCash: years.length ? years[0].leveredCashOnCash : 0,
    year1Dscr: years.length ? years[0].dscr : 0,
    minDscr: dscrs.length ? Math.min(...dscrs) : 0,
    breakEvenMonths,
    // What one subscription is worth at exit. Subscription times the
    // levered multiple — nothing else.
    projectedPositionValue: (subscription) => subscription * leveredMoic,
    benchmarkParity: {
      grossValueOverEquityPct,
      impliedProfit,
      overstatementVsLevered: impliedProfit - leveredProfit,
      isNonStandard: true,
    },
  };
}

// Four cases, not three.
//
// GLBM is the house standard — the vacancy rate in org_assumptions,
// the same figure the deal-page pro forma underwrites to. Base is what
// the ZIP actually does per PadSplit. They differ wherever the market
// runs below our standard, and a buyer is entitled to see both.
export function runClubProForma(inputs) {
  const out = {
    inputs,
    bear: runScenario(inputs, "bear"),
    base: runScenario(inputs, "base"),
    bull: runScenario(inputs, "bull"),
  };
  if (inputs.scenarios?.glbm) out.glbm = runScenario(inputs, "glbm");
  return out;
}


// ---------- down payment options ----------

// The same three tiers the deal-page pro forma builds, priced off the
// shared RATE_BY_DOWN card via rateForDown. Origination is a point
// charge on the loan so it falls as the down payment rises; closing
// costs are fixed.
//
// Computed here rather than read from a lender row, so the sheet shows
// financing whether or not a lender option has been configured.
export function downPaymentOptions({
  price,
  noi,
  points = 0.015,
  closingCosts = 6500,
  termMonths = 360,
  downPcts = [0.15, 0.2, 0.25],
}) {
  if (!price) return [];

  return downPcts.map((downPct) => {
    const loan = price * (1 - downPct);
    const down = price - loan;
    const origination = loan * points;
    const cashIn = down + origination + closingCosts;

    const rate = rateForDown(downPct);
    const payment = amortizedPayment(loan, rate * 100, termMonths);
    const annualDebt = payment * 12;

    return {
      downPct,
      rate,
      loan,
      down,
      origination,
      closingCosts,
      cashIn,
      payment,
      cashFlow: noi - annualDebt,
      cashOnCash: cashIn ? (noi - annualDebt) / cashIn : 0,
      dscr: annualDebt ? noi / annualDebt : 0,
    };
  });
}

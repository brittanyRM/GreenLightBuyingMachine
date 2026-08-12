/**
 * GLBM Club-Format Pro Forma — calculation engine
 *
 * Pure functions only. No React, no Supabase, no fetch, no imports outside
 * this folder. Safe to unit-test in isolation and safe to drop into an
 * existing app without touching anything.
 *
 * Income model: gross scheduled -> occupancy -> collections -> platform fees
 * -> net to owner -> decomposed expense stack -> NOI -> debt service.
 */

import type {
  Capitalization,
  ExpenseBreakdown,
  IncomeBreakdown,
  ProformaInputs,
  ProformaResult,
  ScenarioInputs,
  ScenarioKey,
  ScenarioResult,
  YearRow,
} from './types';

const WEEKS_PER_YEAR = 52;
const DAYS_PER_WEEK = 7;

/* --------------------------- math helpers --------------------------- */

/** IRR by bisection. Robust where Newton diverges on sign-flipping streams. */
export function irr(cashFlows: number[], lo = -0.9999, hi = 10): number {
  const npv = (rate: number) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let a = lo;
  let b = hi;
  let fa = npv(a);
  let fb = npv(b);

  // No sign change means no real root in range — report NaN rather than a lie.
  if (fa * fb > 0) return NaN;

  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fa * fm < 0) {
      b = mid;
      fb = fm;
    } else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/** Level payment on an amortizing loan. */
export function amortizedPayment(
  principal: number,
  annualRatePct: number,
  months: number
): number {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Remaining balance after n months of level payments. */
export function amortizedBalance(
  principal: number,
  annualRatePct: number,
  months: number,
  elapsedMonths: number
): number {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.max(0, principal * (1 - elapsedMonths / months));
  const pmt = amortizedPayment(principal, annualRatePct, months);
  const bal =
    principal * Math.pow(1 + r, elapsedMonths) -
    (pmt * (Math.pow(1 + r, elapsedMonths) - 1)) / r;
  return Math.max(0, bal);
}

const safeDiv = (n: number, d: number) => (d === 0 ? 0 : n / d);

/* --------------------------- income --------------------------- */

/**
 * Build one year of income from room rates up.
 *
 * Booking fees are charged per member move-in on the FULL weekly rate, so they
 * do not scale down with occupancy — which is why high-turnover years hurt
 * roughly twice: less rent collected AND more booking fees paid.
 */
export function computeIncome(
  income: ScenarioInputs['income'],
  yearIndex: number
): IncomeBreakdown {
  const growth = Math.pow(1 + income.growthPct, yearIndex);

  let grossScheduledRent = 0;
  let platformBookingFees = 0;

  for (const room of income.rooms) {
    const weekly = room.weeklyRate * growth;
    grossScheduledRent += weekly * WEEKS_PER_YEAR;

    const turns =
      income.platform.turnsPerRoomPerYear *
      (room.isEnsuite ? income.platform.ensuiteTurnMultiplier : 1);
    const dailyRate = weekly / DAYS_PER_WEEK;
    platformBookingFees += turns * dailyRate * income.platform.bookingFeeDays;
  }

  const afterVacancy = grossScheduledRent * income.occupancyPct;
  const vacancyLoss = grossScheduledRent - afterVacancy;

  const grossCollected = afterVacancy * income.collectionsPct;
  const collectionsLoss = afterVacancy - grossCollected;

  // Booking fees can't exceed what was actually collected.
  const bookingFees = Math.min(platformBookingFees, grossCollected);

  // Service fee applies to collections net of booking fees.
  const platformServiceFees =
    Math.max(0, grossCollected - bookingFees) * income.platform.serviceFeePct;

  return {
    grossScheduledRent,
    vacancyLoss,
    collectionsLoss,
    grossCollected,
    platformBookingFees: bookingFees,
    platformServiceFees,
    netToOwner: grossCollected - bookingFees - platformServiceFees,
  };
}

/* --------------------------- expenses --------------------------- */

export function computeExpenses(
  expenses: ScenarioInputs['expenses'],
  netToOwner: number,
  yearIndex: number
): ExpenseBreakdown {
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
    // Management and capex reserve float with income, not with inflation.
    management: netToOwner * expenses.managementPctOfNet,
    capexReserve: netToOwner * expenses.capexReservePctOfNet,
  };

  const total = Object.values(rows).reduce((a, b) => a + b, 0);
  return { ...rows, total };
}

/* --------------------------- capitalization --------------------------- */

export function computeCapitalization(inputs: ProformaInputs): Capitalization {
  const c = inputs.capitalization;
  const loanAmount = c.purchasePrice * c.ltv;
  const equity = c.purchasePrice - loanAmount;

  const closingCosts = c.purchasePrice * c.closingCostPct;
  const loanCosts = loanAmount * c.loanCostPct;
  const vacancyReserves = c.purchasePrice * c.vacancyReservePct;
  const maintenanceReserves = c.purchasePrice * c.maintenanceReservePct;
  const platformFee = c.purchasePrice * c.platformFeePct;

  const reserves = c.capitalizeReserves ? vacancyReserves + maintenanceReserves : 0;

  const totalCapitalizedEquity =
    equity +
    closingCosts +
    loanCosts +
    reserves +
    platformFee +
    c.conversionCapex +
    c.furnishingCost;

  // Unlevered basis excludes loan costs — there's no loan in the unlevered case.
  const unleveredBasis =
    c.purchasePrice +
    closingCosts +
    reserves +
    platformFee +
    c.conversionCapex +
    c.furnishingCost;

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

/* --------------------------- scenario --------------------------- */

export function runScenario(
  inputs: ProformaInputs,
  key: ScenarioKey
): ScenarioResult {
  const scenario = inputs.scenarios[key];
  const cap = computeCapitalization(inputs);
  const { holdYears, brokerFeePct, otherClosingPct } = inputs.exit;
  const appreciation = scenario.exit.appreciationPct;

  const years: YearRow[] = [];

  let currentLoan = cap.loanAmount;
  let currentRate = inputs.debt.interestRatePct;
  let currentInterestOnly = inputs.debt.interestOnly;
  let monthsOnCurrentLoan = 0;

  for (let y = 1; y <= holdYears; y++) {
    const yearIndex = y - 1;

    const income = computeIncome(scenario.income, yearIndex);
    const expenses = computeExpenses(scenario.expenses, income.netToOwner, yearIndex);
    const noi = income.netToOwner - expenses.total;

    // --- debt service on the loan in force this year ---
    const openingBalance = currentLoan;
    let debtService: number;
    let closingBalance: number;

    if (currentInterestOnly) {
      debtService = openingBalance * (currentRate / 100);
      closingBalance = openingBalance;
    } else {
      const pmt = amortizedPayment(
        openingBalance,
        currentRate,
        inputs.debt.amortizationMonths - monthsOnCurrentLoan
      );
      debtService = pmt * 12;
      closingBalance = amortizedBalance(
        openingBalance,
        currentRate,
        inputs.debt.amortizationMonths - monthsOnCurrentLoan,
        12
      );
    }
    monthsOnCurrentLoan += 12;

    const propertyValueEnd = cap.purchasePrice * Math.pow(1 + appreciation, y);

    // --- refinance ---
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

    // --- exit ---
    let netSaleProceeds = 0;
    let unleveredExit = 0;
    if (y === holdYears) {
      const sellingCosts = propertyValueEnd * (brokerFeePct + otherClosingPct);
      unleveredExit = propertyValueEnd - sellingCosts;
      netSaleProceeds = unleveredExit - closingBalance;
    }

    const unleveredCashFlow = noi + unleveredExit;
    const leveredCashFlow = noi - debtService + refinanceProceeds + netSaleProceeds;

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
      unleveredCashFlow,
      leveredCashFlow,
      unleveredCashOnCash: safeDiv(noi, cap.unleveredBasis),
      leveredCashOnCash: safeDiv(noi - debtService, cap.totalCapitalizedEquity),
      dscr: safeDiv(noi, debtService),
    });
  }

  // --- return streams ---
  const unleveredStream = [-cap.unleveredBasis, ...years.map((r) => r.unleveredCashFlow)];
  const leveredStream = [
    -cap.totalCapitalizedEquity,
    ...years.map((r) => r.leveredCashFlow),
  ];

  const unleveredReturned = unleveredStream.slice(1).reduce((a, b) => a + b, 0);
  const leveredReturned = leveredStream.slice(1).reduce((a, b) => a + b, 0);

  const unleveredProfit = unleveredReturned - cap.unleveredBasis;
  const leveredProfit = leveredReturned - cap.totalCapitalizedEquity;

  const leveredMoic = safeDiv(leveredReturned, cap.totalCapitalizedEquity);

  // --- break-even: first month cumulative levered cash flow turns positive ---
  let cumulative = -cap.totalCapitalizedEquity;
  let breakEvenMonths: number | null = null;
  for (const row of years) {
    const prior = cumulative;
    cumulative += row.leveredCashFlow;
    if (prior < 0 && cumulative >= 0) {
      const fraction = safeDiv(-prior, row.leveredCashFlow);
      breakEvenMonths = Math.round((row.year - 1) * 12 + fraction * 12);
      break;
    }
  }

  // --- benchmark parity metric, retained for comparison only ---
  const finalValue = years[years.length - 1]?.propertyValueEnd ?? 0;
  const grossValueOverEquityPct = safeDiv(finalValue, cap.totalCapitalizedEquity) - 1;
  const impliedProfit = grossValueOverEquityPct * cap.totalCapitalizedEquity;

  const dscrs = years.map((r) => r.dscr).filter((d) => Number.isFinite(d));

  return {
    key,
    years,
    capitalization: cap,
    unleveredIrr: irr(unleveredStream),
    leveredIrr: irr(leveredStream),
    unleveredProfit,
    leveredProfit,
    unleveredMoic: safeDiv(unleveredReturned, cap.unleveredBasis),
    leveredMoic,
    year1UnleveredCashOnCash: years[0]?.unleveredCashOnCash ?? 0,
    year1LeveredCashOnCash: years[0]?.leveredCashOnCash ?? 0,
    year1Dscr: years[0]?.dscr ?? 0,
    minDscr: dscrs.length ? Math.min(...dscrs) : 0,
    breakEvenMonths,
    projectedPositionValue: (subscription: number) => subscription * leveredMoic,
    benchmarkParity: {
      grossValueOverEquityPct,
      impliedProfit,
      overstatementVsLevered: impliedProfit - leveredProfit,
      isNonStandard: true,
    },
  };
}

export function runProforma(inputs: ProformaInputs): ProformaResult {
  return {
    inputs,
    bear: runScenario(inputs, 'bear'),
    base: runScenario(inputs, 'base'),
    bull: runScenario(inputs, 'bull'),
  };
}

/* --------------------------- formatting --------------------------- */

export const fmtCurrency = (n: number, decimals = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '—';

export const fmtPercent = (n: number, decimals = 2) =>
  Number.isFinite(n) ? `${(n * 100).toFixed(decimals)}%` : '—';

export const fmtMultiple = (n: number) =>
  Number.isFinite(n) ? `${n.toFixed(2)}x` : '—';

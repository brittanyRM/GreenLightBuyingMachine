/**
 * GLBM Club-Format Pro Forma — type definitions
 *
 * ISOLATION CONTRACT: this file imports nothing. The whole module is
 * self-contained under lib/proforma-club/. Nothing outside this folder
 * is read or modified.
 */

export type ScenarioKey = 'bear' | 'base' | 'bull';

/** A single rentable room. Co-living income is built room-by-room, not as a lump rent. */
export interface Room {
  id: string;
  label: string;
  /** PadSplit weekly member dues at full (pre-promotion) price. */
  weeklyRate: number;
  /** Private bath commands a premium and typically turns less often. */
  isEnsuite: boolean;
}

export interface PropertyInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  beds: number;
  baths: number;
  sqft: number;
  /** Optional: assessor sqft, when it disagrees with the seller's figure. */
  assessorSqft?: number;
  yearBuilt?: number;
}

/**
 * Platform economics. Defaults model PadSplit's published "10 days + 8%":
 * a booking fee equal to 100% of the first 10 days of dues per new member
 * occupancy, then a service fee on everything else.
 */
export interface PlatformFees {
  serviceFeePct: number;
  bookingFeeDays: number;
  /** Member turnovers per room per year. The main driver of booking-fee drag. */
  turnsPerRoomPerYear: number;
  /** Ensuites hold members longer; scales turns for those rooms. */
  ensuiteTurnMultiplier: number;
}

export interface IncomeAssumptions {
  rooms: Room[];
  /** Physical occupancy, 0–1. */
  occupancyPct: number;
  /** Collections rate on billed dues, 0–1. Distinct from occupancy. */
  collectionsPct: number;
  platform: PlatformFees;
  /** Annual growth applied to room rates. */
  growthPct: number;
}

/**
 * Decomposed operating expenses. This is the deliberate departure from the
 * benchmark template, which collapses everything below into one "Misc. Costs"
 * line and materially understates co-living opex as a result.
 */
export interface ExpenseAssumptions {
  propertyTaxesAnnual: number;
  insuranceAnnual: number;
  hoaAnnual: number;
  /** Landlord-paid in co-living: power, water/sewer/trash, gas, internet. */
  utilitiesAnnual: number;
  repairsMaintenanceAnnual: number;
  /** Make-ready between members. Scales with turnover, not with rent. */
  turnoverAnnual: number;
  commonAreaCleaningAnnual: number;
  landscapingPestAnnual: number;
  suppliesAnnual: number;
  /** Management as a % of net-to-owner income, 0–1. Set 0 if self-managed. */
  managementPctOfNet: number;
  /** Capital reserve accrued from operations, % of net-to-owner income, 0–1. */
  capexReservePctOfNet: number;
  growthPct: number;
}

export interface CapitalizationAssumptions {
  purchasePrice: number;
  ltv: number;
  closingCostPct: number;
  loanCostPct: number;
  vacancyReservePct: number;
  maintenanceReservePct: number;
  /** Sponsor/platform fee, % of purchase price. Set 0 for direct acquisitions. */
  platformFeePct: number;
  /**
   * TRUE  = reserves funded at close, sitting in the equity denominator.
   * FALSE = reserves accrued from cash flow, excluded from the denominator.
   * Confirm against the actual closing statement — it moves every return metric.
   */
  capitalizeReserves: boolean;
  /** One-time conversion capex and furnishing. No native home in the benchmark template. */
  conversionCapex: number;
  furnishingCost: number;
}

export interface DebtAssumptions {
  interestRatePct: number;
  interestOnly: boolean;
  amortizationMonths: number;
}

export interface RefinanceAssumptions {
  enabled: boolean;
  year: number;
  ltv: number;
  interestRatePct: number;
  loanCostPct: number;
  interestOnly: boolean;
}

export interface ExitAssumptions {
  holdYears: number;
  appreciationPct: number;
  brokerFeePct: number;
  otherClosingPct: number;
}

export interface ScenarioInputs {
  income: IncomeAssumptions;
  expenses: ExpenseAssumptions;
  exit: Pick<ExitAssumptions, 'appreciationPct'>;
}

export interface ProformaInputs {
  property: PropertyInfo;
  capitalization: CapitalizationAssumptions;
  debt: DebtAssumptions;
  refinance: RefinanceAssumptions;
  exit: ExitAssumptions;
  scenarios: Record<ScenarioKey, ScenarioInputs>;
}

/* ------------------------------ outputs ------------------------------ */

export interface IncomeBreakdown {
  grossScheduledRent: number;
  vacancyLoss: number;
  collectionsLoss: number;
  grossCollected: number;
  platformBookingFees: number;
  platformServiceFees: number;
  /** What actually lands in the owner's account. All returns build from here. */
  netToOwner: number;
}

export interface ExpenseBreakdown {
  propertyTaxes: number;
  insurance: number;
  hoa: number;
  utilities: number;
  repairsMaintenance: number;
  turnover: number;
  commonAreaCleaning: number;
  landscapingPest: number;
  supplies: number;
  management: number;
  capexReserve: number;
  total: number;
}

export interface YearRow {
  year: number;
  income: IncomeBreakdown;
  expenses: ExpenseBreakdown;
  noi: number;
  debtService: number;
  loanBalanceEnd: number;
  propertyValueEnd: number;
  /** Property value less debt. The honest equity position. */
  equityValueEnd: number;
  refinanceProceeds: number;
  netSaleProceeds: number;
  unleveredCashFlow: number;
  leveredCashFlow: number;
  unleveredCashOnCash: number;
  leveredCashOnCash: number;
  dscr: number;
}

export interface Capitalization {
  purchasePrice: number;
  loanAmount: number;
  equity: number;
  closingCosts: number;
  loanCosts: number;
  vacancyReserves: number;
  maintenanceReserves: number;
  platformFee: number;
  conversionCapex: number;
  furnishingCost: number;
  totalCapitalizedEquity: number;
  unleveredBasis: number;
}

export interface ScenarioResult {
  key: ScenarioKey;
  years: YearRow[];
  capitalization: Capitalization;
  unleveredIrr: number;
  leveredIrr: number;
  unleveredProfit: number;
  leveredProfit: number;
  unleveredMoic: number;
  leveredMoic: number;
  year1UnleveredCashOnCash: number;
  year1LeveredCashOnCash: number;
  year1Dscr: number;
  minDscr: number;
  breakEvenMonths: number | null;
  /**
   * Projected value of one investor's position at exit = subscription x levered MOIC.
   * This is the metric the benchmark platform gets wrong.
   */
  projectedPositionValue: (subscription: number) => number;
  /**
   * Reproduces the benchmark's headline: year-N gross property value divided by
   * capitalized equity, never subtracting the loan payoff. Retained ONLY so you can
   * show the delta side-by-side. Do not publish this as a return figure.
   */
  benchmarkParity: {
    grossValueOverEquityPct: number;
    impliedProfit: number;
    overstatementVsLevered: number;
    isNonStandard: true;
  };
}

export interface ProformaResult {
  inputs: ProformaInputs;
  bear: ScenarioResult;
  base: ScenarioResult;
  bull: ScenarioResult;
}

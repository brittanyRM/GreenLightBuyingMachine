// ============================================================
// Green Light Buying Machine — pro forma engine
//
// Single source of truth for deal math. The pro forma page, the
// flyer, the buyer email, and the loan request all call this, so
// a number can never disagree with itself across documents.
// ============================================================

export const ORG_DEFAULTS = {
  vacancy_rate: 0.05,
  appreciation_rate: 0.05,
  management_fee: 0.08,
  padsplit_fee: 0.08,
  maintenance_rate: 0.02,
  ltv: 0.75,
  interest_rate: 0.075,
  loan_term_years: 30,
  origination_points: 0.02,
  closing_costs: 6500,
  depreciation_years: 27.5,
  building_ratio: 0.8,
  util_power: 425,
  util_wst: 275,
  util_wifi: 95,
  util_cleaning: 320,
  insurance_annual: 2400,
  tax_reclass_factor: 2.35,
};

export const WEEKS_PER_YEAR = 52;

// ---------- formatting ----------
export const usd = (n, dec = 0) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

export const pct = (n, dec = 1) =>
  `${((Number.isFinite(n) ? n : 0) * 100).toFixed(dec)}%`;

export const num = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US");

// ---------- helpers ----------
export function resolveAssumptions(deal = {}, orgRows = null) {
  const org = orgRows
    ? orgRows.reduce((acc, r) => ({ ...acc, [r.key]: Number(r.value) }), {})
    : ORG_DEFAULTS;
  return { ...ORG_DEFAULTS, ...org, ...(deal.assumptions || {}) };
}

export function amortize(principal, annualRate, years) {
  const r = annualRate / 12;
  const n = Math.round(years * 12);
  if (!(principal > 0) || !(n > 0)) {
    return { payment: 0, year1Principal: 0, year1Interest: 0 };
  }
  const payment =
    r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  let bal = principal;
  let p1 = 0;
  let i1 = 0;
  for (let i = 0; i < Math.min(12, n); i++) {
    const int = bal * r;
    const prin = payment - int;
    i1 += int;
    p1 += prin;
    bal -= prin;
  }
  return { payment, year1Principal: p1, year1Interest: i1 };
}

// Weekly rate for a room: explicit override, else market rate for its type.
export function roomRate(room, market = {}, overrides = {}) {
  if (room.weekly_rate != null) return Number(room.weekly_rate);
  return room.room_type === "ensuite"
    ? Number(overrides.ensuiteRate ?? market.private_weekly ?? 0)
    : Number(overrides.sharedRate ?? market.shared_weekly ?? 0);
}

// Property tax estimate. The last assessed bill is usually owner-occupied;
// reclassing to rental raises it. Falls back to a rate on price.
export function estimateTaxes(deal = {}, A = ORG_DEFAULTS) {
  if (deal.assessed_tax_amount) {
    return Math.round(Number(deal.assessed_tax_amount) * A.tax_reclass_factor);
  }
  const price = Number(deal.list_price || deal.purchase_price || 0);
  return Math.round(price * 0.0055);
}

export function roomMix(rooms = []) {
  const ensuite = rooms.filter((r) => r.room_type === "ensuite");
  const shared = rooms.filter((r) => r.room_type === "shared");
  return {
    ensuite,
    shared,
    bedrooms: ensuite.length + shared.length,
    ensuiteCount: ensuite.length,
    sharedCount: shared.length,
  };
}

// ============================================================
// computeProForma
//
//   deal      — a deals row
//   rooms     — deal_rooms rows
//   market    — padsplit_market row for deal.zip
//   scenario  — 'glbm' (org vacancy) | 'market' (actual occupancy)
//   overrides — any input the user changed on screen
// ============================================================
export function computeProForma({
  deal = {},
  rooms = [],
  market = {},
  comps = [],
  scenario = "glbm",
  overrides = {},
  orgRows = null,
}) {
  const A = resolveAssumptions(deal, orgRows);
  const mix = roomMix(rooms);

  const price = Number(
    overrides.price ?? deal.list_price ?? deal.purchase_price ?? 0
  );
  const sqft = Number(deal.post_reno_sqft || deal.living_area_sqft || 0);

  const ltv = Number(overrides.ltv ?? A.ltv);
  const rate = Number(overrides.rate ?? A.interest_rate);
  const term = Number(overrides.term ?? A.loan_term_years);
  const points = Number(overrides.points ?? A.origination_points);
  const closingCosts = Number(overrides.closingCosts ?? A.closing_costs);

  const marketVacancy =
    market?.avg_occupancy != null
      ? 1 - Number(market.avg_occupancy)
      : A.vacancy_rate;
  const vacancy = Number(
    overrides.vacancy ?? (scenario === "market" ? marketVacancy : A.vacancy_rate)
  );

  // ---- income ----
  const grossWeekly = rooms.reduce(
    (sum, r) => sum + roomRate(r, market, overrides),
    0
  );
  const grossMonthly = (grossWeekly * WEEKS_PER_YEAR) / 12;
  const vacancyLoss = grossMonthly * vacancy;
  const collected = grossMonthly - vacancyLoss;

  // ---- expenses ----
  const padsplitFeeRate = Number(overrides.padsplitFee ?? A.padsplit_fee);
  const mgmtFeeRate = Number(overrides.mgmtFee ?? A.management_fee);
  const maintRate = Number(overrides.maintFee ?? A.maintenance_rate);

  const feePadsplit = collected * padsplitFeeRate;
  const feeMgmt = collected * mgmtFeeRate;
  const feeMaint = collected * maintRate;

  const power = Number(overrides.power ?? A.util_power);
  const wst = Number(overrides.wst ?? A.util_wst);
  const wifi = Number(overrides.wifi ?? A.util_wifi);
  const cleaning = Number(overrides.cleaning ?? A.util_cleaning);
  const utilities = power + wst + wifi + cleaning;

  const taxesAnnual = Number(overrides.taxes ?? estimateTaxes(deal, A));
  const insuranceAnnual = Number(overrides.insurance ?? A.insurance_annual);
  const fixed = taxesAnnual / 12 + insuranceAnnual / 12;

  const opex = feePadsplit + feeMgmt + feeMaint + utilities + fixed;
  const noi = collected - opex;

  // ---- capital & debt ----
  const loan = price * ltv;
  const down = price - loan;
  const origination = loan * points;
  const cashIn = down + origination + closingCosts;

  const { payment, year1Principal, year1Interest } = amortize(loan, rate, term);
  const cashFlow = noi - payment;

  // ---- wealth build ----
  const appreciationRate = Number(
    overrides.appreciation ?? A.appreciation_rate
  );
  const depreciation = (price * A.building_ratio) / A.depreciation_years;
  const appreciation = price * appreciationRate;
  const equityIncome = year1Principal + depreciation + appreciation;
  const grossEquityIncome = cashFlow * 12 + equityIncome;

  // ---- comps ----
  const closed = comps.filter(
    (c) => c.comp_status === "closed" && Number(c.sold_price) > 0
  );
  const sortedPrices = closed.map((c) => Number(c.sold_price)).sort((a, b) => a - b);
  const psf = closed.filter((c) => Number(c.price_per_sqft) > 0);
  const compStats = closed.length
    ? {
        count: closed.length,
        low: sortedPrices[0],
        high: sortedPrices[sortedPrices.length - 1],
        avg: sortedPrices.reduce((s, v) => s + v, 0) / sortedPrices.length,
        median: sortedPrices[Math.floor(sortedPrices.length / 2)],
        avgPsf: psf.length
          ? psf.reduce((s, c) => s + Number(c.price_per_sqft), 0) / psf.length
          : null,
        belowLow: price > 0 && price < sortedPrices[0],
      }
    : null;

  const impliedResale =
    compStats?.avgPsf && sqft ? compStats.avgPsf * sqft : null;

  return {
    assumptions: A,
    scenario,
    vacancy,
    marketVacancy,
    mix,
    price,
    sqft,

    // income
    grossWeekly,
    grossMonthly,
    grossAnnual: grossWeekly * WEEKS_PER_YEAR,
    vacancyLoss,
    collected,

    // expenses
    feePadsplit,
    feeMgmt,
    feeMaint,
    utilities,
    power,
    wst,
    wifi,
    cleaning,
    taxesAnnual,
    insuranceAnnual,
    fixed,
    opex,
    noi,

    // capital
    ltv,
    rate,
    term,
    points,
    loan,
    down,
    origination,
    closingCosts,
    cashIn,

    // debt & returns
    payment,
    year1Principal,
    year1Interest,
    cashFlow,
    depreciation,
    appreciation,
    equityIncome,
    grossEquityIncome,

    // indicators
    capRate: price > 0 ? (noi * 12) / price : 0,
    coc: cashIn > 0 ? (cashFlow * 12) / cashIn : 0,
    dscr: payment > 0 ? noi / payment : 0,
    roiIidd: cashIn > 0 ? grossEquityIncome / cashIn : 0,
    grossYield: price > 0 ? (grossWeekly * WEEKS_PER_YEAR) / price : 0,
    rentPerSqft: sqft > 0 ? grossMonthly / sqft : 0,
    costPerBed: mix.bedrooms > 0 ? price / mix.bedrooms : 0,
    costPerSqft: sqft > 0 ? price / sqft : 0,

    // comps
    compStats,
    impliedResale,
  };
}

// Flatten a computed pro forma for pro_forma_snapshots.outputs
export function snapshotOutputs(p) {
  const keys = [
    "grossWeekly", "grossMonthly", "grossAnnual", "collected", "opex", "noi",
    "payment", "cashFlow", "cashIn", "capRate", "coc", "dscr", "roiIidd",
    "grossYield", "costPerBed", "costPerSqft", "vacancy", "price",
  ];
  return keys.reduce((acc, k) => ({ ...acc, [k]: p[k] }), {});
}

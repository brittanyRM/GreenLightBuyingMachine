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
  interest_rate: 0.065,
  loan_term_years: 30,
  origination_points: 0.015,

  // Closing costs are a percentage of price, not a flat figure — the
  // old $6,500 was the same on a $300k house as on a $700k one.
  closing_costs_pct: 0.01,

  // Taxes and insurance together, as a rate on price per year.
  tax_insurance_rate: 0.00474,
  depreciation_years: 27.5,
  building_ratio: 0.8,
  // WiFi, cleaners, water, sewer, trash and power, per room per month.
  //
  // These were four flat monthly figures totalling $1,115 no matter how
  // many rooms the house had — the same bill for a 5 bed as for a 9.
  // Every one of these costs scales with occupants, so it is charged
  // per room.
  opex_per_room: 110,
  insurance_annual: 2400,
  tax_reclass_factor: 2.35,
};

export const WEEKS_PER_YEAR = 52;

// Lender pricing by down payment. More equity, better rate.
export const RATE_BY_DOWN = {
  0.15: 0.0775,
  0.2: 0.06625,
  0.25: 0.065,
};

// Nearest tier at or below the down payment, so an unusual figure
// still prices rather than falling back to a single default.
export function rateForDown(downPct, fallback = 0.065) {
  const tiers = Object.keys(RATE_BY_DOWN)
    .map(Number)
    .sort((a, b) => a - b);
  let picked = null;
  for (const t of tiers) if (downPct >= t - 1e-9) picked = t;
  return picked != null ? RATE_BY_DOWN[picked] : RATE_BY_DOWN[tiers[0]] ?? fallback;
}

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
  // Only bedrooms earn. Without this, a bathroom or common area row
  // falls past the ensuite check and is priced as a shared bedroom —
  // which is exactly how four bathrooms ended up on the rent roll.
  if (room.room_type !== "shared" && room.room_type !== "ensuite") return 0;

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

// Total bathrooms from a deal row alone, for list views that have no
// room schedule loaded. roomMix is better where rooms are available.
export function totalBaths(deal = {}) {
  const common = Number(deal.bathrooms) || 0;
  const ens = Number(deal.ensuite_count) || 0;
  return ens && ens <= common ? common : common + ens;
}

export function roomMix(rooms = [], deal = {}) {
  const ensuite = rooms.filter((r) => r.room_type === "ensuite");
  const shared = rooms.filter((r) => r.room_type === "shared");

  // An ensuite bedroom contains a bathroom, so the true count is the
  // common baths plus the ensuites. deals.bathrooms holds only the
  // common ones — reading it alone printed "1 Bathrooms" on a house
  // whose own floor plan is labelled seven.
  //
  // The room schedule wins where it exists: it is the same data the
  // plan is drawn from, so the flyer and the drawing cannot disagree.
  const bathRows = rooms.filter((r) => r.room_type === "bath").length;
  const fromSchedule = bathRows + ensuite.length;

  const common = Number(deal.bathrooms) || 0;
  const ensuiteCount = ensuite.length || Number(deal.ensuite_count) || 0;

  // An ensuite count that fits inside the bath count means someone
  // already entered the total; don't double it.
  const fromRecord =
    ensuiteCount && ensuiteCount <= common ? common : common + ensuiteCount;

  // The record decides the counts, not the sketch.
  //
  // A sketch is a work in progress — rooms get traced, retraced and
  // half-finished, and the header shouldn't swing every time. What we
  // are underwriting to is target_bedrooms and target_ensuites on the
  // record, so those win wherever they're set, and the drawing only
  // fills in when they aren't.
  //
  // The room objects themselves still come from the schedule, since
  // per-room rates and pairings live there.
  const targetBeds = Number(deal.target_bedrooms) || 0;
  const drawnBeds = ensuite.length + shared.length;
  const bedrooms = targetBeds || drawnBeds;

  const targetEns = Number(deal.target_ensuites);
  const ensuites = Number.isFinite(targetEns) && targetEns > 0
    ? targetEns
    : ensuite.length;

  // Bathrooms, without guessing.
  //
  // The old rule inferred whether target_bathrooms already included
  // the ensuites by comparing the two numbers — so 5 common with 2
  // ensuite read as 5, while 1 common with 6 ensuite read as 7. Same
  // arithmetic, different meaning, depending on the values. That's not
  // something a reader can verify.
  //
  // Now: the room schedule wins where it exists, because a drawn bath
  // is unambiguous. Otherwise target_bathrooms means COMMON baths and
  // ensuites are always added — which is what the field label says.
  // The record is the source of truth. Not the sketch, not the drawn
  // schedule — the record.
  //
  // target_bathrooms means COMMON baths, which is what the field label
  // says, and ensuites always add. A drawing is a work in progress and
  // must never override what we're underwriting to; it only fills in
  // where the record is silent.
  const targetBaths = Number(deal.target_bathrooms);
  const commonBaths = Number.isFinite(targetBaths) && targetBaths > 0
    ? targetBaths
    : bathRows > 0
    ? bathRows
    : common;

  const bathrooms = commonBaths + ensuites;

  return {
    ensuite,
    shared,
    bedrooms,
    ensuiteCount: ensuites,
    sharedCount: Math.max(0, bedrooms - ensuites),
    bathrooms,
    commonBathrooms: Math.max(0, bathrooms - ensuites),
    // So a mismatch can be surfaced rather than silently reconciled.
    drawnBedrooms: drawnBeds,
    drawnEnsuites: ensuite.length,
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
  const mix = roomMix(rooms, deal);

  const price = Number(
    overrides.price ?? deal.list_price ?? deal.purchase_price ?? 0
  );
  const sqft = Number(deal.post_reno_sqft || deal.living_area_sqft || 0);

  const ltv = Number(overrides.ltv ?? A.ltv);
  const downPct = 1 - ltv;

  // The rate follows the down payment unless it's been overridden.
  const rate = Number(overrides.rate ?? rateForDown(downPct, A.interest_rate));
  const term = Number(overrides.term ?? A.loan_term_years);
  const points = Number(overrides.points ?? A.origination_points);

  const closingPct = Number(overrides.closingPct ?? A.closing_costs_pct);
  const closingCosts = Number(overrides.closingCosts ?? price * closingPct);

  const marketVacancy =
    market?.avg_occupancy != null
      ? 1 - Number(market.avg_occupancy)
      : A.vacancy_rate;
  const vacancy = Number(
    overrides.vacancy ?? (scenario === "market" ? marketVacancy : A.vacancy_rate)
  );

  // ---- income ----
  // Bedrooms only. This summed every row in deal_rooms, so the four
  // bathrooms were each priced at the shared weekly rate and billed to
  // a tenant who doesn't exist. roomRate has no room_type guard — a
  // bath falls through its ensuite check and comes back as shared.
  const grossWeekly = rooms
    .filter((r) => r.room_type === "shared" || r.room_type === "ensuite")
    .reduce((sum, r) => sum + roomRate(r, market, overrides), 0);
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

  const opexPerRoom = Number(overrides.opexPerRoom ?? A.opex_per_room);
  const utilities = opexPerRoom * mix.bedrooms;

  // Taxes and insurance as one rate on price. The old split guessed
  // taxes from the last assessed bill and carried a flat insurance
  // figure; a single rate is what the lender underwrites to.
  const tiRate = Number(overrides.tiRate ?? A.tax_insurance_rate);
  const taxInsuranceAnnual = Number(overrides.taxInsurance ?? price * tiRate);
  const fixed = taxInsuranceAnnual / 12;

  // Kept for the property record, which still shows the last bill.
  const taxesAnnual = estimateTaxes(deal, A);
  const insuranceAnnual = A.insurance_annual;

  const opex = feePadsplit + feeMgmt + feeMaint + utilities + fixed;
  const noi = collected - opex;

  // ---- capital & debt ----
  const loan = price * ltv;
  const down = price - loan;
  const origination = loan * points;
  const cashIn = down + origination + closingCosts;

  const { payment, year1Principal, year1Interest } = amortize(loan, rate, term);
  const cashFlow = noi - payment;

  // The same deal at three down payments. Origination is a point
  // charge on the loan, so it falls as the down payment rises; closing
  // costs are fixed. Shown side by side because the trade — more cash
  // in for less debt service — is the decision a buyer is actually
  // making.
  const financingOptions = [0.15, 0.2, 0.25].map((downPct) => {
    const oLoan = price * (1 - downPct);
    const oDown = price - oLoan;
    const oOrigination = oLoan * points;
    const oCashIn = oDown + oOrigination + closingCosts;
    // Each tier prices differently — that's most of the trade-off.
    const oRate = Number(overrides.rate ?? rateForDown(downPct, A.interest_rate));
    const oAmort = amortize(oLoan, oRate, term);
    const oCashFlow = noi - oAmort.payment;

    return {
      downPct,
      label: `${Math.round(downPct * 100)}% down`,
      rate: oRate,
      loan: oLoan,
      down: oDown,
      origination: oOrigination,
      originationPct: points,
      closingCosts,
      cashIn: oCashIn,
      payment: oAmort.payment,
      year1Principal: oAmort.year1Principal,
      year1Interest: oAmort.year1Interest,
      cashFlow: oCashFlow,
      annualCashFlow: oCashFlow * 12,
      cashOnCash: oCashIn > 0 ? (oCashFlow * 12) / oCashIn : 0,
      dscr: oAmort.payment > 0 ? noi / oAmort.payment : 0,
    };
  });

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

  const median = (arr) =>
    arr.length
      ? arr.length % 2
        ? arr[(arr.length - 1) / 2]
        : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2
      : null;

  // Price per square foot, computed rather than trusted.
  //
  // A stored price_per_sqft is only as good as whoever typed it, and a
  // single row with the sale price in that column drags the mean into
  // four figures — which is how a $510k house showed an implied resale
  // of $2.17M. Derive it from sold price and area where both exist,
  // fall back to the stored figure, discard anything outside a
  // plausible band, and take the median so one bad row can't move it.
  const psfValues = closed
    .map((c) => {
      const sold = Number(c.sold_price);
      const area = Number(c.approx_sqft);
      if (sold > 0 && area > 100) return sold / area;
      const stored = Number(c.price_per_sqft);
      return stored > 0 ? stored : null;
    })
    .filter((v) => v != null && v >= 40 && v <= 800)
    .sort((a, b) => a - b);

  const medianPsf = median(psfValues);

  // Sale dates, so a comp set can be judged on how current it is.
  const dates = closed
    .map((c) => c.sold_date)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  const newest = dates.length ? dates[dates.length - 1] : null;
  const oldest = dates.length ? dates[0] : null;
  const monthsSinceNewest = newest
    ? Math.round((Date.now() - newest.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    : null;

  const compStats = closed.length
    ? {
        count: closed.length,
        newestSale: newest ? newest.toISOString().slice(0, 10) : null,
        oldestSale: oldest ? oldest.toISOString().slice(0, 10) : null,
        datedCount: dates.length,
        monthsSinceNewest,
        low: sortedPrices[0],
        high: sortedPrices[sortedPrices.length - 1],
        avg: sortedPrices.reduce((s, v) => s + v, 0) / sortedPrices.length,
        median: median(sortedPrices),
        medianPsf,
        psfCount: psfValues.length,
        psfDiscarded: closed.length - psfValues.length,
        belowLow: price > 0 && price < sortedPrices[0],
      }
    : null;

  // Suppress a figure that can't be right rather than print it. More
  // than double the comp median means the inputs are wrong, and a
  // buyer-facing sheet is the worst place to find that out.
  const rawImplied = medianPsf && sqft ? medianPsf * sqft : null;
  const impliedResale =
    rawImplied && compStats?.median && rawImplied > compStats.median * 2
      ? null
      : rawImplied;

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
    opexPerRoom,
    padsplitFeeRate,
    mgmtFeeRate,
    maintRate,
    taxesAnnual,
    insuranceAnnual,
    taxInsuranceAnnual,
    tiRate,
    closingPct,
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
    financingOptions,

    // debt & returns
    payment,
    year1Principal,
    year1Interest,
    cashFlow,
    depreciation,
    appreciationRate,
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

// ============================================================
// Club-format pro forma — defaults and seed deal.
//
// Two labels, not one. The internal name records which published
// offering format this was modelled against; the external name is
// what anyone outside sees. resolveLabel defaults to external so
// the internal one cannot leak by omission.
//
// Naming a competitor descriptively in your own tooling is a very
// different thing from using their logo, wordmark or colors. None
// of the latter appear anywhere in this module, and none should.
// ============================================================

export const INTERNAL_LABEL = "Mogul format";
export const EXTERNAL_LABEL = "GLBM pro forma";

export function resolveLabel(internal = false) {
  return internal ? INTERNAL_LABEL : EXTERNAL_LABEL;
}

// PadSplit's published host model: 100% of the first 10 days of a
// new member's dues, then 8% of everything settled after that.
export const PADSPLIT_FEES = {
  serviceFeePct: 0.08,
  bookingFeeDays: 10,
  turnsPerRoomPerYear: 2,
  // A private bath holds a member noticeably longer.
  ensuiteTurnMultiplier: 0.75,
};

export const NO_PLATFORM_FEES = {
  serviceFeePct: 0,
  bookingFeeDays: 0,
  turnsPerRoomPerYear: 0,
  ensuiteTurnMultiplier: 1,
};

// Per bed per year, Phoenix metro.
//
// lib/proforma.js already charges utilities at $110/room/month —
// $1,320/yr — on the same principle that these scale with occupants
// rather than being flat per house. This sits slightly under that,
// with cleaning and turnover pulled out as their own lines instead
// of folded in.
export const COLIVING_OPEX_PER_BED = {
  utilities: 1050,
  repairsMaintenance: 750,
  turnover: 260,
  commonAreaCleaning: 420,
  landscapingPest: 180,
  supplies: 130,
};

// Built from org_assumptions — the same rows lib/proforma.js reads —
// so the club sheet and the deal-page pro forma cost the same house
// the same way.
//
// org_assumptions carries a single opex_per_room covering WiFi,
// cleaners, water/sewer/trash and utilities. That total is preserved
// exactly and then split across the itemized lines the club sheet
// shows, so the breakdown is presentational and the sum still equals
// your number. Insurance, maintenance and taxes come across directly.
//
// The split weights only decide how one figure is displayed. Change
// opex_per_room and every line moves with it.
function orgValue(org, key, fallback) {
  if (!Array.isArray(org)) return fallback;
  const row = org.find((r) => r.key === key);
  const v = row ? Number(row.value) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const OPEX_SPLIT = {
  utilities: 0.58,
  commonAreaCleaning: 0.22,
  landscapingPest: 0.11,
  supplies: 0.09,
};

export function buildColivingExpenses(bedCount, overrides = {}, org = null, deal = {}) {
  const perRoomMonthly = orgValue(org, "opex_per_room", 110);
  const opexTotal = perRoomMonthly * 12 * bedCount;

  // 2% of collected rent in proforma.js. Held as a dollar figure here
  // because the club engine grows expense lines with inflation rather
  // than with income.
  const maintRate = orgValue(org, "maintenance_rate", 0.02);

  // assessed_tax_amount x tax_reclass_factor: an owner-occupied bill
  // reassessed as a rental. Falls back only when the deal has no
  // assessed figure.
  const assessed = Number(deal.assessed_tax_amount) || 0;
  const taxes = assessed
    ? Math.round(assessed * orgValue(org, "tax_reclass_factor", 2.35))
    : 3000;

  return {
    propertyTaxesAnnual: taxes,
    insuranceAnnual: orgValue(org, "insurance_annual", 2400),
    hoaAnnual: 0,
    utilitiesAnnual: Math.round(opexTotal * OPEX_SPLIT.utilities),
    commonAreaCleaningAnnual: Math.round(opexTotal * OPEX_SPLIT.commonAreaCleaning),
    landscapingPestAnnual: Math.round(opexTotal * OPEX_SPLIT.landscapingPest),
    suppliesAnnual: Math.round(opexTotal * OPEX_SPLIT.supplies),
    // Turnover sits outside opex_per_room; carried at a nominal figure
    // and editable per deal.
    turnoverAnnual: 0,
    repairsMaintenanceAnnual: 0,
    // Applied against net-to-owner, matching proforma.js.
    managementPctOfNet: 0,
    capexReservePctOfNet: maintRate,
    growthPct: 0.03,
    ...overrides,
  };
}

// The benchmark's treatment: one flat monthly catch-all. Here only
// so the two stacks can be shown side by side and the gap measured.
export function buildBenchmarkExpenses(monthlyMisc, overrides = {}) {
  return {
    propertyTaxesAnnual: 1800,
    insuranceAnnual: 3000,
    hoaAnnual: 0,
    utilitiesAnnual: monthlyMisc * 12,
    repairsMaintenanceAnnual: 0,
    turnoverAnnual: 0,
    commonAreaCleaningAnnual: 0,
    landscapingPestAnnual: 0,
    suppliesAnnual: 0,
    managementPctOfNet: 0.08,
    capexReservePctOfNet: 0,
    growthPct: 0.02,
    ...overrides,
  };
}

// Ensuites first, then shared — matching how the rooms read on a
// sketch and on the flyer.
export function buildRooms(sharedCount, sharedWeekly, ensuiteCount, ensuiteWeekly) {
  const rooms = [];
  for (let i = 1; i <= ensuiteCount; i++) {
    rooms.push({
      id: `ensuite-${i}`,
      label: `Ensuite ${i}`,
      weeklyRate: ensuiteWeekly,
      isEnsuite: true,
    });
  }
  for (let i = 1; i <= sharedCount; i++) {
    rooms.push({
      id: `shared-${i}`,
      label: `Bedroom ${i}`,
      weeklyRate: sharedWeekly,
      isEnsuite: false,
    });
  }
  return rooms;
}

// Build inputs from a saved deal bundle.
//
// Reads the real schema: deals.list_price, deal_rooms.room_type
// and weekly_rate, and the cached padsplit_market row for the ZIP.
// A room with a null weekly_rate falls back to the market rate for
// its type, which is the same rule lib/proforma.js applies.
//
// Only rooms that are actually rentable count. deal_rooms carries
// bathrooms, kitchen, laundry and garage as rows too, and counting
// those as bedrooms would inflate income by half.
// An ensuite bedroom contains a bathroom. deals.bathrooms counts only
// the shared and common ones, so the true total is that plus the
// ensuite count — 229 S Ash reads 1 in the record and 7 on the floor
// plan, and 7 is right.
//
// The room schedule wins when it exists: each 'bath' row plus each
// 'ensuite' row is one bathroom. It's the same data the plan is drawn
// from, so the sheet and the drawing can't disagree.
export function totalBathrooms(deal = {}, rooms = []) {
  const list = Array.isArray(rooms) ? rooms : [];
  if (list.length) {
    const baths = list.filter((r) => r.room_type === "bath").length;
    const ensuites = list.filter((r) => r.room_type === "ensuite").length;
    if (baths + ensuites > 0) return baths + ensuites;
  }

  const shared = Number(deal.bathrooms) || 0;
  const ensuite = Number(deal.ensuite_count) || 0;

  // If someone has already entered the total, don't double-count: an
  // ensuite count that fits inside the bath count means it was read as
  // "of those, ensuites" rather than as a separate figure.
  return ensuite && ensuite <= shared ? shared : shared + ensuite;
}

// org_assumptions is where the real lender terms live — the same rows
// lib/proforma.js reads for the deal-page pro forma. The club sheet
// used its own hardcoded defaults, so the two documents disagreed
// about the same loan. They read the same source now.
export function inputsFromDeal({ deal = {}, rooms = [], market = null, org = null } = {}, opts = {}) {
  // Whose price is this?
  //
  // deals.purchase_price is the acquisition cost — seller-confidential.
  // deals.list_price is the turnkey price a buyer actually pays.
  //
  // A buyer-facing sheet must use list_price or it both leaks the
  // spread and computes returns on a basis nobody can buy at. Seller
  // view falls back to purchase_price so an early-stage deal with no
  // list price set is still underwritable internally.
  const forBuyer = opts.audience !== "seller";

  const price = forBuyer
    ? Number(deal.list_price) || Number(deal.purchase_price) || 540000
    : Number(deal.purchase_price) || Number(deal.list_price) || 540000;

  const sharedWeekly = Number(market?.shared_weekly) || 204;
  const privateWeekly = Number(market?.private_weekly) || 290;

  const rentable = rooms.filter(
    (r) => r.room_type === "shared" || r.room_type === "ensuite"
  );

  const built = rentable.length
    ? rentable.map((r, i) => {
        const ensuite = r.room_type === "ensuite";
        return {
          id: r.id || `room-${i + 1}`,
          label: r.label || `Bedroom ${r.room_number ?? i + 1}`,
          weeklyRate:
            Number(r.weekly_rate) || (ensuite ? privateWeekly : sharedWeekly),
          isEnsuite: ensuite,
        };
      })
    : buildRooms(8, sharedWeekly, 1, privateWeekly);

  const beds = built.length;

  // The market row carries the ZIP's real occupancy. Base case uses
  // it when present rather than a house assumption.
  const marketOcc = Number(market?.avg_occupancy);
  const baseOcc = marketOcc > 0 && marketOcc <= 1 ? marketOcc : 0.87;

  const expenses = buildColivingExpenses(beds, {}, org, deal);

  return {
    property: {
      name: deal.address_line || "Untitled deal",
      address: deal.address_line || "",
      city: deal.city || "",
      state: deal.state || "AZ",
      zip: deal.zip || "",
      beds,
      baths: totalBathrooms(deal, rooms),
      sharedBaths: Number(deal.bathrooms) || 0,
      ensuiteBaths: Number(deal.ensuite_count) || 0,
      sqft: Number(deal.post_reno_sqft) || Number(deal.living_area_sqft) || 0,
      assessorSqft: Number(deal.living_area_sqft) || null,
      yearBuilt: Number(deal.year_built) || null,
    },
    capitalization: {
      purchasePrice: price,
      // Rehab and furniture budgets are seller-side costs. They are
      // deliberately not read here — a turnkey buyer's basis is the
      // list price, and surfacing those figures would expose margin.
      ltv: orgValue(org, "ltv", 0.75),
      // closing_costs is stored as a dollar figure, so convert. Values
      // under 1 are already a fraction.
      closingCostPct: (() => {
        const cc = orgValue(org, "closing_costs", null);
        if (cc === null) return 0.01;
        return cc > 1 ? (price ? cc / price : 0.01) : cc;
      })(),
      loanCostPct: orgValue(org, "origination_points", 0.015),
      // Reserves are not part of what a buyer brings to this table —
      // the lender's capital requirement is down payment, origination
      // and closing. Carrying a further 10% of price made the sheet
      // demand far more equity than the loan actually does.
      vacancyReservePct: 0,
      maintenanceReservePct: 0,
      // No syndication fee on a direct purchase. A buyer running this
      // through a fund structure sets their own.
      platformFeePct: 0,
      capitalizeReserves: false,
      conversionCapex: 0,
      furnishingCost: 0,
    },
    // Amortizing, not interest-only. The real product is a 30-year
    // DSCR loan, and interest-only understated debt service by roughly
    // $300 a month on a $431K balance — flattering every coverage and
    // cash-flow figure on the sheet.
    debt: {
      interestRatePct: orgValue(org, "interest_rate", 0.065) * 100,
      interestOnly: false,
      amortizationMonths: orgValue(org, "loan_term_years", 30) * 12,
    },
    // Off by default. A year-5 refinance at a rate nobody has quoted
    // was contributing a large share of the ten-year IRR.
    refinance: {
      enabled: false,
      year: 5,
      ltv: orgValue(org, "ltv", 0.75),
      interestRatePct: 5.0,
      loanCostPct: 0.02,
      interestOnly: false,
    },
    exit: { holdYears: 10, appreciationPct: 0.03, brokerFeePct: 0.03, otherClosingPct: 0.02 },
    scenarios: {
      // Our own underwriting standard: vacancy_rate from
      // org_assumptions rather than whatever the ZIP is running. This
      // is the case the deal-page pro forma uses, so the two documents
      // agree on the number we hold ourselves to.
      glbm: {
        income: {
          rooms: built,
          occupancyPct: 1 - orgValue(org, "vacancy_rate", 0.05),
          collectionsPct: 0.97,
          platform: PADSPLIT_FEES,
          growthPct: 0.03,
        },
        expenses,
        exit: { appreciationPct: orgValue(org, "appreciation_rate", 0.03) },
      },
      bear: {
        income: {
          rooms: built,
          occupancyPct: Math.max(0.6, baseOcc - 0.07),
          collectionsPct: 0.95,
          platform: { ...PADSPLIT_FEES, turnsPerRoomPerYear: 2.5 },
          growthPct: 0.02,
        },
        expenses: { ...expenses, growthPct: 0.04 },
        exit: { appreciationPct: 0.02 },
      },
      base: {
        income: {
          rooms: built,
          occupancyPct: baseOcc,
          collectionsPct: 0.97,
          platform: PADSPLIT_FEES,
          growthPct: 0.03,
        },
        expenses,
        exit: { appreciationPct: 0.03 },
      },
      bull: {
        income: {
          rooms: built,
          occupancyPct: Math.min(0.97, baseOcc + 0.06),
          collectionsPct: 0.98,
          platform: { ...PADSPLIT_FEES, turnsPerRoomPerYear: 1.5 },
          growthPct: 0.04,
        },
        expenses: { ...expenses, growthPct: 0.02 },
        exit: { appreciationPct: 0.04 },
      },
    },
  };
}

// Recast the same house the way a syndicator's template does: one
// flat monthly catch-all, management at 8%, lighter taxes and
// insurance. Same income, same debt — only the operating stack moves.
//
// This is not a straw man. It is what the published calculators do,
// and a buyer comparing your sheet to a competitor's needs to see
// both numbers or yours reads as the weaker deal.
export function toTemplateLens(inputs, monthlyMisc = 1000) {
  const flat = buildBenchmarkExpenses(monthlyMisc, {
    propertyTaxesAnnual: inputs.scenarios.base.expenses.propertyTaxesAnnual,
  });
  return {
    ...inputs,
    scenarios: {
      // Our own underwriting standard: vacancy_rate from
      // org_assumptions rather than whatever the ZIP is running. This
      // is the case the deal-page pro forma uses, so the two documents
      // agree on the number we hold ourselves to.
      glbm: {
        income: {
          rooms: built,
          occupancyPct: 1 - orgValue(org, "vacancy_rate", 0.05),
          collectionsPct: 0.97,
          platform: PADSPLIT_FEES,
          growthPct: 0.03,
        },
        expenses,
        exit: { appreciationPct: orgValue(org, "appreciation_rate", 0.03) },
      },
      bear: { ...inputs.scenarios.bear, expenses: { ...flat, growthPct: 0.03 } },
      base: { ...inputs.scenarios.base, expenses: flat },
      bull: { ...inputs.scenarios.bull, expenses: { ...flat, growthPct: 0.02 } },
    },
  };
}

// 1541 W Pepper Pl, Mesa AZ 85201 — 9 bed / 4 bath, one ensuite.
// A worked example for the demo route. Real houses come from the
// deals table via /proforma-club/[slug].
export function pepperPlaceInputs() {
  return inputsFromDeal({
    deal: {
      address_line: "1541 W Pepper Pl",
      city: "Mesa",
      state: "AZ",
      zip: "85201",
      bathrooms: 4,
      post_reno_sqft: 2450,
      living_area_sqft: 1660,
      year_built: 1953,
      list_price: 540000,
    },
    rooms: [
      { id: "e1", room_number: 1, label: "Ensuite", room_type: "ensuite" },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `s${i + 1}`,
        room_number: i + 2,
        label: `Bedroom ${i + 2}`,
        room_type: "shared",
      })),
    ],
    market: {
      zip: "85201",
      shared_weekly: 204,
      private_weekly: 290,
      avg_occupancy: 0.87,
    },
  });
}


// Saved inputs win over computed defaults, but the price is always
// re-derived: a buyer must see list, and a sheet saved months ago
// shouldn't quote a stale figure if the property has been repriced.
export function applySavedInputs(base, saved, { audience = "buyer" } = {}) {
  if (!saved || typeof saved !== "object") return base;

  const merged = {
    ...base,
    ...saved,
    property: base.property,
    capitalization: {
      ...base.capitalization,
      ...(saved.capitalization || {}),
      purchasePrice: base.capitalization.purchasePrice,
    },
    debt: { ...base.debt, ...(saved.debt || {}) },
    refinance: { ...base.refinance, ...(saved.refinance || {}) },
    exit: { ...base.exit, ...(saved.exit || {}) },
    scenarios: {
      ...(base.scenarios.glbm
        ? { glbm: mergeScenario(base.scenarios.glbm, saved.scenarios?.glbm) }
        : {}),
      bear: mergeScenario(base.scenarios.bear, saved.scenarios?.bear),
      base: mergeScenario(base.scenarios.base, saved.scenarios?.base),
      bull: mergeScenario(base.scenarios.bull, saved.scenarios?.bull),
    },
  };

  // A sponsor fee only belongs on a syndicated offering.
  if (audience === "buyer") merged.capitalization.platformFeePct = 0;
  return merged;
}

function mergeScenario(baseSc, savedSc) {
  if (!savedSc) return baseSc;
  return {
    ...baseSc,
    ...savedSc,
    income: {
      ...baseSc.income,
      ...(savedSc.income || {}),
      platform: { ...baseSc.income.platform, ...(savedSc.income?.platform || {}) },
      // Room count follows the schedule, not a saved snapshot — a room
      // added since the save must appear.
      rooms: baseSc.income.rooms.map((r, i) => ({
        ...r,
        weeklyRate: savedSc.income?.rooms?.[i]?.weeklyRate ?? r.weeklyRate,
      })),
    },
    expenses: { ...baseSc.expenses, ...(savedSc.expenses || {}) },
    exit: { ...baseSc.exit, ...(savedSc.exit || {}) },
  };
}

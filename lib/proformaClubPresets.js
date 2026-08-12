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

export function buildColivingExpenses(bedCount, overrides = {}) {
  return {
    propertyTaxesAnnual: 3000,
    insuranceAnnual: 3500,
    hoaAnnual: 0,
    utilitiesAnnual: COLIVING_OPEX_PER_BED.utilities * bedCount,
    repairsMaintenanceAnnual: COLIVING_OPEX_PER_BED.repairsMaintenance * bedCount,
    turnoverAnnual: COLIVING_OPEX_PER_BED.turnover * bedCount,
    commonAreaCleaningAnnual: COLIVING_OPEX_PER_BED.commonAreaCleaning * bedCount,
    landscapingPestAnnual: COLIVING_OPEX_PER_BED.landscapingPest * bedCount,
    suppliesAnnual: COLIVING_OPEX_PER_BED.supplies * bedCount,
    // Self-managed by default.
    managementPctOfNet: 0,
    capexReservePctOfNet: 0.04,
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

// Build inputs from a saved deal plus its rooms. Falls back to the
// 85201 market rates where a room has no rate of its own.
export function inputsFromDeal(deal = {}, rooms = [], opts = {}) {
  const built = rooms.length
    ? rooms.map((r, i) => ({
        id: r.id || `room-${i + 1}`,
        label: r.name || `Bedroom ${i + 1}`,
        weeklyRate: Number(r.weekly_rate) || (r.is_ensuite ? 290 : 204),
        isEnsuite: Boolean(r.is_ensuite),
      }))
    : buildRooms(8, 204, 1, 290);

  const beds = built.length;
  const price = Number(deal.purchase_price) || Number(opts.price) || 540000;
  const expenses = buildColivingExpenses(beds);

  return {
    property: {
      name: deal.name || opts.name || "Untitled deal",
      address: deal.address || "",
      city: deal.city || "Mesa",
      state: deal.state || "AZ",
      beds,
      baths: Number(deal.baths) || 4,
      sqft: Number(deal.sqft) || 0,
      assessorSqft: Number(deal.assessor_sqft) || null,
      yearBuilt: Number(deal.year_built) || null,
    },
    capitalization: {
      purchasePrice: price,
      ltv: 0.75,
      closingCostPct: 0.05,
      loanCostPct: 0.05,
      vacancyReservePct: 0.05,
      maintenanceReservePct: 0.05,
      // No syndication fee on a direct acquisition.
      platformFeePct: 0,
      capitalizeReserves: true,
      conversionCapex: Number(deal.conversion_capex) || 0,
      furnishingCost: Number(deal.furnishing_cost) || 0,
    },
    debt: { interestRatePct: 6.75, interestOnly: true, amortizationMonths: 360 },
    refinance: {
      enabled: true,
      year: 5,
      ltv: 0.75,
      interestRatePct: 5.0,
      loanCostPct: 0.02,
      interestOnly: true,
    },
    exit: { holdYears: 10, appreciationPct: 0.03, brokerFeePct: 0.03, otherClosingPct: 0.02 },
    scenarios: {
      bear: {
        income: {
          rooms: built,
          occupancyPct: 0.8,
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
          // PadSplit's own 85201 figure.
          occupancyPct: 0.87,
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
          occupancyPct: 0.93,
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

// 1541 W Pepper Pl, Mesa AZ 85201 — 9 bed / 4 bath, one ensuite.
// Rates are PadSplit's published 85201 averages.
export function pepperPlaceInputs() {
  const inputs = inputsFromDeal(
    {
      name: "1541 W Pepper Pl",
      address: "1541 W Pepper Pl",
      city: "Mesa",
      state: "AZ",
      baths: 4,
      sqft: 2450,
      assessor_sqft: 1660,
      year_built: 1953,
      purchase_price: 540000,
    },
    []
  );
  return inputs;
}

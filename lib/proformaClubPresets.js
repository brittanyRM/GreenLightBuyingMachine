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

// Build inputs from a saved deal bundle.
//
// Reads the real schema: deals.purchase_price, deal_rooms.room_type
// and weekly_rate, and the cached padsplit_market row for the ZIP.
// A room with a null weekly_rate falls back to the market rate for
// its type, which is the same rule lib/proforma.js applies.
//
// Only rooms that are actually rentable count. deal_rooms carries
// bathrooms, kitchen, laundry and garage as rows too, and counting
// those as bedrooms would inflate income by half.
export function inputsFromDeal({ deal = {}, rooms = [], market = null } = {}) {
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
  const price = Number(deal.purchase_price) || 540000;

  // The market row carries the ZIP's real occupancy. Base case uses
  // it when present rather than a house assumption.
  const marketOcc = Number(market?.avg_occupancy);
  const baseOcc = marketOcc > 0 && marketOcc <= 1 ? marketOcc : 0.87;

  const expenses = buildColivingExpenses(beds);

  return {
    property: {
      name: deal.address_line || "Untitled deal",
      address: deal.address_line || "",
      city: deal.city || "",
      state: deal.state || "AZ",
      zip: deal.zip || "",
      beds,
      baths: Number(deal.bathrooms) || 0,
      sqft: Number(deal.post_reno_sqft) || Number(deal.living_area_sqft) || 0,
      assessorSqft: Number(deal.living_area_sqft) || null,
      yearBuilt: Number(deal.year_built) || null,
    },
    capitalization: {
      purchasePrice: price,
      ltv: 0.75,
      closingCostPct: 0.05,
      loanCostPct: 0.05,
      vacancyReservePct: 0.05,
      maintenanceReservePct: 0.05,
      // No syndication fee on a direct purchase. A buyer running this
      // through a fund structure sets their own.
      platformFeePct: 0,
      capitalizeReserves: true,
      conversionCapex: 0,
      furnishingCost: 0,
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
      purchase_price: 540000,
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

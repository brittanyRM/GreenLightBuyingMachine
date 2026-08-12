/**
 * GLBM Club-Format Pro Forma — presets and defaults
 *
 * Change BENCHMARK_LABEL in one place to relabel every reference in the UI.
 * Keep it generic in anything investor-facing.
 */

import type {
  ExpenseAssumptions,
  PlatformFees,
  ProformaInputs,
  Room,
} from './types';

/**
 * Labels.
 *
 * INTERNAL_LABEL names the benchmark this format was derived from. It is for
 * your own screens only — never put it on anything an investor or lender sees,
 * and never pair it with another company's logo, wordmark, or colors.
 *
 * EXTERNAL_LABEL is what appears by default. Everything rendered outside your
 * admin views uses this one.
 *
 * Naming a competitor descriptively is generally fine; using their marks is not.
 * Worth 20 minutes with counsel before anything ships externally.
 */
export const INTERNAL_LABEL = 'Mogul format';
export const EXTERNAL_LABEL = 'GLBM pro forma';

/**
 * Resolve which label to show. Defaults to external so the internal one cannot
 * leak by omission — a caller has to opt in deliberately.
 */
export function resolveLabel(internal = false): string {
  return internal ? INTERNAL_LABEL : EXTERNAL_LABEL;
}

/** PadSplit's published host fee model: 10 days + 8%. */
export const PADSPLIT_FEES: PlatformFees = {
  serviceFeePct: 0.08,
  bookingFeeDays: 10,
  turnsPerRoomPerYear: 2,
  ensuiteTurnMultiplier: 0.75,
};

/** No platform fee — for straight long-term rentals underwritten in the same format. */
export const NO_PLATFORM_FEES: PlatformFees = {
  serviceFeePct: 0,
  bookingFeeDays: 0,
  turnsPerRoomPerYear: 0,
  ensuiteTurnMultiplier: 1,
};

/**
 * Per-bed co-living operating costs, Phoenix metro.
 * The benchmark template collapses all of this into one flat monthly line and
 * lands roughly 45% light on an 8–9 bed house. Build it up instead.
 */
export const COLIVING_OPEX_PER_BED = {
  utilities: 1_050,
  repairsMaintenance: 750,
  turnover: 260,
  commonAreaCleaning: 420,
  landscapingPest: 180,
  supplies: 130,
} as const;

export function buildColivingExpenses(
  bedCount: number,
  overrides: Partial<ExpenseAssumptions> = {}
): ExpenseAssumptions {
  return {
    propertyTaxesAnnual: 3_000,
    insuranceAnnual: 3_500,
    hoaAnnual: 0,
    utilitiesAnnual: COLIVING_OPEX_PER_BED.utilities * bedCount,
    repairsMaintenanceAnnual: COLIVING_OPEX_PER_BED.repairsMaintenance * bedCount,
    turnoverAnnual: COLIVING_OPEX_PER_BED.turnover * bedCount,
    commonAreaCleaningAnnual: COLIVING_OPEX_PER_BED.commonAreaCleaning * bedCount,
    landscapingPestAnnual: COLIVING_OPEX_PER_BED.landscapingPest * bedCount,
    suppliesAnnual: COLIVING_OPEX_PER_BED.supplies * bedCount,
    managementPctOfNet: 0,
    capexReservePctOfNet: 0.04,
    growthPct: 0.03,
    ...overrides,
  };
}

/**
 * Reproduces the benchmark's expense treatment: one flat monthly catch-all.
 * Included so the UI can show the two stacks side by side and quantify the gap.
 */
export function buildBenchmarkExpenses(
  monthlyMisc: number,
  overrides: Partial<ExpenseAssumptions> = {}
): ExpenseAssumptions {
  return {
    propertyTaxesAnnual: 1_800,
    insuranceAnnual: 3_000,
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

export function buildRooms(
  sharedCount: number,
  sharedWeekly: number,
  ensuiteCount: number,
  ensuiteWeekly: number
): Room[] {
  const rooms: Room[] = [];
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

/**
 * Seed deal: 1541 W Pepper Pl, Mesa AZ 85201.
 * Rates are PadSplit's published 85201 market averages; occupancy anchors on
 * the zip's 87% figure with bear/bull bracketing it.
 */
export function pepperPlaceInputs(): ProformaInputs {
  const rooms = buildRooms(8, 204, 1, 290);
  const beds = rooms.length;

  const baseExpenses = buildColivingExpenses(beds);

  return {
    property: {
      name: '1541 W Pepper Pl',
      address: '1541 W Pepper Pl',
      city: 'Mesa',
      state: 'AZ',
      beds,
      baths: 4,
      sqft: 2_450,
      assessorSqft: 1_660,
      yearBuilt: 1953,
    },
    capitalization: {
      purchasePrice: 540_000,
      ltv: 0.75,
      closingCostPct: 0.05,
      loanCostPct: 0.05,
      vacancyReservePct: 0.05,
      maintenanceReservePct: 0.05,
      platformFeePct: 0,
      capitalizeReserves: true,
      conversionCapex: 0,
      furnishingCost: 0,
    },
    debt: {
      interestRatePct: 6.75,
      interestOnly: true,
      amortizationMonths: 360,
    },
    refinance: {
      enabled: true,
      year: 5,
      ltv: 0.75,
      interestRatePct: 5.0,
      loanCostPct: 0.02,
      interestOnly: true,
    },
    exit: {
      holdYears: 10,
      appreciationPct: 0.03,
      brokerFeePct: 0.03,
      otherClosingPct: 0.02,
    },
    scenarios: {
      bear: {
        income: {
          rooms,
          occupancyPct: 0.8,
          collectionsPct: 0.95,
          platform: { ...PADSPLIT_FEES, turnsPerRoomPerYear: 2.5 },
          growthPct: 0.02,
        },
        expenses: { ...baseExpenses, growthPct: 0.04 },
        exit: { appreciationPct: 0.02 },
      },
      base: {
        income: {
          rooms,
          occupancyPct: 0.87,
          collectionsPct: 0.97,
          platform: PADSPLIT_FEES,
          growthPct: 0.03,
        },
        expenses: baseExpenses,
        exit: { appreciationPct: 0.03 },
      },
      bull: {
        income: {
          rooms,
          occupancyPct: 0.93,
          collectionsPct: 0.98,
          platform: { ...PADSPLIT_FEES, turnsPerRoomPerYear: 1.5 },
          growthPct: 0.04,
        },
        expenses: { ...baseExpenses, growthPct: 0.02 },
        exit: { appreciationPct: 0.04 },
      },
    },
  };
}

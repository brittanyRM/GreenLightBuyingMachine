/**
 * GLBM Club-Format Pro Forma — public surface
 *
 * Import from this barrel rather than reaching into individual files, so
 * internals can move without touching call sites.
 *
 * Call sites use relative paths (e.g. '../../lib/proforma-club') so nothing
 * depends on a tsconfig path alias being configured.
 */

export * from './types';
export {
  amortizedBalance,
  amortizedPayment,
  computeCapitalization,
  computeExpenses,
  computeIncome,
  fmtCurrency,
  fmtMultiple,
  fmtPercent,
  irr,
  runProforma,
  runScenario,
} from './engine';
export {
  COLIVING_OPEX_PER_BED,
  EXTERNAL_LABEL,
  INTERNAL_LABEL,
  NO_PLATFORM_FEES,
  PADSPLIT_FEES,
  buildBenchmarkExpenses,
  buildColivingExpenses,
  buildRooms,
  pepperPlaceInputs,
  resolveLabel,
} from './presets';

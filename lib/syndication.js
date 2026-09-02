// ============================================================
// Syndication maths.
//
// Everything here is a function over cash flows that already exist.
// It does not compute NOI, debt service, or an exit price — those come
// from the pro forma engine, and a second opinion about them is how a
// flyer and a pro forma end up disagreeing about the same house.
//
// What a syndicator needs that a buyer does not: the raise is larger
// than the cash to close, because sponsor fees and reserves have to be
// raised too; and the return an investor sees is not the return the
// project makes, because the pref and the promote sit in between.
// ============================================================

// A buyer needs the cash to close. A raise needs that plus the fees
// the sponsor is paid at closing and the reserve that carries the
// property through lease-up. PadSplit's own figure for this kind of
// property is around 45 days to 80% booked, so a deal funded to the
// closing table and no further is a deal that misses its first
// distribution.
export function sourcesAndUses({
  price,
  loan,
  cashToClose,
  acquisitionFeePct = 0.02,
  offeringCost = 20000,
  reserveMonths = 3,
  monthlyDebtService = 0,
  monthlyOpex = 0,
}) {
  const acquisitionFee = price * acquisitionFeePct;
  const reserve = Math.round((monthlyDebtService + monthlyOpex) * reserveMonths);
  const raise = cashToClose + acquisitionFee + offeringCost + reserve;
  return {
    cashToClose,
    acquisitionFee,
    offeringCost,
    reserve,
    raise,
    loan,
    totalCapitalization: raise + loan,
    // The number that decides whether one house is worth syndicating
    // on its own. Offering cost barely moves with deal size, so on a
    // small raise it is a double-digit percentage of the money in.
    offeringDragPct: raise > 0 ? offeringCost / raise : 0,
  };
}

// Standard American waterfall: accrued preferred return first, then
// return of capital, then a split of what remains.
//
// The pref accrues on unreturned capital and carries forward when a
// year cannot pay it — a year that pays nothing does not forgive what
// was owed, it defers it. Getting that wrong overstates the promote.
export function waterfall(projectCashFlows, { pref = 0.08, lpSplit = 0.7 } = {}) {
  const raise = -projectCashFlows[0];
  let unreturned = raise;
  let accrued = 0;

  const lp = [-raise];
  const gp = [0];
  const detail = [];

  for (const cf of projectCashFlows.slice(1)) {
    accrued += unreturned * pref;

    let remaining = Math.max(cf, 0);
    let toLp = 0;
    let toGp = 0;

    const prefPaid = Math.min(remaining, accrued);
    toLp += prefPaid;
    accrued -= prefPaid;
    remaining -= prefPaid;

    const capitalPaid = Math.min(remaining, unreturned);
    toLp += capitalPaid;
    unreturned -= capitalPaid;
    remaining -= capitalPaid;

    if (remaining > 0) {
      toLp += remaining * lpSplit;
      toGp += remaining * (1 - lpSplit);
    }

    lp.push(toLp);
    gp.push(toGp);
    detail.push({
      cashFlow: cf,
      prefPaid,
      capitalPaid,
      split: remaining > 0 ? remaining : 0,
      accruedPrefCarried: accrued,
      unreturnedCapital: unreturned,
    });
  }

  const lpTotal = lp.slice(1).reduce((a, b) => a + b, 0);
  const gpTotal = gp.slice(1).reduce((a, b) => a + b, 0);

  return {
    lpCashFlows: lp,
    gpCashFlows: gp,
    detail,
    lpTotal,
    gpTotal,
    lpMultiple: raise > 0 ? lpTotal / raise : 0,
    lpIrr: irr(lp),
    projectIrr: irr(projectCashFlows),
    // True when the deal never cleared the pref, so the sponsor earns
    // nothing above it. Worth surfacing: it is the point at which the
    // sponsor's interest and the investor's stop being aligned by the
    // promote.
    promoteEarned: gpTotal > 0,
    unpaidPref: accrued,
  };
}

// Bisection rather than Newton. Slower and entirely fast enough for a
// ten-element array, and it cannot wander off on a sign change the way
// a derivative method can.
export function irr(cashFlows, { lo = -0.95, hi = 5, iterations = 200 } = {}) {
  if (!cashFlows.length || cashFlows[0] >= 0) return null;
  const npv = (r) => cashFlows.reduce((a, c, t) => a + c / (1 + r) ** t, 0);
  if (npv(lo) < 0) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (npv(mid) > 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

// The occupancy at which NOI stops covering debt service, and the one
// at which a typical 1.25 covenant is breached.
//
// For a whole-house rental this is a cliff: one tenant leaves and
// income is zero. Room-by-room, income steps down a ninth at a time,
// and the floor is far lower than most people expect. That difference
// is the structural case for co-living, so it is worth computing
// rather than asserting.
export function breakEven({ grossScheduledRent, variableExpensePct, fixedExpenses, annualDebtService }) {
  const solve = (target) => {
    // NOI(occ) = gsr*occ*(1 - varPct) - fixed, solved for
    // NOI = target * debtService.
    const denominator = grossScheduledRent * (1 - variableExpensePct);
    if (denominator <= 0) return null;
    const occ = (target * annualDebtService + fixedExpenses) / denominator;
    return occ > 0 ? occ : null;
  };
  return { dscr100: solve(1), dscr125: solve(1.25) };
}

// Fixed offering cost spread over more houses. The per-home economics
// do not change; what changes is how much of the raise is consumed
// before anything is bought.
export function portfolioDrag({ perHomeRaiseExOffering, offeringCost, counts = [1, 3, 5, 10] }) {
  return counts.map((n) => {
    const raise = perHomeRaiseExOffering * n + offeringCost;
    return { homes: n, raise, offeringCost, dragPct: offeringCost / raise };
  });
}

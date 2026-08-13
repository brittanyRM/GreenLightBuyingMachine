// ============================================================
// Second-position gap funding.
//
// The first lender covers a percentage of purchase and rehab. Whatever
// the borrower still has to bring to close is the gap, and that gap is
// what the second deed of trust funds.
//
// Reconciled against Brian's worked example (323,000 / 130,000 at 90%
// and 17%): 407,700 funded, $192.53/day, 17,327 for 90 days, 72,427
// total need — his sheet reads 408,000, 193/day, 17,370 and 73,000.
//
// Two things his written formula leaves out that the worksheet
// implies: the doc fee, and the stub interest between closing and the
// first of the following month. Both are included here and can be
// switched off.
//
// Pure functions, no imports.
// ============================================================

const DAY_BASIS = 360; // lender convention, not 365

export const GAP_DEFAULTS = {
  purchasePrice: 0,
  rehabBudget: 0,
  ltcPct: 0.9,          // first lender advances this share of both
  ratePct: 17,          // annual, first position
  docFee: 1500,
  earnestMoney: 5000,
  estClosingCosts: 4800,
  prepaidMonths: 3,
  includeStubInterest: true,
  closingDate: null,    // ISO date; drives the stub calculation
  roundUpTo: 5000,      // notes get written on round numbers
};

/** Days from closing to the 1st of the next month — interest owed at the table. */
export function stubDays(closingDate) {
  if (!closingDate) return 0;
  const d = new Date(closingDate);
  if (Number.isNaN(d.getTime())) return 0;
  const firstNext = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return Math.max(0, Math.round((firstNext - d) / 864e5));
}

export function computeGapFunding(input = {}) {
  const a = { ...GAP_DEFAULTS, ...input };

  const price = Number(a.purchasePrice) || 0;
  const rehab = Number(a.rehabBudget) || 0;
  const ltc = Number(a.ltcPct) || 0;
  const rate = Number(a.ratePct) || 0;

  // What the first lender advances.
  const firstOnPurchase = price * ltc;
  const firstOnRehab = rehab * ltc;
  const firstLoan = firstOnPurchase + firstOnRehab;

  // Interest accrues on the whole first-position balance, including the
  // rehab portion — lenders charge on the committed amount, not on
  // draws taken.
  const dailyInterest = (firstLoan * (rate / 100)) / DAY_BASIS;

  const prepaidDays = Math.round((Number(a.prepaidMonths) || 0) * 30);
  const prepaidInterest = dailyInterest * prepaidDays;

  const stub = a.includeStubInterest ? stubDays(a.closingDate) : 0;
  const stubInterest = dailyInterest * stub;

  // What the borrower brings.
  const downPayment = price * (1 - ltc);
  const rehabContribution = rehab * (1 - ltc);
  const docFee = Number(a.docFee) || 0;
  const earnest = Number(a.earnestMoney) || 0;
  const closing = Number(a.estClosingCosts) || 0;

  const cashToClose =
    downPayment + rehabContribution + docFee + earnest + closing;

  const totalNeed = cashToClose + prepaidInterest + stubInterest;

  const round = Number(a.roundUpTo) || 0;
  const recommendedNote = round
    ? Math.ceil(totalNeed / round) * round
    : Math.ceil(totalNeed);

  return {
    firstLoan,
    firstOnPurchase,
    firstOnRehab,
    dailyInterest,
    prepaidDays,
    prepaidInterest,
    stubDays: stub,
    stubInterest,
    downPayment,
    rehabContribution,
    docFee,
    earnest,
    closing,
    cashToClose,
    totalNeed,
    recommendedNote,
    cushion: recommendedNote - totalNeed,
    // All-in project cost, useful against ARV.
    totalProjectCost: price + rehab,
    combinedLtc: price + rehab ? (firstLoan + recommendedNote) / (price + rehab) : 0,
  };
}

/** The line items, ready to render or print. */
export function gapFundingRows(r) {
  return [
    { label: "Down payment", value: r.downPayment, note: "borrower share of purchase" },
    { label: "Rehab contribution", value: r.rehabContribution, note: "borrower share of budget" },
    { label: "Earnest money", value: r.earnest, note: "credited at closing" },
    { label: "Estimated closing costs", value: r.closing, note: "title and escrow" },
    { label: "Lender doc fee", value: r.docFee, note: null },
    {
      label: `Prepaid interest (${r.prepaidDays} days)`,
      value: r.prepaidInterest,
      note: "so no payment is due for the first months",
    },
    ...(r.stubDays
      ? [
          {
            label: `Interest to first of month (${r.stubDays} days)`,
            value: r.stubInterest,
            note: "owed at the table",
          },
        ]
      : []),
  ];
}

// The five steps, in the order they have to happen. Assignment first
// because nothing else can be drafted until the contract is in the
// buying entity's name.
export const LOAN_STEPS = [
  {
    id: "assignment",
    label: "Assignment",
    detail: "Assign the contract into the buying entity. Everything downstream names that entity.",
  },
  {
    id: "insurance",
    label: "Homeowner's insurance",
    detail: "Bind a policy with the lender named as mortgagee. Title needs the agent's details.",
  },
  {
    id: "loan_app",
    label: "Loan application",
    detail: "Purchase price, rehab budget, loan amount, closing date, entity and signer.",
  },
  {
    id: "prom_note",
    label: "Promissory note",
    detail: "Second position. Principal, rate, maturity and extension terms.",
  },
  {
    id: "email_title",
    label: "Email title",
    detail: "Send loan details and the insurance agent to escrow so they can prepare the statement.",
  },
];

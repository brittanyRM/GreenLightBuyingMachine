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

// ============================================================
// Payoff at exit.
//
// The gap loan accrues at 17% on the whole committed balance, so what
// is owed on the day the house sells is what decides whether a flip
// works. Nothing computed it — the worksheet stops at what the deal
// needs to close, which is the question at the start and not the one
// at the end.
//
// Interest is simple, not compounded, on the same 360-day basis the
// lender uses for prepaids. Prepaid months are credited: they were
// paid at the table, so they cannot be owed again.
// ============================================================
export function payoffSchedule(r, { months = 12, extensionFee = 0, extensionAfterMonths = 6 } = {}) {
  const principal = Number(r?.firstLoan) || 0;
  const daily = Number(r?.dailyInterest) || 0;
  const prepaidDays = Number(r?.prepaidDays) || 0;

  const out = [];
  for (let m = 1; m <= months; m++) {
    const days = m * 30;
    // Prepaid interest was handed over at closing, so the first
    // prepaidDays of the loan are already paid for.
    const unpaidDays = Math.max(0, days - prepaidDays);
    const accrued = daily * unpaidDays;
    const extensions =
      extensionFee && m > extensionAfterMonths
        ? Math.ceil((m - extensionAfterMonths) / 3) * extensionFee
        : 0;
    out.push({
      month: m,
      days,
      unpaidDays,
      accrued,
      extensions,
      payoff: principal + accrued + extensions,
      monthlyCarry: daily * 30,
    });
  }
  return out;
}

// ============================================================
// Sources and uses.
//
// Every dollar in against every dollar out, which is what a lender
// asks for and what makes an obvious hole obvious. Derived entirely
// from computeGapFunding — this is an arrangement of figures that
// already exist, not a second calculation of them, so it cannot
// disagree with the worksheet above it.
// ============================================================
export function sourcesAndUses(r, input = {}) {
  const a = { ...GAP_DEFAULTS, ...input };
  const price = Number(a.purchasePrice) || 0;
  const rehab = Number(a.rehabBudget) || 0;
  const earnest = Number(a.earnestMoney) || 0;

  // Earnest is NOT a separate source. It is already inside totalNeed —
  // the gap loan reimburses a deposit the borrower has already put up.
  // Counting it on both sides overstated funding by the deposit twice
  // and left the statement ten thousand dollars out on a deal where the
  // deposit was five.
  const sources = [
    {
      label: "First position loan",
      value: r.firstLoan,
      note: `${Math.round((Number(a.ltcPct) || 0) * 100)}% of purchase and rehab`,
    },
    { label: "Gap funding (second deed)", value: r.totalNeed, note: "this request" },
  ].filter((x) => x.value);

  const uses = [
    { label: "Purchase price", value: price, note: null },
    { label: "Rehab budget", value: rehab, note: "drawn as work completes" },
    { label: "Lender doc fee", value: r.docFee, note: null },
    { label: "Estimated closing costs", value: r.closing, note: "title and escrow" },
    { label: `Prepaid interest (${r.prepaidDays} days)`, value: r.prepaidInterest, note: null },
    r.stubInterest
      ? { label: `Interest to first of month (${r.stubDays} days)`, value: r.stubInterest, note: null }
      : null,
    // The deposit is already sitting in escrow and is credited to the
    // buyer at the table. It belongs on the uses side as a return, which
    // is what makes the two columns agree.
    earnest ? { label: "Earnest deposit returned to buyer", value: earnest, note: "already in escrow" } : null,
  ].filter((x) => x && x.value);

  const totalSources = sources.reduce((s, x) => s + x.value, 0);
  const totalUses = uses.reduce((s, x) => s + x.value, 0);

  return {
    sources,
    uses,
    totalSources,
    totalUses,
    // Zero when the worksheet is internally consistent. Anything else
    // is a figure that has gone astray, and it is shown rather than
    // rounded away — a sources and uses that does not balance is the
    // first thing a lender notices.
    difference: totalSources - totalUses,
  };
}

// ============================================================
// The email to title.
//
// Step five of Brian's list: "Email title the loan information and the
// insurance agent so they can prepare the statement." It is the only
// step of the five that produces no document, and every fact it needs
// already exists on the deal — so it was the one still being typed by
// hand from figures on another screen.
// ============================================================
// The form holds LTC as 90; the library holds it as 0.9. Both reach
// this file, and dividing by 100 either way turns a $108,000 holdback
// into $1,080 — which is exactly the kind of wrong that looks like a
// typo and gets read past.
export function ltcFraction(v, fallback = 0.9) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n > 1 ? n / 100 : n;
}

export function titleEmail({ deal, form, result, meta = {} }) {
  const usd = (n) =>
    Number.isFinite(Number(n))
      ? Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      : "—";
  const date = (d) => (d ? new Date(d).toLocaleDateString("en-US") : "TBD");

  const address = [deal?.address_line, deal?.city, deal?.state, deal?.zip]
    .filter(Boolean)
    .join(", ");

  const subject = `Loan and insurance details — ${deal?.address_line || "property"}${
    meta.escrowNumber ? ` (escrow ${meta.escrowNumber})` : ""
  }`;

  const body = [
    `Hi${meta.escrowOfficer ? ` ${meta.escrowOfficer}` : ""},`,
    ``,
    `Here are the loan and insurance details for ${address} so you can prepare the estimated closing statement.`,
    ``,
    `BUYER`,
    `  Entity: ${meta.buyer || "TBD"}`,
    ``,
    `FIRST POSITION`,
    `  Lender: ${form?.firstLenderName || "TBD"}`,
    `  Loan amount: ${usd(result?.firstLoan)}`,
    `  Rate: ${form?.ratePct ? `${form.ratePct}%` : "TBD"}`,
    `  Renovation holdback: ${usd((Number(form?.rehabBudget) || 0) * ltcFraction(form?.ltcPct))}`,
    `  Doc fee: ${usd(form?.docFee)}`,
    result?.stubDays
      ? `  Prepaid interest to the 1st (${result.stubDays} days): ${usd(result.stubInterest)}`
      : null,
    ``,
    meta.secondLender
      ? [
          `SECOND POSITION`,
          `  Lender: ${meta.secondLender}`,
          `  Loan amount: ${usd(result?.roundedNeed || result?.totalNeed)}`,
          ``,
        ].join("\n")
      : null,
    `INSURANCE`,
    `  Agent: ${meta.insuranceAgent || "TBD"}`,
    `  Agency: ${meta.insuranceAgency || "TBD"}`,
    `  Phone: ${meta.insurancePhone || "TBD"}`,
    `  Email: ${meta.insuranceEmail || "TBD"}`,
    `  The policy names the lender above as mortgagee.`,
    ``,
    `CLOSING`,
    `  Target closing date: ${date(form?.closingDate)}`,
    ``,
    `Please send the estimated statement when you have it and let me know if anything is missing.`,
    ``,
    `Thank you,`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, body };
}

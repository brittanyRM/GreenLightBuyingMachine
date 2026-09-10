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
  const rehab = Number(form?.rehabBudget) || 0;
  const firstLender = form?.firstLenderName || "the hard money lender";

  const subject = `${deal?.address_line || "Property"} — loan docs, second deed and insurance${
    meta.escrowNumber ? ` (escrow ${meta.escrowNumber})` : ""
  }`;

  // Recipients, in the order Brian names them: the title agent leads,
  // everyone who has to act is copied so nobody waits on a forward.
  const to = [meta.titleAgent].filter(Boolean);
  const cc = [
    meta.firstLenderContact && `${meta.firstLenderContact} (${firstLender})`,
    meta.secondLenderContact && `${meta.secondLenderContact} (second position)`,
    meta.insuranceAgent && `${meta.insuranceAgent} (insurance)`,
    "Brian and Gina Kingdeski",
  ].filter(Boolean);

  const body = [
    `${meta.titleAgent ? `${meta.titleAgent},` : "Hello,"}`,
    ``,
    `Please see the attached for ${address}${
      meta.escrowNumber ? ` (escrow ${meta.escrowNumber})` : ""
    }. Everything you should need is below or attached — let me know if anything is missing rather than waiting on us.`,
    ``,
    meta.secondLenderContact
      ? `SECOND DEED OF TRUST\n  Attached is the promissory note. Please draw up a second deed of trust for ${
          meta.secondLender || meta.secondLenderContact
        }, copied here, and send them wiring instructions.`
      : null,
    meta.secondLenderContact ? `` : null,
    `FIRST POSITION`,
    `  ${firstLender}${meta.firstLenderContact ? ` — ${meta.firstLenderContact}, copied here` : ""}`,
    `  ${meta.firstLenderContact ? "They will send you all the loan documents you need." : "Loan documents to follow."}`,
    `  Loan amount: ${usd(result?.firstLoan)}${form?.ratePct ? ` at ${form.ratePct}%` : ""}`,
    rehab ? `  Renovation holdback: ${usd(rehab * ltcFraction(form?.ltcPct))}` : null,
    ``,
    `INSURANCE`,
    meta.insuranceAgent
      ? `  ${meta.insuranceAgent}, copied here — please put a policy together for this flip. The repair amount is ${usd(
          rehab
        )}.`
      : `  Agent: TBD`,
    `  ${firstLender} is named as mortgagee and additional insured.`,
    `  Please pay the homeowner's premium at closing.`,
    ``,
    `CLOSING`,
    `  Target close of escrow: ${date(form?.closingDate)}`,
    ``,
    `ATTACHED`,
    meta.secondLenderContact ? `  Promissory note` : null,
    `  Assignment`,
    `  Operating agreement for the buying entity`,
    ``,
    `Thank you,`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, body, to, cc };
}

// ============================================================
// Points or no points.
//
// Sound Capital offer 17% with no points or 12% with two points, and
// which is cheaper depends entirely on how long the house is held —
// Brian puts the crossover at about four and a half months. Nothing
// computed it, so the choice was being made from memory on a figure
// that moves with the loan size.
// ============================================================
export function pointsComparison(r, { noPointsRate = 17, pointsRate = 12, points = 2, months = 12 } = {}) {
  const principal = Number(r?.firstLoan) || 0;
  if (!principal) return { rows: [], breakEvenMonths: null };

  const pointsCost = principal * (points / 100);
  const dailyA = (principal * (noPointsRate / 100)) / DAY_BASIS;
  const dailyB = (principal * (pointsRate / 100)) / DAY_BASIS;

  const rows = [];
  let breakEvenMonths = null;
  for (let m = 1; m <= months; m++) {
    const days = m * 30;
    const costA = dailyA * days;
    const costB = dailyB * days + pointsCost;
    if (breakEvenMonths === null && costB <= costA) breakEvenMonths = m;
    rows.push({ month: m, noPoints: costA, withPoints: costB, saving: costA - costB });
  }
  return { rows, breakEvenMonths, pointsCost, dailyA, dailyB };
}

// ============================================================
// A calculator link that arrives already loaded with a deal.
//
// The calculator is a what-if tool and starts blank, which is right
// when you open it from the nav to think about a house you haven't
// bought. Opening it from a deal is a different intention: you want
// to push on THAT house's numbers, and retyping nine fields from the
// screen you just left is how they end up not matching it.
//
// The payload is the same base64 ?p= the share button produces, so
// this uses the format the calculator already round-trips rather than
// inventing a second one.
// ============================================================
export function calculatorLinkFor({ deal, rooms = [], market, price, occupancyPct } = {}) {
  if (!deal) return "/buyer-calculator.html";

  const ens = rooms.filter((r) => r.room_type === "ensuite");
  const shared = rooms.filter((r) => r.room_type === "shared");
  const rateOf = (list) => (list.length ? Math.round(Number(list[0].weeklyRate) || 0) : 0);

  const sqft =
    Number(deal.finished_sqft) || Number(deal.post_reno_sqft) || Number(deal.living_area_sqft) || "";

  // Only fields the calculator knows. An unknown key would be written
  // into a field that doesn't exist and silently ignored, which is
  // harmless but makes the link look like it carries more than it does.
  const payload = {
    addr: [deal.address_line, deal.city && `${deal.city}, ${deal.state} ${deal.zip}`]
      .filter(Boolean)
      .join(", "),
    price: String(Math.round(Number(price ?? deal.list_price) || 0)),
    sqft: sqft ? String(Math.round(sqft)) : "",
    ecount: String(ens.length || Number(deal.target_ensuites) || 0),
    erate: String(rateOf(ens) || Math.round(Number(deal.ensuite_weekly_rate) || 0)),
    scount: String(
      shared.length ||
        Math.max(0, (Number(deal.target_bedrooms) || 0) - (Number(deal.target_ensuites) || 0))
    ),
    srate: String(rateOf(shared) || Math.round(Number(deal.shared_weekly_rate) || 0)),
    occ: String(Math.round((occupancyPct ?? 0.95) * 100)),
    zip: deal.zip || "",
  };

  for (const k of Object.keys(payload)) {
    if (payload[k] === "" || payload[k] === "0") delete payload[k];
  }

  let encoded;
  try {
    const json = JSON.stringify(payload);
    encoded =
      typeof window === "undefined"
        ? Buffer.from(json, "utf8").toString("base64")
        : btoa(unescape(encodeURIComponent(json)));
  } catch {
    return "/buyer-calculator.html";
  }
  return `/buyer-calculator.html?p=${encoded}`;
}

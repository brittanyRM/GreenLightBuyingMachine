"use client";

// ============================================================
// Estimated closing statement.
//
// Modelled on the Magnus Title form already in use — same sections, in
// the same order, with the same two-column debit/credit layout, so a
// figure can be read across from ours to theirs without translating.
//
// CONFIDENTIAL. This carries acquisition cost, lender terms and party
// contacts. Reached only from /financing/[slug], which sits behind team
// auth, and no buyer route imports it.
//
// It is an estimate the way title's own is an estimate: a working
// figure for the funds a deal needs, produced before escrow issues the
// real one. It does not replace theirs, and the acknowledgement at the
// foot says so in the same words the title company uses.
// ============================================================

const INK = "#141914";

const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";

const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US") : "__/__/____";

// A charge lands in one of these, in this order. Matching title's
// grouping means a line can be checked against theirs without hunting.
const SECTIONS = [
  "Primary Charges & Credits",
  "Loan Charges",
  "Title Charges",
  "Escrow Charges",
  "Miscellaneous Charges",
];

function Row({ label, sellerDebit, sellerCredit, buyerDebit, buyerCredit, bold }) {
  const cls = bold ? "font-bold text-neutral-900" : "text-neutral-800";
  return (
    <tr className="print-keep">
      <td className={`w-[11%] px-2 py-[3px] text-right tabular-nums ${cls}`}>
        {sellerDebit ? usd(sellerDebit) : ""}
      </td>
      <td className={`w-[11%] px-2 py-[3px] text-right tabular-nums ${cls}`}>
        {sellerCredit ? usd(sellerCredit) : ""}
      </td>
      <td className={`px-3 py-[3px] text-[11px] ${cls}`}>{label}</td>
      <td className={`w-[11%] px-2 py-[3px] text-right tabular-nums ${cls}`}>
        {buyerDebit ? usd(buyerDebit) : ""}
      </td>
      <td className={`w-[11%] px-2 py-[3px] text-right tabular-nums ${cls}`}>
        {buyerCredit ? usd(buyerCredit) : ""}
      </td>
    </tr>
  );
}

export function ClosingStatement({ deal, form, result, lines = [], meta = {}, audience = "internal" }) {
  // The acquisition statement carries our basis and must stay marked.
  // The buyer's own statement carries none of it and goes to their
  // lender — banding it Confidential would be both wrong and alarming
  // to the person it is addressed to.
  const isBuyerFacing = audience === "buyer";
  const price = Number(form?.purchasePrice) || Number(deal?.purchase_price) || 0;
  const earnest = Number(form?.earnestMoney) || 0;

  const rows = lines.filter((l) => l && l.label);

  // Totals are summed from the rows rather than carried alongside them.
  // A statement whose subtotal disagrees with its own lines is worse
  // than one with no subtotal, and the only way to guarantee it agrees
  // is to compute it from what is printed.
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const sellerDebit = sum("sellerDebit");
  const sellerCredit = sum("sellerCredit");
  const buyerDebit = sum("buyerDebit");
  const buyerCredit = sum("buyerCredit");

  const dueFromBuyer = Math.max(0, buyerDebit - buyerCredit);
  const dueToSeller = Math.max(0, sellerCredit - sellerDebit);

  const address = [deal?.address_line, deal?.city && `${deal.city}, ${deal.state} ${deal.zip}`]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="print-doc print-section bg-white p-6 text-neutral-900 sm:p-10">
      {/* Prints. It was inside no-print, which meant the marking
          vanished at exactly the moment the document became a PDF
          someone could attach to an email — the only moment it matters. */}
      {!isBuyerFacing && (
        <div
          className="print-keep mb-4 flex items-center gap-2 rounded px-4 py-2"
          style={{ backgroundColor: INK }}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
            Confidential — not for buyer distribution
          </span>
          <span className="text-[10px] text-neutral-400">
            Internal estimate; escrow issues the statement of record
          </span>
        </div>
      )}

      <div className="mb-1 text-center text-[15px] font-bold">
        Estimated Closing Statement
      </div>
      <div className="mb-4 text-center text-[10px] text-neutral-500">
        Prepared {shortDate(meta.prepared || new Date())} · An estimate only and
        subject to change
      </div>

      {/* ---------- parties ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-neutral-300 py-3 text-[11px] sm:grid-cols-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Property
          </div>
          <div className="whitespace-pre-line">{address || "—"}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Buyer
          </div>
          <div className="whitespace-pre-line">{meta.buyer || "—"}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Seller
          </div>
          <div className="whitespace-pre-line">{meta.seller || "—"}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Lender
          </div>
          <div className="whitespace-pre-line">{meta.lender || "—"}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Escrow / title
          </div>
          <div className="whitespace-pre-line">
            {meta.escrowAgent || "—"}
            {meta.escrowNumber ? `\nEscrow #${meta.escrowNumber}` : ""}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
            Closing
          </div>
          <div>
            {shortDate(meta.closing || form?.closingDate)}
            {meta.disbursement ? (
              <div className="text-neutral-600">
                Disbursement {shortDate(meta.disbursement)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- the statement ---------- */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th colSpan={2} className="border-b border-neutral-400 pb-1 text-[10px] font-bold uppercase tracking-wider">
              Seller
            </th>
            <th className="border-b border-neutral-400" />
            <th colSpan={2} className="border-b border-neutral-400 pb-1 text-[10px] font-bold uppercase tracking-wider">
              Buyer
            </th>
          </tr>
          <tr className="text-[9px] uppercase tracking-wider text-neutral-500">
            <th className="px-2 py-1 text-right font-semibold">Debit</th>
            <th className="px-2 py-1 text-right font-semibold">Credit</th>
            <th />
            <th className="px-2 py-1 text-right font-semibold">Debit</th>
            <th className="px-2 py-1 text-right font-semibold">Credit</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((section) => {
            const inSection = rows.filter((r) => (r.section || SECTIONS[0]) === section);
            if (!inSection.length) return null;
            return (
              <>
                <tr key={section} className="print-keep">
                  <td />
                  <td />
                  <td className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                    {section}
                  </td>
                  <td />
                  <td />
                </tr>
                {inSection.map((r, i) => (
                  <Row key={`${section}-${i}`} {...r} />
                ))}
              </>
            );
          })}

          <tr>
            <td colSpan={5} className="pt-2">
              <div className="border-t border-neutral-400" />
            </td>
          </tr>

          <Row
            label="Subtotals"
            bold
            sellerDebit={sellerDebit}
            sellerCredit={sellerCredit}
            buyerDebit={buyerDebit}
            buyerCredit={buyerCredit}
          />
          {dueFromBuyer > 0 && (
            <Row label="Due from Buyer" buyerCredit={dueFromBuyer} />
          )}
          {dueToSeller > 0 && <Row label="Due to Seller" sellerDebit={dueToSeller} />}
          <Row
            label="Totals"
            bold
            sellerDebit={sellerDebit + dueToSeller}
            sellerCredit={sellerCredit}
            buyerDebit={buyerDebit}
            buyerCredit={buyerCredit + dueFromBuyer}
          />
        </tbody>
      </table>

      {/* ---------- what the buyer brings ---------- */}
      <div className="print-keep mt-5 rounded border-2 border-neutral-900 px-4 py-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500">
          Cash to close
        </div>
        <div className="text-[22px] font-bold tabular-nums">{usd(dueFromBuyer)}</div>
        <div className="mt-1 text-[10.5px] leading-relaxed text-neutral-600">
          Buyer debits {usd(buyerDebit)} less credits {usd(buyerCredit)}
          {earnest ? `, which include the ${usd(earnest)} deposit` : ""}.
          {!isBuyerFacing && result?.totalNeed
            ? ` The gap-funding worksheet asks for ${usd(result.totalNeed)}, which
               includes prepaid interest the settlement statement does not carry.`
            : ""}
        </div>
      </div>

      <p className="mt-4 text-[9.5px] leading-relaxed text-neutral-500">
        This is an estimate only and subject to change. Prepared by Green Light
        Buying Machine for internal and lender use; it is not the settlement
        statement of record, which is issued by the escrow agent. Figures are
        derived from the purchase contract, the lender&rsquo;s terms as
        understood, and standard charges for this market — actual charges are
        set by title, the lender and the county.
      </p>
    </div>
  );
}

// Default line items for a Green Light acquisition.
//
// Built from the deal and the gap-funding worksheet rather than typed,
// because every one of these figures already exists somewhere and
// re-keying is how the flyer ended up disagreeing with the record.
// Everything is editable on the page; these are the starting point.
export function defaultClosingLines({ deal, form, result }) {
  const price = Number(form?.purchasePrice) || Number(deal?.purchase_price) || 0;
  const rehab = Number(form?.rehabBudget) || 0;
  const earnest = Number(form?.earnestMoney) || 0;
  const firstLoan = Number(result?.firstLoan) || 0;
  const docFee = Number(form?.docFee) || 0;
  const rate = Number(form?.ratePct) || 0;
  const stubInterest = Number(result?.stubInterest) || 0;
  // 90 from the form, 0.9 from the library — both arrive here.
  const rawLtc = Number(form?.ltcPct);
  const ltc = Number.isFinite(rawLtc) && rawLtc > 0 ? (rawLtc > 1 ? rawLtc / 100 : rawLtc) : 0.9;

  const L = [];
  const add = (section, label, fields) => L.push({ section, label, ...fields });

  add("Primary Charges & Credits", "Sale Price of Property", {
    sellerCredit: price,
    buyerDebit: price,
  });
  if (earnest) add("Primary Charges & Credits", "Deposit", { buyerCredit: earnest });

  if (firstLoan) add("Loan Charges", "Loan Amount", { buyerCredit: firstLoan });
  if (rehab) {
    // Advanced but held back, so the buyer never sees it at the table.
    // Shown because title shows it, and a statement missing a six-figure
    // line invites the question of what else is missing.
    add("Loan Charges", "Renovation Hold Back", { buyerDebit: rehab * ltc });
  }
  // Origination at 1% of the loan is what the Magnus statement carried
  // ($4,294 on $429,400). Editable — lenders differ.
  if (firstLoan) add("Loan Charges", "Origination Fee", { buyerDebit: firstLoan * 0.01 });
  add("Loan Charges", "Appraisal Fee", { buyerDebit: 800 });
  add("Loan Charges", "Underwriting Fee", { buyerDebit: 1495 });
  if (docFee) add("Loan Charges", "Lender Doc Fee", { buyerDebit: docFee });
  add("Loan Charges", "Notary Fee — Buyer", { buyerDebit: 250 });
  add("Loan Charges", "Notary Fee — Seller", { buyerDebit: 150 });
  if (stubInterest)
    add("Loan Charges", rate ? `Prepaid Interest (to the 1st, at ${rate}%)` : "Prepaid Interest", {
      buyerDebit: stubInterest,
    });

  // Arizona standard endorsements and policies, at the figures on the
  // Magnus statement. Policy premiums scale with price in practice, so
  // these are a starting point rather than a quote.
  add("Title Charges", "Lender's ALTA 14 Endorsement", { buyerDebit: 100 });
  add("Title Charges", "Lender's ALTA 8.1 Endorsement", { buyerDebit: 100 });
  add("Title Charges", "Lender's CLTA 100 Endorsement", { buyerDebit: 100 });
  add("Title Charges", "Lender's Title Policy", { buyerDebit: 1249 });
  add("Title Charges", "Owner's Title Policy", { buyerDebit: 1135 });

  add("Escrow Charges", "Assignment Fee", { buyerDebit: 200 });
  add("Escrow Charges", "CPL Fee", { buyerDebit: 25 });
  add("Escrow Charges", "Inspection Fee", { buyerDebit: 100 });
  add("Escrow Charges", "Processing Fee", { buyerDebit: 550 });
  add("Escrow Charges", "Settlement or Closing Fee", { buyerDebit: 1460 });
  add("Escrow Charges", "Investor Escrow Discount", { buyerCredit: 290 });

  add("Miscellaneous Charges", "Homeowner's Insurance Premium", { buyerDebit: 2461 });

  return L;
}

// ============================================================
// The buyer's side.
//
// A different transaction from defaultClosingLines above. That one is
// Green Light acquiring the house — our price, our rehab, our 17%
// bridge. This is the buyer purchasing it turnkey with a DSCR loan,
// and it carries none of our figures: the sale price is the list
// price, the loan is theirs, and our basis appears nowhere.
//
// Safe to send to the buyer's lender. That is the point of it.
// ============================================================
export function defaultBuyerClosingLines({ deal, downPct = 0.15, rate, pppCost = 0, earnest = 5000 }) {
  const price = Number(deal?.list_price) || 0;
  const loan = price * (1 - downPct);

  const L = [];
  const add = (section, label, fields) => L.push({ section, label, ...fields });

  add("Primary Charges & Credits", "Sale Price of Property", {
    sellerCredit: price,
    buyerDebit: price,
  });
  if (earnest) add("Primary Charges & Credits", "Earnest Deposit", { buyerCredit: earnest });

  if (loan) {
    add("Loan Charges", "Loan Amount", { buyerCredit: loan });
    // 1% is the origination on the Magnus statement. Lenders differ and
    // this is editable — it is a starting figure, not a quote.
    add("Loan Charges", "Origination Fee", { buyerDebit: loan * 0.01 });
  }
  add("Loan Charges", "Appraisal Fee", { buyerDebit: 800 });
  add("Loan Charges", "Underwriting Fee", { buyerDebit: 1495 });
  if (pppCost) {
    // The prepayment penalty is bought at close on these DSCR loans.
    // It is the line most often left off an estimate and it is five
    // figures.
    add("Loan Charges", "Prepayment Penalty (3% fixed, 5-year)", { buyerDebit: pppCost });
  }
  add("Loan Charges", "Prepaid Interest (to the 1st)", { buyerDebit: 0 });

  add("Title Charges", "Lender's Title Policy", { buyerDebit: 1249 });
  add("Title Charges", "Owner's Title Policy", { buyerDebit: 1135 });
  add("Title Charges", "Lender's Endorsements", { buyerDebit: 300 });

  add("Escrow Charges", "Settlement or Closing Fee", { buyerDebit: 1460 });
  add("Escrow Charges", "Processing Fee", { buyerDebit: 550 });
  add("Escrow Charges", "CPL Fee", { buyerDebit: 25 });

  add("Miscellaneous Charges", "Homeowner's Insurance Premium", { buyerDebit: 2461 });
  add("Miscellaneous Charges", "Property Tax Proration", { buyerDebit: 0 });

  return L;
}

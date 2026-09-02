"use client";

// ============================================================
// Loan application and promissory note, filled from deal_financing.
//
// CONFIDENTIAL. These render acquisition cost, rehab budget, lender
// terms and party contacts — none of which a buyer should ever see.
// Reached only from /financing/[slug], which sits behind team auth,
// and no buyer route imports this file.
//
// The note text follows the template already in use. It is a legal
// instrument: generating it saves transcription, it does not replace
// the review that transcription used to force.
// ============================================================

const INK = "#141914";

const usd = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "____________";

const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US") : "__/__/____";

function ConfidentialBand() {
  return (
    <div
      className="print-keep mb-4 flex items-center gap-2 rounded px-4 py-2"
      style={{ backgroundColor: INK }}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
        Confidential
      </span>
      <span className="text-[10px] text-neutral-400">
        Lender and internal use only — not for buyer distribution
      </span>
    </div>
  );
}

function Cell({ label, value, span }) {
  return (
    <div className={`print-keep border border-neutral-400 ${span ? "col-span-2" : ""}`}>
      <div className="border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-neutral-600">
        {label}
      </div>
      <div className="px-2 py-1.5 text-[12px] text-neutral-900">{value || "—"}</div>
    </div>
  );
}

// ---------- loan application ----------

export function LoanApplication({ deal, form, result, lender }) {
  return (
    <div className="print-doc bg-white p-8">
      <ConfidentialBand />

      <div className="mb-5 text-center">
        <h1 className="text-[20px] font-bold text-neutral-900">
          {lender || "Lender"}
        </h1>
        <div
          className="mx-auto mt-1 inline-block px-3 py-0.5 text-[13px] font-bold"
          style={{ backgroundColor: "#FEF08A" }}
        >
          Loan Request
        </div>
      </div>

      <h2 className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-neutral-900">
        Property Info
      </h2>
      <div className="mb-5 grid grid-cols-2 gap-px">
        <Cell label="Date loan requested" value={shortDate(new Date())} />
        <Cell label="Property address" value={`${deal.address_line}, ${deal.city} ${deal.state} ${deal.zip}`} />
        <Cell label="Property type" value="Single Family" />
        <Cell label="Type of loan" value="Purchase Loan" />
        <Cell label="Purchase price" value={usd(form.purchasePrice)} />
        <Cell label="Estimated rehab budget" value={usd(form.rehabBudget)} />
        <Cell label="Loan amount requested" value={usd(result.firstLoan)} />
        <Cell label="Estimated date of closing" value={shortDate(form.closingDate)} />
        <Cell
          span
          label="Other info"
          value={`${form.ltcPct}% of purchase and rehab at ${form.ratePct}%. Second position of ${usd(
            result.recommendedNote
          )} covers the balance to close.`}
        />
      </div>

      <h2 className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-neutral-900">
        Borrower Info
      </h2>
      <div className="mb-5 grid grid-cols-2 gap-px">
        <Cell label="Name" value={form.borrowerEntity || "—"} />
        <Cell label="Legal name of entity" value={form.borrowerEntity || "—"} />
        <Cell label="State of formation" value="Arizona" />
        <Cell label="Title of person signing" value="Member" />
        <Cell label="Signer" value={form.signerName || "—"} />
        <Cell label="Borrower email" value={form.borrowerEmail || "—"} />
      </div>

      <h2 className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-neutral-900">
        Title / Escrow Info
      </h2>
      <div className="grid grid-cols-2 gap-px">
        <Cell label="Company" value={form.titleCompany} />
        <Cell label="Contact name" value={form.titleContact} />
        <Cell label="Email" value={form.titleEmail} />
        <Cell label="Phone" value={form.titlePhone} />
      </div>

      <p className="mt-6 text-center text-[11px] font-bold">
        *WE ONLY LOAN ON INVESTMENT PROPERTY. NO OWNER OCCUPIED LOANS*
      </p>
    </div>
  );
}

// ---------- promissory note ----------

export function PromissoryNote({ deal, form, result }) {
  const principal = Number(result.recommendedNote) || 0;
  const rate = Number(form.noteRatePct) || 25;
  const maturity = form.noteMaturity;

  const H = ({ children }) => (
    <span style={{ backgroundColor: "#FEF08A" }} className="px-0.5 font-bold">
      {children}
    </span>
  );

  return (
    <div className="print-doc bg-white p-8 text-[12px] leading-relaxed text-neutral-900">
      <ConfidentialBand />

      <h1 className="mb-4 text-center text-[15px] font-bold">
        Promissory Note Secured by Deed of Trust
      </h1>

      <div className="mb-4 flex items-start justify-between">
        <H>{usd(principal)}</H>
        <div className="text-right">
          <div><H>{form.noteCity || "Gilbert, Arizona"}</H></div>
          <div><H>{longDate(form.noteDate || new Date())}</H></div>
        </div>
      </div>

      <p className="mb-4">
        <H>
          {deal.address_line}, {deal.city}, {deal.state} {deal.zip}
        </H>
        {form.apn ? <> &nbsp;APN: <H>{form.apn}</H></> : null}
      </p>

      <p className="mb-3">
        <strong>For Value Received,</strong> the undersigned,{" "}
        <H>{form.borrowerEntity || "____________"}</H> (&ldquo;Maker&rdquo;)
        promises to pay to the order of{" "}
        <H>{form.lenderName || "____________"}</H>
        {form.lenderAddress ? <> (<H>{form.lenderAddress}</H>)</> : null} (or at
        such other place as Holder may designate in writing) in lawful money of
        the United States of America, the principal sum of{" "}
        <H>{usd(principal)}</H> plus accrued interest as provided below:
      </p>

      <ol className="ml-5 list-decimal space-y-3">
        <li>
          <strong>Interest Rate and profit Share.</strong> Interest for the term
          of this Promissory Note Secured by Deed of Trust (the
          &ldquo;Note&rdquo;) shall be payable at the rate of{" "}
          <H>{rate} percent ({rate}%)</H> per annum (the &ldquo;Interest
          Rate&rdquo;). All interest calculations under this Note shall be made
          based upon a 360-day year and the actual number of days in the
          applicable calendar month.
        </li>
        <li>
          <strong>Interest Payments; Maturity.</strong> If not sooner paid,
          Maker shall make a payment of the outstanding principal balance,
          including all accrued but unpaid interest and all other sums due
          hereunder, on <H>{shortDate(maturity)}</H> (the &ldquo;Maturity
          Date&rdquo;). Maker shall have the option to extend the Maturity Date
          of this Note for an additional five (5) months upon payment to Holder
          of an extension fee equal to one percent (1%) of the unpaid principal
          balance of the Note on the date of the extension. All principal,
          interest and other amounts due hereunder on the Maturity Date that are
          not paid when due shall thereafter bear interest at the Default Rate
          until such amounts are paid in full.
        </li>
        <li>
          <strong>Form and Application of Payments.</strong> All payments on this
          Note shall be applied first to the repayment of any sums advanced by
          Holder for the payment of any taxes, assessments, insurance premiums,
          late charges or other charges against the property securing this Note,
          then to the payment of accrued but unpaid interest due under this
          Note, and then to the reduction of the unpaid principal balance.
        </li>
      </ol>

      <div className="mt-8 border-t border-neutral-300 pt-4">
        <p className="mb-6 text-[11px] text-neutral-500">
          Sections 4 through 18 — Events of Default, Default Rate, Purpose of
          Loan, Security and Acceleration on Transfer, Prepayment, Waivers,
          Arizona Law and Jurisdiction, Collection Costs, Partial Invalidity,
          Joint Obligation, Amendments, Gender, Notice, Interest Rate
          Limitation and Jury Waiver — follow the standing form and are
          unchanged.
        </p>

        <p className="mb-2">
          <strong>In Witness Whereof,</strong> Maker has executed this Note as of
          the day and year set forth above.
        </p>
        <p>
          By: <H>{form.borrowerEntity || "____________"}</H> an Arizona limited
          liability company, its Member
        </p>
        <p className="mt-6">
          By: ______________________________ &nbsp; Name:{" "}
          <H>{form.signerName || "____________"}</H>
        </p>
        <p>Title: Member</p>
      </div>

      <p className="mt-8 border-t border-neutral-300 pt-3 text-[10px] leading-relaxed text-neutral-500">
        Generated from the deal record. A promissory note is a legal
        instrument — have counsel review the executed version. Sections 4–18
        are not reproduced here and must be attached from the standing form
        before signature.
      </p>
    </div>
  );
}

"use client";

// ============================================================
// DSCR loan submission — the package a buyer's lender asks for.
//
// This is the BUYER's loan, not ours. Rachelle Coffey at Homeowners
// Financial writes 15% down DSCR loans against these houses; the
// borrower is whoever is buying the turnkey home, and the security is
// the house at its list price. Nothing on this page is our acquisition
// cost, our rehab budget or our margin — those live on /financing and
// never come here.
//
// Everything below already exists: the room roll, the operating
// expenses, NOI and DSCR are what the buyer sheet renders. This is an
// arrangement of them in the order a lender reads, so the same figures
// go to the lender as went to the buyer.
// ============================================================

import { useState } from "react";
import { ClosingStatement, defaultBuyerClosingLines } from "./ClosingStatement";
import { pppCostForDown } from "../lib/proforma";

const GREEN = "#00A651";

const usd = (n, dp = 0) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      })
    : "—";

const pct = (n, dp = 1) =>
  Number.isFinite(Number(n)) ? `${(Number(n) * 100).toFixed(dp)}%` : "—";

function Line({ label, value, note, bold }) {
  return (
    <div
      className={`print-keep flex items-baseline justify-between gap-4 border-b border-neutral-100 py-1.5 ${
        bold ? "border-neutral-900 font-bold" : ""
      }`}
    >
      <span className="text-[12px]">
        {label}
        {note && <span className="block text-[10px] text-neutral-500">{note}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${bold ? "text-[15px]" : "text-[13px]"}`}>
        {value}
      </span>
    </div>
  );
}

export default function LenderPackage({
  deal,
  market,
  comps = [],
  rooms = [],
  gross,
  noi,
  tiers = [],
  occupancyPct,
}) {
  const [borrower, setBorrower] = useState({
    entity: "",
    fico: "",
    downPct: "15",
    lender: "Homeowners Financial Group — Rachelle Coffey, NMLS #203664",
  });

  const price = Number(deal?.list_price) || 0;
  const chosen =
    tiers.find((t) => Math.round(t.downPct * 100) === Number(borrower.downPct)) || tiers[0];

  const sqft =
    Number(deal?.finished_sqft) ||
    Number(deal?.post_reno_sqft) ||
    Number(deal?.living_area_sqft) ||
    null;

  // resolveRooms returns room_type, not a boolean — the shape from
  // lib/proforma, not the one the club preset builds. Rates come from
  // roomRate so a per-room override on the sketch is honoured, which is
  // the same precedence the flyer and the sheet use.
  const ensuite = rooms.filter((r) => r.room_type === "ensuite");
  const shared = rooms.filter((r) => r.room_type === "shared");
  const rate = (list) => (list.length ? Number(list[0].weeklyRate) || 0 : 0);

  const closed = comps.filter((c) => c.comp_status === "closed" && c.sold_price);

  const field =
    "w-full rounded border border-neutral-300 px-2 py-1 text-[12px] outline-none focus:border-neutral-500";

  return (
    // print-doc gives this the Letter width and margins the pro forma
    // already uses. Without it the package printed at whatever width
    // the screen happened to be and clipped at the right edge.
    <div className="print-doc bg-white p-6 text-neutral-900 sm:p-10">
      {/* Borrower details aren't ours to know, so they're typed here
          rather than guessed from the deal. */}
      <div className="no-print mb-5 rounded border border-neutral-200 bg-neutral-50 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">
          Borrower &amp; lender
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              Borrowing entity
            </span>
            <input
              value={borrower.entity}
              onChange={(e) => setBorrower((b) => ({ ...b, entity: e.target.value }))}
              className={field}
            />
          </label>
          <label className="block">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              FICO
            </span>
            <input
              value={borrower.fico}
              onChange={(e) => setBorrower((b) => ({ ...b, fico: e.target.value }))}
              inputMode="numeric"
              className={field}
            />
          </label>
          <label className="block">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              Down payment
            </span>
            <select
              value={borrower.downPct}
              onChange={(e) => setBorrower((b) => ({ ...b, downPct: e.target.value }))}
              className={field}
            >
              <option value="15">15% — 85 LTV</option>
              <option value="20">20% — 80 LTV</option>
              <option value="25">25% — 75 LTV</option>
            </select>
          </label>
          <label className="block sm:col-span-4">
            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
              Lender
            </span>
            <input
              value={borrower.lender}
              onChange={(e) => setBorrower((b) => ({ ...b, lender: e.target.value }))}
              className={field}
            />
          </label>
        </div>
      </div>

      {/* ---------- the package ---------- */}
      <div className="text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: GREEN }}>
          Green Light Buying Machine
        </div>
        <div className="mt-1 text-[17px] font-bold">DSCR Loan Submission</div>
        <div className="mt-0.5 text-[11px] text-neutral-600">
          {deal?.address_line}
          {deal?.city ? `, ${deal.city}, ${deal.state} ${deal.zip}` : ""}
        </div>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
            Subject property
          </div>
          <Line label="Purchase price" value={usd(price)} />
          <Line
            label="Bedrooms / bathrooms"
            value={`${deal?.target_bedrooms || deal?.bedrooms || "—"} / ${
              deal?.target_bathrooms || deal?.bathrooms || "—"
            }`}
            note={deal?.target_ensuites ? `${deal.target_ensuites} ensuite` : null}
          />
          {sqft && <Line label="Square feet" value={sqft.toLocaleString()} />}
          {deal?.year_built && <Line label="Year built" value={deal.year_built} />}
          {deal?.parcel_number && <Line label="Parcel" value={deal.parcel_number} />}
          <Line label="Use" value="Co-living, room by room" note="operated on PadSplit" />
        </div>

        <div>
          <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
            Borrower
          </div>
          <Line label="Entity" value={borrower.entity || "—"} />
          <Line label="FICO" value={borrower.fico || "—"} />
          <Line label="Down payment" value={`${borrower.downPct}%`} />
          <Line
            label="Loan requested"
            value={usd(price * (1 - Number(borrower.downPct) / 100))}
            note={`${100 - Number(borrower.downPct)}% LTV`}
          />
          <Line label="Lender" value={borrower.lender || "—"} />
        </div>
      </div>

      {/* ---------- rent roll ---------- */}
      <div className="mt-6">
        <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
          Rent roll
        </div>
        {ensuite.length > 0 && (
          <Line
            label={`${ensuite.length} × ensuite, private bath`}
            value={`${usd(rate(ensuite))}/wk`}
            note={`${usd(rate(ensuite) * ensuite.length * 52)} a year`}
          />
        )}
        {shared.length > 0 && (
          <Line
            label={`${shared.length} × shared bath`}
            value={`${usd(rate(shared))}/wk`}
            note={`${usd(rate(shared) * shared.length * 52)} a year`}
          />
        )}
        <Line label="Gross scheduled rent" value={usd(gross)} bold />
      </div>

      {/* ---------- the coverage ---------- */}
      <div className="mt-6">
        <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
          Debt service coverage
        </div>
        <Line
          label="Gross scheduled rent"
          value={usd(gross)}
          note={occupancyPct ? `modelled at ${pct(occupancyPct, 0)} occupancy` : null}
        />
        <Line label="Net operating income" value={usd(noi)} />
        {chosen && (
          <>
            <Line
              label="Annual debt service"
              value={usd(chosen.payment * 12)}
              note={`${usd(chosen.loan)} at ${pct(chosen.rate, 3)}, 30-year fixed`}
            />
            <Line
              label="DSCR"
              value={(noi / (chosen.payment * 12)).toFixed(2)}
              note="net operating income ÷ annual debt service"
              bold
            />
          </>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">
          DSCR here is net operating income divided by annual debt service. If
          your calculation differs — gross rent over PITIA, for instance — the
          figures above give you what you need to restate it.
        </p>
      </div>

      {/* ---------- market evidence ---------- */}
      {market && (
        <div className="mt-6">
          <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
            Market evidence — ZIP {market.zip}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            {[
              ["Active units", market.active_units],
              ["Average occupancy", market.avg_occupancy ? pct(market.avg_occupancy, 0) : null],
              ["Shared room", market.shared_weekly ? `${usd(market.shared_weekly)}/wk` : null],
              ["Private bath", market.private_weekly ? `${usd(market.private_weekly)}/wk` : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-neutral-500">{k}</div>
                  <div className="text-[14px] font-bold tabular-nums">{v}</div>
                </div>
              ))}
          </div>
          <p className="mt-1 text-[10px] text-neutral-500">
            PadSplit Market Insights for this ZIP, as last recorded.
          </p>
        </div>
      )}

      {/* ---------- comps ---------- */}
      {closed.length > 0 && (
        <div className="mt-6">
          <div className="border-b-2 border-neutral-900 pb-1 text-[10px] font-bold uppercase tracking-wider">
            Comparable sales
          </div>
          <table className="mt-1 w-full text-[11.5px]">
            <tbody>
              {closed.slice(0, 8).map((c) => (
                <tr key={c.id || c.address} className="print-keep border-b border-neutral-100">
                  <td className="py-1">{c.address}</td>
                  <td className="py-1 text-right tabular-nums text-neutral-600">
                    {c.approx_sqft ? `${Number(c.approx_sqft).toLocaleString()} sqft` : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums text-neutral-600">
                    {c.sold_date
                      ? new Date(c.sold_date).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {usd(c.sold_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The buyer's estimated closing statement, on the same package.
          Their transaction, their loan, their charges — none of our
          basis. Lenders ask for cash to close, and answering it in the
          submission saves a round trip. */}
      {price > 0 && (
        <div className="print-page mt-10 border-t-4 border-neutral-900 pt-6">
          <ClosingStatement
            deal={deal}
            form={{ purchasePrice: price, earnestMoney: 5000 }}
            result={null}
            lines={defaultBuyerClosingLines({
              deal,
              downPct: Number(borrower.downPct) / 100,
              pppCost: pppCostForDown(Number(borrower.downPct) / 100),
            })}
            meta={{
              buyer: borrower.entity,
              lender: borrower.lender,
              prepared: new Date(),
            }}
            audience="buyer"
          />
        </div>
      )}

      <p className="mt-6 text-[9.5px] leading-relaxed text-neutral-500">
        Prepared by Green Light Buying Machine for the borrower&rsquo;s lender.
        Rents are the rates this house is underwritten at and operating expenses
        are modelled on Green Light&rsquo;s standard; both are projections, not a
        guarantee of performance. Occupancy is modelled at{" "}
        {pct(occupancyPct || 0.95, 0)}, the average across established Green
        Light properties after stabilisation. This is not a quote, a commitment
        to lend, or an offer to sell a security.
      </p>
    </div>
  );
}

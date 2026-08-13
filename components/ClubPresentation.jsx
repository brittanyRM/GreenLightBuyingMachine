"use client";

// ============================================================
// Buyer-facing presentation blocks — flyer visual language.
//
// Same palette, type scale and furniture as DealFlyer: the ink price
// plate overlapping a bleeding hero, the chevron banner, lime on ink,
// rule-flanked section titles, the dark closing bar. A buyer who has
// seen the flyer should recognise this as the same document set.
//
// It stops short of being a flyer: the numbers stay in ruled tables
// rather than display type, because this sheet has to survive an
// analyst reading it, not just catch an eye.
//
// Every field comes from the whitelisted payload. Nothing renders
// here that a buyer isn't already permitted to see.
// ============================================================

import { useState } from "react";
import { usd, pct } from "../lib/proformaClub";
import { BrandMark } from "./Brand";

const GREEN = "#00A651";
const LIME = "#8CC63F";
const BANNER = "#2E4A2E";
const INK = "#141914";

// ---------- masthead ----------

// The flyer's split masthead: wordmark and title on the left, hero
// photo bleeding to the right edge with the price plate hanging off
// its bottom corner.
export function FlyerMasthead({ deal = {}, beds, baths, sqft, price, scenarioLabel }) {
  const heroUrl = deal.hero_image_url || null;

  return (
    <div className="print-section relative grid grid-cols-[0.88fr_1fr]">
      <div className="pb-6 pl-8 pr-2 pt-7">
        <BrandMark height={38} className="mb-3" />

        <h1 className="text-[34px] font-black uppercase leading-[0.85] tracking-[-0.02em] text-neutral-900">
          Investment
          <br />
          Summary
        </h1>

        <div
          className="mt-2 inline-block py-[5px] pl-3 pr-7 text-[12.5px] font-bold uppercase tracking-wide text-white"
          style={{
            backgroundColor: BANNER,
            clipPath:
              "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
          }}
        >
          Turnkey &amp; Operating
        </div>

        <p className="mt-3 text-[15px] font-black uppercase leading-tight tracking-tight text-neutral-900">
          {deal.address_line}
        </p>
        <p className="text-[12px] font-semibold text-neutral-600">
          {deal.city}, {deal.state} {deal.zip}
        </p>
        <p className="mt-1 text-[11.5px] text-neutral-600">
          {beds} bed · {baths} bath
          {sqft ? ` · ${sqft.toLocaleString()} sq ft` : ""}
        </p>
      </div>

      <div className="relative">
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt="" className="h-[230px] w-full object-cover object-center" />
        ) : (
          <div className="flex h-[230px] w-full items-center justify-center bg-neutral-200 text-[11px] text-neutral-500">
            Hero photo
          </div>
        )}

        {/* Price plate, overlapping the photo as on the flyer */}
        <div
          className="absolute -bottom-4 right-0 px-6 py-2 text-[34px] font-black leading-none tracking-tight text-white"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          {usd(price)}
        </div>

        <div className="absolute left-0 top-0 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-white"
             style={{ backgroundColor: BANNER }}>
          {scenarioLabel} case
        </div>
      </div>
    </div>
  );
}

// ---------- section title ----------

// The flyer's rule-flanked heading.
export function FlyerHeading({ children, align = "left" }) {
  return (
    <div className="print-keep mb-2.5 flex items-center gap-2">
      {align === "center" && <div className="h-px flex-1 bg-neutral-400" />}
      <h3 className="text-[11.5px] font-black uppercase tracking-wide text-neutral-900">
        {children}
      </h3>
      <div className="h-px flex-1 bg-neutral-400" />
    </div>
  );
}

// ---------- headline metrics ----------

// Four bordered cards in the flyer's projected-income style: small
// semibold label, oversized black figure.
export function HeadlineMetrics({ scenario, holdYears, listPrice, grossAnnual, netAnnual }) {
  const cards = [
    { label: "Year 1\nNet Yield", value: pct(scenario.year1UnleveredCashOnCash), foot: "unlevered, on total basis" },
    { label: `${holdYears}-Year\nAnnual Return`, value: pct(scenario.leveredIrr), foot: "levered IRR" },
    { label: "Equity\nMultiple", value: `${scenario.leveredMoic.toFixed(2)}x`, foot: `${usd(scenario.leveredProfit)} projected profit` },
    { label: "Debt\nCoverage", value: scenario.year1Dscr.toFixed(2), foot: scenario.minDscr < 1.2 ? `dips to ${scenario.minDscr.toFixed(2)}` : "lender-ready" },
  ];

  return (
    <div className="print-section px-8 pb-4 pt-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="print-keep rounded-xl border border-neutral-300 px-4 py-3">
            <div className="whitespace-pre-line text-[11px] font-semibold leading-tight text-neutral-700">
              {c.label}:
            </div>
            <div className="mt-1 text-[27px] font-black leading-none tabular-nums text-neutral-900">
              {c.value}
            </div>
            <div className="mt-1.5 text-[8.5px] leading-snug text-neutral-600">{c.foot}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="print-keep rounded-xl border border-neutral-300 px-4 py-3">
          <div className="text-[11px] font-semibold leading-tight text-neutral-700">
            Estimated Gross Annual Income:
          </div>
          <div className="mt-1 text-[27px] font-black leading-none tabular-nums text-neutral-900">
            {usd(grossAnnual)}
          </div>
        </div>
        <div className="print-keep rounded-xl border-2 px-4 py-3" style={{ borderColor: GREEN }}>
          <div className="text-[11px] font-semibold leading-tight text-neutral-700">
            Net to Owner, Year 1:
          </div>
          <div className="mt-1 text-[27px] font-black leading-none tabular-nums text-neutral-900">
            {usd(netAnnual)}
          </div>
          <div className="mt-1.5 text-[8.5px] leading-snug text-neutral-600">
            after vacancy, collections loss and platform fees — every return
            above is calculated on this figure, not on gross
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- what's included ----------

// The flyer's ink bar, carried across so the two documents read as a
// set. Also does real work here: it's what justifies the price
// against comps that sold as ordinary houses.
export function IncludedBar({ items }) {
  const list =
    items && items.length
      ? items
      : [
          { icon: "▭", label: "Fully Furnished" },
          { icon: "🔒", label: "Smart Locks Installed" },
          { icon: "🖥", label: "Listed on PadSplit" },
          { icon: "🚀", label: "Host Launch Complete" },
          { icon: "🍴", label: "Kitchen Inventory" },
          { icon: "📷", label: "Professional Photography" },
          { icon: "✓", label: "Operations Ready" },
        ];

  return (
    <div className="print-section px-8 pb-2">
      <div className="rounded-xl px-5 py-3.5" style={{ backgroundColor: INK }}>
        <h3 className="text-[12px] font-black uppercase tracking-wide" style={{ color: LIME }}>
          Included With Purchase
        </h3>
        <div className="mt-3 flex flex-wrap items-start">
          {list.map((item, i) => {
            const label = typeof item === "string" ? item : item.label;
            const icon = typeof item === "string" ? "✓" : item.icon;
            return (
              <div key={label} className="flex items-start">
                {i === 4 && <div className="mx-3 h-12 w-px shrink-0 bg-neutral-600" />}
                <div className="w-[80px] px-1 text-center">
                  <div className="text-[17px] leading-none" style={{ color: LIME }}>
                    {icon}
                  </div>
                  <div className="mt-1.5 text-[8px] font-semibold leading-tight text-white">
                    {label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- gallery ----------

export function PropertyGallery({ gallery = [], floorPlanUrl, address }) {
  const shots = (Array.isArray(gallery) ? gallery : [])
    .map((g) => (typeof g === "string" ? g : g?.url))
    .filter(Boolean);

  if (floorPlanUrl) shots.push(floorPlanUrl);
  const [active, setActive] = useState(0);
  if (!shots.length) return null;

  const current = shots[Math.min(active, shots.length - 1)];

  return (
    <div className="print-section px-8 pb-4 pt-2">
      <FlyerHeading>The Property</FlyerHeading>
      <div className="overflow-hidden rounded-xl bg-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt={address || ""} className="h-[260px] w-full object-cover sm:h-[340px]" />
      </div>
      {shots.length > 1 && (
        <div className="no-print mt-2 flex gap-1.5 overflow-x-auto">
          {shots.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              className="shrink-0 overflow-hidden rounded"
              style={{
                outline: i === active ? `2px solid ${GREEN}` : "2px solid transparent",
                outlineOffset: "-2px",
              }}
              aria-label={`Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- specification checklist ----------

function Check() {
  return (
    <span
      className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
      style={{ backgroundColor: GREEN }}
    >
      ✓
    </span>
  );
}

export function PropertyFacts({ deal = {}, beds, baths }) {
  const rows = [
    ["Bedrooms", beds || deal.bedrooms],
    ["Bathrooms", baths || deal.bathrooms],
    ["Living area", deal.post_reno_sqft ? `${deal.post_reno_sqft.toLocaleString()} sq ft` : null],
    ["Lot", deal.lot_sqft ? `${deal.lot_sqft.toLocaleString()} sq ft` : null],
    ["Year built", deal.year_built],
    ["Construction", deal.construction_type],
    ["Roof", deal.roof_material],
    ["Zoning", deal.zoning],
    ["School district", deal.school_district],
    ["County", deal.county],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  if (!rows.length) return null;

  return (
    <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <li
          key={k}
          className="print-keep flex gap-2 border-b border-neutral-200 py-[5px] text-[11.5px] leading-snug"
        >
          <Check />
          <span className="text-neutral-700">
            {k}: <span className="font-semibold text-neutral-900">{v}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------- comparable sales ----------

export function CompsTable({ comps = [], listPrice, sqft }) {
  if (!comps.length) return null;

  const withPsf = comps.filter((c) => Number(c.price_per_sqft) > 0);
  const avgPsf = withPsf.length
    ? withPsf.reduce((a, c) => a + Number(c.price_per_sqft), 0) / withPsf.length
    : null;
  const subjectPsf = listPrice && sqft ? listPrice / sqft : null;

  return (
    <div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            {["Address", "Status", "Sq Ft", "$/Sq Ft", "Sold", "Price"].map((hd, i) => (
              <th
                key={hd}
                className={`py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-neutral-600 ${
                  i > 1 ? "text-right" : ""
                }`}
              >
                {hd}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comps.slice(0, 8).map((c) => (
            <tr key={c.id} className="print-keep border-b border-neutral-200">
              <td className="py-1.5 text-[11.5px] text-neutral-800">{c.address || "—"}</td>
              <td className="py-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                {c.comp_status}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-700">
                {c.approx_sqft ? c.approx_sqft.toLocaleString() : "—"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-700">
                {c.price_per_sqft ? `$${Math.round(c.price_per_sqft)}` : "—"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-500">
                {c.sold_date
                  ? new Date(c.sold_date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                  : "—"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
                {c.sold_price ? usd(c.sold_price) : c.list_price ? usd(c.list_price) : "—"}
              </td>
            </tr>
          ))}

          <tr className="border-b-2 border-neutral-900" style={{ backgroundColor: "#F2FAF5" }}>
            <td className="py-1.5 text-[11.5px] font-black uppercase text-neutral-900">
              This property
            </td>
            <td className="py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>
              offered
            </td>
            <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
              {sqft ? sqft.toLocaleString() : "—"}
            </td>
            <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
              {subjectPsf ? `$${Math.round(subjectPsf)}` : "—"}
            </td>
            <td className="py-1.5" />
            <td className="py-1.5 text-right text-[11.5px] font-black tabular-nums text-neutral-900">
              {listPrice ? usd(listPrice) : "—"}
            </td>
          </tr>
        </tbody>
      </table>

      {avgPsf && subjectPsf && (
        <p className="mt-2 text-[9px] leading-relaxed text-neutral-600">
          Comparable sales average ${Math.round(avgPsf)} per square foot against $
          {Math.round(subjectPsf)} here
          {subjectPsf > avgPsf
            ? " — the difference reflects the co-living conversion, the furniture package and the completed PadSplit launch. None of these comps sold as an operating room rental."
            : "."}
        </p>
      )}
    </div>
  );
}

// ---------- closing bar ----------

// The flyer's dark foot, so the two documents end the same way.
export function FlyerFooter({ deal = {}, market = null, hasOwnPhotos }) {
  return (
    <div className="print-section px-8 pb-8 pt-4">
      <div className="grid grid-cols-[1fr_0.72fr]">
        <div className="flex gap-3 rounded-l-xl p-4" style={{ backgroundColor: INK }}>
          <span className="mt-0.5 text-[19px] leading-none" style={{ color: LIME }}>
            ⌂
          </span>
          <div>
            <h4 className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: LIME }}>
              About This Property
            </h4>
            <p className="mt-1.5 text-[8.5px] leading-relaxed text-neutral-300">
              Renovated, furnished and launched to Green Light Buying Machine
              standards. The projections in this document are built room by
              room and reduced to net-to-owner income before any return is
              calculated — no figure here is stated on gross rent.
            </p>
            <p className="mt-2 text-[9.5px] font-black uppercase" style={{ color: LIME }}>
              Close and begin operating.
            </p>
          </div>
        </div>

        <div className="rounded-r-xl p-4" style={{ backgroundColor: "#1C231C" }}>
          <h4 className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: LIME }}>
            <span className="mr-1">◉</span>
            {deal.city}, {deal.state}
          </h4>
          <p className="mt-1.5 text-[8.5px] leading-relaxed text-neutral-300">
            {market && Number(market.avg_occupancy) > 0
              ? `PadSplit reports ${Math.round(Number(market.avg_occupancy) * 100)}% average occupancy in ${deal.zip}.`
              : "High rental demand submarket."}{" "}
            Occupancy in the projections is modeled at that rate, not above it.
          </p>
          <p className="mt-3 text-[11px] font-black uppercase leading-tight text-white">
            Underwritten to be
            <br />
            operated, not sold.
          </p>
        </div>
      </div>

      <div
        className="mt-3 flex items-center justify-between rounded-xl px-5 py-3"
        style={{ backgroundColor: "#0D110D" }}
      >
        <div>
          <div className="text-[17px] font-black uppercase leading-none text-white">
            Green <span style={{ color: LIME }}>Light</span>
          </div>
          <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-neutral-300">
            Buying Machine
          </div>
          <div className="text-[6.5px] uppercase tracking-[0.3em] text-neutral-500">
            The Coliving Ecosystem
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[11px] font-semibold leading-tight text-white">
            Solving Affordable Housing
            <br />
            One Room at a Time.
          </div>
          <span className="text-[20px] text-white">⌂</span>
        </div>
      </div>

      <p className="pt-4 text-center text-[7px] leading-relaxed text-neutral-500">
        {hasOwnPhotos
          ? "Photography is of this property."
          : "Photography is representative of Green Light Buying Machine finish standards."}{" "}
        Projections are estimates based on PadSplit market data for ZIP{" "}
        {deal.zip}. Rates, taxes, insurance and market rents move; actual
        results vary. Not an offer to sell a security.
      </p>
    </div>
  );
}

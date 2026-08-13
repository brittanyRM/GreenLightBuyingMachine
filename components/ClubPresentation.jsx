"use client";

// ============================================================
// Buyer-facing presentation blocks.
//
// A lender's document that still sells the house. Order matters:
// photograph, headline numbers, then the arithmetic behind them.
// Someone deciding whether to buy looks before they read.
//
// Every field here comes from the whitelisted payload — nothing is
// rendered that a buyer isn't already permitted to see.
// ============================================================

import { useState } from "react";
import { usd, pct } from "../lib/proformaClub";

const GREEN = "#00A651";

// ---------- photography ----------

// Big frame, thumbnail strip underneath. The strip is no-print: on
// paper it reads as clutter sitting above the numbers.
export function PropertyGallery({ heroUrl, gallery = [], floorPlanUrl, address }) {
  const shots = [heroUrl, ...(Array.isArray(gallery) ? gallery : [])]
    .map((g) => (typeof g === "string" ? g : g?.url))
    .filter(Boolean);

  if (floorPlanUrl) shots.push(floorPlanUrl);

  const [active, setActive] = useState(0);
  if (!shots.length) return null;

  const current = shots[Math.min(active, shots.length - 1)];

  return (
    <div className="print-section">
      <div className="bg-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={address || "Property"}
          className="h-[300px] w-full object-cover sm:h-[420px]"
        />
      </div>

      {shots.length > 1 && (
        <div className="no-print flex gap-1.5 overflow-x-auto bg-neutral-950 px-3 py-2">
          {shots.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              className="shrink-0 overflow-hidden rounded-sm"
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

// ---------- headline metrics ----------

// The four numbers a buyer decides on, before any table. Tinted cards
// rather than plain type — the one place on the sheet allowed to look
// like a brochure.
export function HeadlineMetrics({ scenario, holdYears, listPrice, grossAnnual }) {
  const cards = [
    { label: "Price", value: usd(listPrice), sub: "turnkey, operating" },
    {
      label: "Year 1 net yield",
      value: pct(scenario.year1UnleveredCashOnCash),
      sub: "unlevered, on total basis",
    },
    {
      label: `${holdYears}-yr annual return`,
      value: pct(scenario.leveredIrr),
      sub: "levered IRR",
    },
    {
      label: "Projected profit",
      value: usd(scenario.leveredProfit),
      sub: `over ${holdYears} years`,
    },
  ];

  return (
    <div className="print-section grid grid-cols-2 gap-2 border-b border-neutral-200 px-6 py-5 sm:grid-cols-4 sm:px-8">
      {cards.map((c) => (
        <div
          key={c.label}
          className="print-keep rounded border px-3 py-3"
          style={{ borderColor: "#CFEBD9", backgroundColor: "#F2FAF5" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
            {c.label}
          </div>
          <div className="mt-0.5 text-[22px] font-bold leading-none tabular-nums text-neutral-900">
            {c.value}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500">{c.sub}</div>
        </div>
      ))}

      <div className="print-keep col-span-2 rounded border border-neutral-200 px-3 py-2.5 sm:col-span-4">
        <span className="text-[11px] leading-snug text-neutral-600">
          Gross scheduled rent{" "}
          <strong className="tabular-nums text-neutral-900">{usd(grossAnnual)}</strong> per
          year. Every figure above is calculated on net-to-owner income after
          vacancy, collections loss and platform fees — not on gross.
        </span>
      </div>
    </div>
  );
}

// ---------- property facts ----------

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
    <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="print-keep border-b border-neutral-100 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-400">{k}</div>
          <div className="text-[13px] font-semibold text-neutral-900">{v}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- comparable sales ----------

// Public MLS record. A buyer checking whether the price is real looks
// here first, so it sits ahead of the return tables.
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
          <tr className="border-b border-neutral-300 text-left">
            {["Address", "Status", "Sq ft", "$/sq ft", "Sold", "Price"].map((hd, i) => (
              <th
                key={hd}
                className={`py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500 ${
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
            <tr key={c.id} className="print-keep border-b border-neutral-100">
              <td className="py-1.5 text-[12px] text-neutral-800">{c.address || "—"}</td>
              <td className="py-1.5 text-[11px] uppercase tracking-wider text-neutral-500">
                {c.comp_status}
              </td>
              <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-700">
                {c.approx_sqft ? c.approx_sqft.toLocaleString() : "—"}
              </td>
              <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-700">
                {c.price_per_sqft ? `$${Math.round(c.price_per_sqft)}` : "—"}
              </td>
              <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-500">
                {c.sold_date
                  ? new Date(c.sold_date).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })
                  : "—"}
              </td>
              <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-900">
                {c.sold_price ? usd(c.sold_price) : c.list_price ? usd(c.list_price) : "—"}
              </td>
            </tr>
          ))}

          <tr className="border-b-2 border-neutral-900 bg-neutral-50">
            <td className="py-1.5 text-[12px] font-bold text-neutral-900">This property</td>
            <td className="py-1.5 text-[11px] uppercase tracking-wider" style={{ color: GREEN }}>
              offered
            </td>
            <td className="py-1.5 text-right text-[12px] font-bold tabular-nums text-neutral-900">
              {sqft ? sqft.toLocaleString() : "—"}
            </td>
            <td className="py-1.5 text-right text-[12px] font-bold tabular-nums text-neutral-900">
              {subjectPsf ? `$${Math.round(subjectPsf)}` : "—"}
            </td>
            <td className="py-1.5" />
            <td className="py-1.5 text-right text-[12px] font-bold tabular-nums text-neutral-900">
              {listPrice ? usd(listPrice) : "—"}
            </td>
          </tr>
        </tbody>
      </table>

      {avgPsf && subjectPsf && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">
          Comparable sales average ${Math.round(avgPsf)} per square foot against $
          {Math.round(subjectPsf)} here
          {subjectPsf > avgPsf
            ? " — the difference reflects the co-living conversion, which none of these comps were sold as."
            : "."}{" "}
          Comps are conventional sales and were not operating as room rentals.
        </p>
      )}
    </div>
  );
}

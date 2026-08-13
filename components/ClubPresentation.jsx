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
export function FlyerMasthead({ deal = {}, beds, baths, sqft, price, scenarioLabel, defaults = null, readyDate = null, readyLabel = "Ready" }) {
  // Same fallback chain as the flyer: the deal's own hero, otherwise
  // the standard one from org_settings.
  const standard = defaults?.default_hero?.url || null;
  const own = deal.hero_image_url || null;

  // A dead URL is truthy, so the fallback above never fired for one —
  // the masthead rendered a broken-image icon instead of the standard
  // photo. onError steps down the chain at load time.
  const [src, setSrc] = useState(own || standard);
  const [failed, setFailed] = useState(false);

  const onError = () => {
    if (src !== standard && standard) setSrc(standard);
    else setFailed(true);
  };

  const heroUrl = failed ? null : src;

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
          {beds} bed · {baths} bath{baths === 1 ? "" : "s"}
          {sqft ? ` · ${sqft.toLocaleString()} sq ft finished` : ""}
        </p>

        {readyDate && (
          <p className="mt-1.5 inline-block rounded px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: "#F2FAF5", color: "#046A38" }}>
            {readyLabel}{" "}
            {new Date(readyDate + "T12:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      <div className="relative">
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroUrl}
            alt=""
            onError={onError}
            className="h-[230px] w-full object-cover object-center"
          />
        ) : (
          <div className="flex h-[230px] w-full items-center justify-center bg-neutral-200 text-[11px] text-neutral-500">
            Photography to follow
          </div>
        )}

        {/* Price plate, overlapping the photo as on the flyer */}
        <div
          className="absolute -bottom-4 right-0 px-6 py-2 text-[34px] font-black leading-none tracking-tight text-white"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          {usd(price)}
        </div>

        {sqft > 0 && (
          <div className="absolute -bottom-4 right-0 translate-y-full pt-1 text-right text-[10px] text-neutral-500">
            {usd(price / sqft)} per sq ft
          </div>
        )}

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

// ---------- occupancy control ----------

// The assumption everything else hangs off, so it sits with the
// headline figures rather than in a control bar further down. A slider
// because the useful action is sweeping a range to find where coverage
// breaks, not picking one value from a list.
export function OccupancyControl({ value, modelled, onChange, dscr }) {
  const shown = value ?? modelled;
  const overridden = value != null && Math.abs(value - modelled) > 0.001;

  return (
    <div
      className="no-print border-b px-8 py-3"
      style={{
        borderColor: overridden ? "#B45309" : "#E5E7EB",
        backgroundColor: overridden ? "#FFFBEB" : "#FAFAFA",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[6.5rem]">
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500">
            Occupancy
          </div>
          <div className="text-[22px] font-bold leading-none tabular-nums text-neutral-900">
            {Math.round(shown * 100)}%
          </div>
        </div>

        <input
          type="range"
          min={70}
          max={100}
          step={1}
          value={Math.round(shown * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="h-1 min-w-[180px] flex-1 cursor-pointer accent-[#00A651]"
          aria-label="Occupancy"
        />

        <div className="text-[11px] leading-snug text-neutral-600">
          {overridden ? (
            <>
              <strong>Your figure</strong>, not the modelled{" "}
              {Math.round(modelled * 100)}%.{" "}
              <button
                onClick={() => onChange(null)}
                className="underline underline-offset-2"
                style={{ color: "#B45309" }}
              >
                Reset
              </button>
            </>
          ) : (
            <>Modelled at {Math.round(modelled * 100)}%. Drag to test it.</>
          )}
          {dscr != null && Number.isFinite(dscr) && (
            <>
              {" · "}
              <span
                style={{
                  color: dscr < 1.2 ? "#B91C1C" : "#4B5563",
                  fontWeight: dscr < 1.2 ? 700 : 400,
                }}
              >
                DSCR {dscr.toFixed(2)}
                {dscr < 1.2 ? " — below most lender floors" : ""}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- what's included ----------

// The flyer's ink bar, carried across so the two documents read as a
// set. Also does real work here: it's what justifies the price
// against comps that sold as ordinary houses.
export function IncludedBar({ items, defaults = null }) {
  // flyer_copy.features is the same list the flyer prints, so the two
  // documents can't drift apart when the standard changes.
  const fromDefaults = Array.isArray(defaults?.flyer_copy?.features)
    ? defaults.flyer_copy.features.map((f) =>
        typeof f === "string" ? { icon: "✓", label: f } : f
      )
    : null;

  const list =
    (items && items.length && items) ||
    (fromDefaults && fromDefaults.length && fromDefaults) || [
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

export function PropertyGallery({ gallery = [], address, defaults = null }) {
  // The deal's own photographs first, then the standard interior set.
  // Deduplicated, because a deal that has adopted a standard shot as
  // its own would otherwise show it twice.
  const own = (Array.isArray(gallery) ? gallery : [])
    .map((g) => (typeof g === "string" ? g : g?.url))
    .filter(Boolean);

  const standard = (Array.isArray(defaults?.default_gallery) ? defaults.default_gallery : [])
    .map((g) => (typeof g === "string" ? g : g?.url))
    .filter(Boolean);

  // Photographs only. A line drawing cropped to a photo frame reads
  // as a mistake, so the plan is rendered separately below.
  const shots = [...new Set([...own, ...standard])];

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

// ---------- floor plan ----------

// Presented as the flyer does: contained rather than cropped, in a
// bordered panel with the room count in the heading. Uses the
// marketed plan, not the raw dimensioned sketch.
export function FloorPlan({ url, beds, baths, sqft }) {
  if (!url) return null;

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>
        Floor Plan — {beds} Bedroom{beds === 1 ? "" : "s"} | {baths} Bathroom
        {baths === 1 ? "" : "s"}
        {sqft ? ` | ${sqft.toLocaleString()} Sq Ft` : ""}
      </FlyerHeading>

      <div className="overflow-hidden rounded-xl border border-neutral-300 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Floor plan"
          className="mx-auto block max-h-[420px] w-full object-contain"
        />
      </div>

      <p className="mt-1.5 text-center text-[8px] italic text-neutral-500">
        This rendering is a representation. Actual layout may vary.
      </p>
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
    [
      "Of those, ensuite",
      Number(deal.ensuite_count) > 0 ? deal.ensuite_count : null,
    ],
    [
      deal.finished_sqft ? "Finished area" : "Living area",
      deal.finished_sqft
        ? `${deal.finished_sqft.toLocaleString()} sq ft`
        : deal.post_reno_sqft
        ? `${deal.post_reno_sqft.toLocaleString()} sq ft`
        : null,
    ],
    [
      "Underwritten at",
      deal.finished_sqft && deal.post_reno_sqft && deal.finished_sqft !== deal.post_reno_sqft
        ? `${deal.post_reno_sqft.toLocaleString()} sq ft`
        : null,
    ],
    [
      "Renovation",
      deal.reno_complete_actual
        ? `Complete ${new Date(deal.reno_complete_actual).toLocaleDateString()}`
        : deal.reno_complete_estimate
        ? `Anticipated ${new Date(deal.reno_complete_estimate).toLocaleDateString()}`
        : null,
    ],
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

// ---------- scenario descriptor ----------

// What actually changed between the cases. Without this the tabs are
// three unexplained numbers; an analyst wants the mechanism before
// they'll trust the spread.
//
// Deliberately shows the drivers rather than a haircut percentage —
// occupancy, collections and turnover are things a buyer can check
// against PadSplit's own market data.
export function ScenarioBasis({ scenario, income, expenses, exit, marketOccupancy, adjustable, onAdjust }) {
  const rows = [
    {
      label: "Occupancy",
      value: pct(income.occupancyPct, 0),
      note:
        scenario === "glbm"
          ? "our standard, not the ZIP average"
          : marketOccupancy && Math.abs(income.occupancyPct - marketOccupancy) < 0.005
          ? "the published market average for this ZIP"
          : marketOccupancy
          ? `${income.occupancyPct > marketOccupancy ? "+" : ""}${Math.round(
              (income.occupancyPct - marketOccupancy) * 100
            )} pts vs market`
          : null,
    },
    { label: "Collections", value: pct(income.collectionsPct, 0), note: "of dues billed" },
    {
      label: "Turnover",
      value: `${income.platform.turnsPerRoomPerYear}× / room / yr`,
      note: "drives booking fees, which don't fall with occupancy",
    },
    { label: "Rent growth", value: pct(income.growthPct, 0), note: "per year" },
    { label: "Expense growth", value: pct(expenses.growthPct, 0), note: "per year" },
    { label: "Appreciation", value: pct(exit.appreciationPct, 0), note: "per year" },
  ];

  const blurb = {
    glbm:
      "Green Light Buying Machine's own underwriting standard — the vacancy rate we hold every deal to, regardless of what a particular ZIP is running. This is the figure our deal-page pro forma uses.",
    bear:
      "Runs meaningfully below the market: occupancy light, members turning over faster, and costs growing quicker than rent. Not a disaster case — no vacancy event, no capital failure, no rate shock.",
    base:
      "Runs at the published market average for this ZIP. This is the case to underwrite against.",
    bull:
      "Runs above market with members staying longer. Occupancy is capped below 100% because a room that turns at all has a gap.",
  }[scenario];

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>
        {scenario === "glbm"
          ? "GLBM standard"
          : scenario === "bear"
          ? "Bear case"
          : scenario === "bull"
          ? "Bull case"
          : "Base case"}{" "}
        — what changes
      </FlyerHeading>

      <p className="mb-3 text-[11.5px] leading-snug text-neutral-700">{blurb}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="print-keep rounded-lg border border-neutral-200 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-500">
              {r.label}
            </div>
            <div className="text-[15px] font-bold tabular-nums leading-tight text-neutral-900">
              {r.value}
            </div>
            {r.note && (
              <div className="mt-0.5 text-[8.5px] leading-snug text-neutral-500">{r.note}</div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[9px] leading-relaxed text-neutral-500">
        All three cases share the same purchase price, room count, financing and
        expense stack. Only the operating assumptions above differ — the top
        line is calculated from them rather than adjusted by a flat percentage.
      </p>

      {/* An analyst who doesn't notice the edit control assumes the
          numbers are fixed, which defeats the point of offering it.
          Screen only — on paper there is nothing to click. */}
      {adjustable && (
        <div
          className="no-print mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
          style={{ borderColor: GREEN, backgroundColor: "#F2FAF5" }}
        >
          <span className="flex-1 text-[12px] leading-snug text-neutral-800">
            <strong>These are our assumptions.</strong> Change any of them to
            test the deal against yours — occupancy, turnover, the expense
            lines, the financing. Nothing you change is saved to our copy.
          </span>
          <button
            onClick={onAdjust}
            className="shrink-0 rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            Adjust assumptions
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- supporting documents ----------

// The evidence behind the numbers. Occupancy and comps are the two
// figures a buyer most wants to check, and handing over the source
// beats asking them to take our word for it.
const DOC_LABEL = {
  comps_package: "Comparable sales — MLS export",
  market_snapshot: "PadSplit market data for this ZIP",
  floor_plan: "Floor plan",
  assessor_record: "County assessor record",
  scope_of_work: "Scope of work",
};

export function SupportingDocuments({ documents = [] }) {
  if (!documents.length) return null;

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>Check It Yourself</FlyerHeading>

      <p className="mb-3 text-[11.5px] leading-snug text-neutral-600">
        The sources behind the figures on this sheet — the PadSplit market data
        the occupancy comes from, and the MLS export behind the comparable
        sales. We&rsquo;d rather you verified them than took our word.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {documents.map((d) => (
          <a
            key={d.id}
            href={d.public_url || "#"}
            target="_blank"
            rel="noreferrer"
            className="print-keep flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 transition hover:border-neutral-400"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[9px] font-black uppercase text-white"
              style={{ backgroundColor: INK }}
            >
              {(d.file_type || "doc").slice(0, 3)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-neutral-900">
                {d.buyer_label || DOC_LABEL[d.doc_type] || d.title}
              </span>
              <span className="block text-[10px] text-neutral-500">
                {new Date(d.created_at).toLocaleDateString()} · opens in a new tab
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ---------- city market report ----------

// Demographics behind the deal. A buyer underwriting one house wants
// to know the city is growing and that conventional rent is high
// enough that co-living undercuts it — that's the tenant demand
// argument, and it's separate from the property's own numbers.
export function MarketReport({ report, city, state }) {
  if (!report) return null;

  const growth =
    report.population && report.population_prior
      ? report.population / report.population_prior - 1
      : null;

  const cards = [
    report.population && {
      label: "Population",
      value: report.population.toLocaleString(),
      foot:
        growth != null
          ? `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}% year on year`
          : report.population_year
          ? String(report.population_year)
          : null,
      good: growth != null ? growth > 0 : null,
    },
    report.median_household_income && {
      label: "Median household income",
      value: usd(report.median_household_income),
      foot: report.median_age ? `median age ${report.median_age}` : null,
    },
    report.renter_share && {
      label: "Renter households",
      value: pct(report.renter_share, 0),
      foot: report.households ? `${report.households.toLocaleString()} households` : null,
    },
    report.median_rent_2br && {
      label: "Median rent, 2 bed",
      value: `${usd(report.median_rent_2br)}/mo`,
      foot:
        report.rent_yoy != null
          ? `${report.rent_yoy >= 0 ? "+" : ""}${(report.rent_yoy * 100).toFixed(1)}% year on year`
          : null,
    },
    report.median_home_value && {
      label: "Median home value",
      value: usd(report.median_home_value),
      foot:
        report.home_value_yoy != null
          ? `${report.home_value_yoy >= 0 ? "+" : ""}${(report.home_value_yoy * 100).toFixed(1)}% year on year`
          : null,
    },
  ].filter(Boolean);

  if (!cards.length) return null;

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>
        {city}
        {state ? `, ${state}` : ""} — market
      </FlyerHeading>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="print-keep rounded-lg border border-neutral-200 px-3 py-2.5">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-neutral-500">
              {c.label}
            </div>
            <div className="text-[17px] font-bold leading-tight tabular-nums text-neutral-900">
              {c.value}
            </div>
            {c.foot && (
              <div
                className="mt-0.5 text-[9px]"
                style={{ color: c.good === true ? "#046A38" : "#6B7280" }}
              >
                {c.foot}
              </div>
            )}
          </div>
        ))}
      </div>

      {report.major_employers?.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-neutral-600">
          <span className="font-semibold">Major employers:</span>{" "}
          {report.major_employers.join(", ")}.
        </p>
      )}

      {report.median_rent_2br && (
        <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
          A conventional two-bedroom runs {usd(report.median_rent_2br)} a month
          here. A private room in this house is a fraction of that, which is the
          demand argument for co-living — it isn&rsquo;t competing with houses,
          it&rsquo;s competing with a tenant&rsquo;s share of one.
        </p>
      )}

      {(report.source || report.as_of) && (
        <p className="mt-1.5 text-[9px] text-neutral-400">
          {report.source}
          {report.source && report.as_of ? " · " : ""}
          {report.as_of ? `as of ${new Date(report.as_of).toLocaleDateString()}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------- comps scatter ----------

// Square footage against price, subject plotted alongside. A table of
// numbers hides the thing that matters on a conversion: the comps sold
// as ordinary houses, and this one has three times their bedroom
// count. Bubble size carries beds so that reads at a glance.
export function CompsScatter({ comps = [], subject }) {
  const points = comps
    .filter((c) => Number(c.approx_sqft) > 0 && (Number(c.sold_price) > 0 || Number(c.list_price) > 0))
    .map((c) => ({
      sqft: Number(c.approx_sqft),
      price: Number(c.sold_price) || Number(c.list_price),
      beds: Number(c.bedrooms) || 0,
      label: c.address || "",
      closed: c.comp_status === "closed",
    }));

  if (points.length < 2 || !subject?.sqft || !subject?.price) return null;

  const all = [...points, { sqft: subject.sqft, price: subject.price, beds: subject.beds }];
  const W = 640;
  const H = 260;
  const padL = 58;
  const padR = 16;
  const padT = 16;
  const padB = 34;

  const xs = all.map((p) => p.sqft);
  const ys = all.map((p) => p.price);
  const xMin = Math.min(...xs) * 0.92;
  const xMax = Math.max(...xs) * 1.08;
  const yMin = Math.min(...ys) * 0.92;
  const yMax = Math.max(...ys) * 1.08;

  const x = (v) => padL + ((v - xMin) / (xMax - xMin)) * (W - padL - padR);
  const y = (v) => H - padB - ((v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const r = (beds) => 5 + Math.min(9, Math.max(0, beds)) * 0.9;

  const money = (n) => `$${Math.round(n / 1000)}K`;

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>Comps by size and price</FlyerHeading>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block" }}>
        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#E5E7EB" strokeWidth="1" />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#9AA3AB">
              {money(v)}
            </text>
          </g>
        ))}

        {[xMin, (xMin + xMax) / 2, xMax].map((v, i) => (
          <text key={i} x={x(v)} y={H - 12} textAnchor="middle" fontSize="9" fill="#9AA3AB">
            {Math.round(v).toLocaleString()} sf
          </text>
        ))}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.sqft)}
            cy={y(p.price)}
            r={r(p.beds)}
            fill={p.closed ? "#9AA3AB" : "#D4D4D4"}
            fillOpacity="0.75"
          />
        ))}

        <circle
          cx={x(subject.sqft)}
          cy={y(subject.price)}
          r={r(subject.beds) + 3}
          fill="none"
          stroke={GREEN}
          strokeWidth="2"
        />
        <circle cx={x(subject.sqft)} cy={y(subject.price)} r={r(subject.beds)} fill={GREEN} />
        <text
          x={x(subject.sqft)}
          y={y(subject.price) - r(subject.beds) - 7}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="700"
          fill={INK}
        >
          This property
        </text>

        <g transform={`translate(${padL + 4},${padT + 2})`}>
          <circle cx="5" cy="4" r="4" fill="#9AA3AB" fillOpacity="0.75" />
          <text x="14" y="7" fontSize="9" fill="#4B5563">
            Comparable sales
          </text>
          <circle cx="112" cy="4" r="4" fill={GREEN} />
          <text x="121" y="7" fontSize="9" fill="#4B5563">
            This property
          </text>
        </g>
      </svg>

      <p className="mt-1.5 text-[9px] leading-relaxed text-neutral-600">
        Bubble size is bedroom count. The comps sold as conventional homes;
        this one is configured for{" "}
        {subject.beds ? `${subject.beds} rentable bedrooms` : "co-living"}, which
        is why price per square foot alone understates it.
      </p>
    </div>
  );
}

// ---------- comparable sales ----------

export function CompsTable({ comps = [], listPrice, sqft, subjectBeds, subjectBaths, subjectYear }) {
  if (!comps.length) return null;

  // Same shape the flyer's compStats carries: closed sales only, with
  // range, central tendency, price per foot and how fresh the data is.
  // A buyer's analyst asks all four before anything else.
  const closed = comps.filter((c) => c.comp_status === "closed" && Number(c.sold_price) > 0);
  const prices = closed.map((c) => Number(c.sold_price)).sort((a, b) => a - b);

  const median = (arr) =>
    !arr.length
      ? null
      : arr.length % 2
      ? arr[(arr.length - 1) / 2]
      : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

  const psfValues = closed
    .map((c) => Number(c.price_per_sqft))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const dates = closed.map((c) => c.sold_date).filter(Boolean).sort();
  const newest = dates.length ? new Date(dates[dates.length - 1]) : null;
  const monthsSinceNewest = newest
    ? Math.max(0, Math.round((Date.now() - newest.getTime()) / 2.628e9))
    : null;

  const stats = prices.length
    ? {
        count: prices.length,
        low: prices[0],
        high: prices[prices.length - 1],
        avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        median: median(prices),
        medianPsf: median(psfValues),
        monthsSinceNewest,
      }
    : null;

  const subjectPsf = listPrice && sqft ? listPrice / sqft : null;
  const belowLow = stats && listPrice && listPrice < stats.low;

  return (
    <div>
      {stats && (
        <div className="print-keep mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Closed Comps", value: String(stats.count), foot: stats.monthsSinceNewest != null ? `newest ${stats.monthsSinceNewest} mo ago` : null },
            { label: "Median Sale", value: usd(stats.median), foot: `${usd(stats.low)} – ${usd(stats.high)}` },
            { label: "Average Sale", value: usd(stats.avg), foot: "closed sales only" },
            { label: "Median $/Sq Ft", value: stats.medianPsf ? `$${Math.round(stats.medianPsf)}` : "—", foot: subjectPsf ? `this property $${Math.round(subjectPsf)}` : null },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-neutral-300 px-3 py-2.5">
              <div className="text-[10px] font-black uppercase tracking-wide text-neutral-600">
                {c.label}
              </div>
              <div className="mt-0.5 text-[19px] font-black leading-none tabular-nums text-neutral-900">
                {c.value}
              </div>
              {c.foot && <div className="mt-1 text-[8.5px] text-neutral-600">{c.foot}</div>}
            </div>
          ))}
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            {["Address", "Bd/Ba", "Built", "Sq Ft", "$/Sq Ft", "Sold", "Price"].map((hd, i) => (
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
              <td className="py-1.5 text-[11.5px] text-neutral-800">{c.address || "\u2014"}</td>
              <td className="py-1.5 text-[11px] tabular-nums text-neutral-600">
                {c.bedrooms || c.bathrooms
                  ? `${c.bedrooms ?? "—"}/${c.bathrooms ?? "—"}`
                  : "—"}
              </td>
              <td className="py-1.5 text-right text-[11px] tabular-nums text-neutral-600">
                {c.year_built || "—"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-700">
                {c.approx_sqft ? c.approx_sqft.toLocaleString() : "\u2014"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-700">
                {c.price_per_sqft ? `$${Math.round(c.price_per_sqft)}` : "\u2014"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] tabular-nums text-neutral-500">
                {c.sold_date
                  ? new Date(c.sold_date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                  : "\u2014"}
              </td>
              <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
                {c.sold_price ? usd(c.sold_price) : c.list_price ? usd(c.list_price) : "\u2014"}
              </td>
            </tr>
          ))}

          <tr className="border-b-2 border-neutral-900" style={{ backgroundColor: "#F2FAF5" }}>
            <td className="py-1.5 text-[11.5px] font-black uppercase text-neutral-900">
              This property
            </td>
            <td className="py-1.5 text-[11px] font-bold tabular-nums" style={{ color: GREEN }}>
              {subjectBeds ?? "—"}/{subjectBaths ?? "—"}
            </td>
            <td className="py-1.5 text-right text-[11px] tabular-nums text-neutral-700">
              {subjectYear || "—"}
            </td>
            <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
              {sqft ? sqft.toLocaleString() : "\u2014"}
            </td>
            <td className="py-1.5 text-right text-[11.5px] font-bold tabular-nums text-neutral-900">
              {subjectPsf ? `$${Math.round(subjectPsf)}` : "\u2014"}
            </td>
            <td className="py-1.5" />
            <td className="py-1.5 text-right text-[11.5px] font-black tabular-nums text-neutral-900">
              {listPrice ? usd(listPrice) : "\u2014"}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-2 text-[9px] leading-relaxed text-neutral-600">
        {belowLow
          ? "Offered below the lowest closed comparable in this set. "
          : stats && stats.medianPsf && subjectPsf && subjectPsf > stats.medianPsf
          ? `Offered at $${Math.round(subjectPsf)} per square foot against a $${Math.round(stats.medianPsf)} median \u2014 the difference reflects the co-living conversion, the furniture package and the completed PadSplit launch. `
          : ""}
        Comparables are conventional sales; none were operating as room
        rentals, and none included furniture or a live platform listing.
        {stats && stats.monthsSinceNewest != null && stats.monthsSinceNewest > 6
          ? ` The most recent closed sale is ${stats.monthsSinceNewest} months old \u2014 treat the range as indicative.`
          : ""}
      </p>
    </div>
  );
}

// ---------- down payment options ----------

// Built from the same rate card the deal-page pro forma uses, so the
// two documents can't quote different financing on one house. This is
// part of the underwriting, not a lender advert — it renders whether
// or not a lender option row exists.
export function DownPaymentOptions({ options = [], noi }) {
  if (!options.length) return null;

  const best = options.reduce(
    (a, b) => ((b.cashOnCash ?? -1) > (a.cashOnCash ?? -1) ? b : a),
    options[0]
  );
  const lightest = options.reduce((a, b) => (b.downPct < a.downPct ? b : a), options[0]);
  const heaviest = options.reduce((a, b) => (b.downPct > a.downPct ? b : a), options[0]);

  const rows = [
    ["Down payment", (o) => usd(o.down)],
    ["Loan amount", (o) => usd(o.loan)],
    ["Rate", (o) => `${(o.rate * 100).toFixed(3)}%`],
    ["Origination", (o) => usd(o.origination)],
    ["Closing costs", (o) => usd(o.closingCosts)],
    ["Total cash to close", (o) => usd(o.cashIn), true],
    ["Debt service / mo", (o) => `(${usd(o.payment)})`],
    ["Cash flow / mo", (o) => usd(o.cashFlow / 12), false, true],
    ["Cash on cash", (o) => pct(o.cashOnCash)],
    ["DSCR", (o) => (o.dscr ?? 0).toFixed(2)],
  ];

  return (
    <div className="print-section px-8 pb-4">
      <FlyerHeading>Down Payment Options</FlyerHeading>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px]">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th />
              {options.map((o) => (
                <th
                  key={o.downPct}
                  className="py-1.5 text-right text-[12px] font-black text-neutral-900"
                >
                  {Math.round(o.downPct * 100)}% down
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fn, bold, green]) => (
              <tr
                key={label}
                className={bold ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"}
              >
                <td className={`py-1.5 text-[12px] ${bold ? "font-bold text-neutral-900" : "text-neutral-700"}`}>
                  {label}
                </td>
                {options.map((o) => (
                  <td
                    key={o.downPct}
                    className={`py-1.5 text-right text-[12px] tabular-nums ${
                      bold ? "font-bold text-neutral-900" : "text-neutral-800"
                    }`}
                    style={green ? { color: GREEN, fontWeight: 600 } : undefined}
                  >
                    {fn(o)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <div
            key={o.downPct}
            className="print-keep rounded-lg border px-3 py-2.5"
            style={{
              borderColor: o.downPct === best.downPct ? GREEN : "#E5E7EB",
              backgroundColor: o.downPct === best.downPct ? "#F2FAF5" : "white",
            }}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold text-neutral-900">
                {Math.round(o.downPct * 100)}% down
              </span>
              {o.downPct === best.downPct && (
                <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: GREEN }}>
                  Best return
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-neutral-600">
              {usd(o.cashIn)} in · {pct(o.cashOnCash)} back
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-600">
              {o.downPct === lightest.downPct
                ? "Least cash in, most leverage. Highest rate and thinnest coverage — the tier a lender scrutinises most."
                : o.downPct === heaviest.downPct
                ? "Most cash in, cheapest rate, strongest coverage. Easiest to get written."
                : "The middle, where the rate improvement is usually largest relative to the extra equity."}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
        Same price and term throughout. Origination is a point charge on the
        loan, so it falls as the down payment rises; closing costs are fixed.
        Cash flow and coverage use the net operating income above.
      </p>
    </div>
  );
}

// ---------- readiness ----------

export function Readiness({ deal = {}, sqft }) {
  const date = deal.reno_complete_date;
  if (!date && !sqft) return null;

  const when = date
    ? new Date(date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const past = date && new Date(date) < new Date();

  return (
    <div className="print-section px-8 pb-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {sqft > 0 && (
          <div className="print-keep rounded-lg border border-neutral-200 px-4 py-3">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
              Finished square footage
            </div>
            <div className="text-[20px] font-bold tabular-nums leading-tight text-neutral-900">
              {sqft.toLocaleString()} sq ft
            </div>
            <div className="text-[10px] text-neutral-500">after renovation</div>
          </div>
        )}

        {when && (
          <div
            className="print-keep rounded-lg border-2 px-4 py-3"
            style={{ borderColor: past ? "#E5E7EB" : GREEN }}
          >
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
              {past ? "Renovation complete" : "Anticipated completion"}
            </div>
            <div className="text-[20px] font-bold leading-tight text-neutral-900">
              {when}
            </div>
            <div className="text-[10px] text-neutral-500">
              {past
                ? "Operating now"
                : deal.reno_complete_estimated === false
                ? "Firm date"
                : "Estimated — construction dates move"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- closing bar ----------

// The flyer's dark foot, so the two documents end the same way.
export function FlyerFooter({ deal = {}, market = null, hasOwnPhotos, defaults = null, adjusted = false }) {
  const about = defaults?.flyer_copy?.about;
  const closing = defaults?.flyer_copy?.closing;
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
              {about ||
                "Renovated, furnished and launched to Green Light Buying Machine standards."}{" "}
              The projections in this document are built room by room and
              reduced to net-to-owner income before any return is calculated —
              no figure here is stated on gross rent.
            </p>
            <p className="mt-2 text-[9.5px] font-black uppercase" style={{ color: LIME }}>
              {closing || "Simply close and begin operating."}
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

      {adjusted && (
        <p className="pt-3 text-center text-[8px] font-bold uppercase tracking-wide text-amber-800">
          This copy reflects assumptions adjusted by the recipient and is not
          the version issued by Green Light Buying Machine.
        </p>
      )}

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

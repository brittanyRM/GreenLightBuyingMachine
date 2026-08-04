"use client";

import { computeProForma, usd, num, roomMix, roomRate } from "../lib/proforma";

// ============================================================
// Turnkey PadSplit flyer — print/PDF at 8.5x11.
// Reads the same deal bundle as the pro forma and the email.
// ============================================================

const GREEN = "#00A651";
const LIME = "#8CC63F";

const DEFAULT_INCLUDES = [
  "Complete furniture package",
  "Kitchen inventory",
  "Smart locks installed",
  "Professional photography",
  "PadSplit listing created",
  "Host launch completed",
  "Operations ready",
];

const DEFAULT_FEATURES = [
  "Fully renovated to Green Light Buying Machine standards",
  "Fully furnished",
  "Launched on PadSplit platform",
  "Digital smart locks",
  "High-speed internet installed",
  "Kitchen fully equipped",
  "Laundry room complete",
];

function Check() {
  return (
    <span
      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ backgroundColor: GREEN }}
    >
      ✓
    </span>
  );
}

export default function DealFlyer({
  deal,
  rooms = [],
  market = null,
  comps = [],
  orgRows = null,
  includes = DEFAULT_INCLUDES,
  features = DEFAULT_FEATURES,
}) {
  const p = computeProForma({ deal, rooms, market, comps, orgRows });
  const mix = roomMix(rooms);
  const sqft = deal.post_reno_sqft || deal.living_area_sqft;

  const bedrooms = rooms.filter(
    (r) => r.room_type === "shared" || r.room_type === "ensuite"
  );

  return (
    <div className="mx-auto w-full max-w-[850px] bg-white font-sans text-neutral-900 print:max-w-none">
      {/* ---------- HERO ---------- */}
      <div className="relative">
        <div className="grid grid-cols-[1.15fr_1fr]">
          <div className="px-8 pb-4 pt-8">
            <h1 className="text-[42px] font-black uppercase leading-[0.85] tracking-tight">
              Turnkey
              <br />
              PadSplit
            </h1>
            <div
              className="mt-2 inline-block px-3 py-1 text-[13px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: "#2E4A2E" }}
            >
              Fully furnished &amp; launched
            </div>
            <p className="mt-2 text-[13px] font-bold italic uppercase text-neutral-700">
              Cash-flow ready from day one
            </p>
          </div>

          <div className="relative">
            {deal.hero_image_url ? (
              <img
                src={deal.hero_image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[150px] items-center justify-center bg-neutral-200 text-[11px] text-neutral-500">
                Hero photo
              </div>
            )}
            <div
              className="absolute -bottom-3 right-0 px-5 py-2 text-[32px] font-black leading-none text-white"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              {usd(p.price)}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- SPECS / MARKET / INCOME ---------- */}
      <div className="grid grid-cols-[1.05fr_0.9fr_1fr] gap-5 px-8 pb-5 pt-6">
        {/* Specs */}
        <ul className="space-y-1.5">
          <li className="flex gap-2 border-b border-neutral-200 pb-1.5 text-[12px] font-semibold">
            <Check />
            {mix.bedrooms} Bedrooms | {deal.bathrooms} Bathrooms
          </li>
          {sqft && (
            <li className="flex gap-2 border-b border-neutral-200 pb-1.5 text-[12px] font-semibold">
              <Check />
              {num(sqft)} Sq Ft
            </li>
          )}
          {features.map((f) => (
            <li
              key={f}
              className="flex gap-2 border-b border-neutral-200 pb-1.5 text-[12px] text-neutral-800"
            >
              <Check />
              {f}
            </li>
          ))}
        </ul>

        {/* Market */}
        <div className="border-l border-neutral-200 pl-5">
          <h3
            className="text-[12px] font-black uppercase tracking-wide"
            style={{ color: "#2E4A2E" }}
          >
            Market data ({deal.city}, {deal.state})
          </h3>
          {market ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none" style={{ color: GREEN }}>
                  ⌂
                </span>
                <div>
                  <div className="text-[13px] font-bold">
                    {num(market.active_units)} Active Units
                  </div>
                  <div className="text-[12px] font-semibold text-neutral-600">
                    {num(market.upcoming_units)} Upcoming Units
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none" style={{ color: GREEN }}>
                  $
                </span>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wide">
                    Weekly room price
                  </div>
                  <div className="mt-1 text-[12px] text-neutral-700">
                    <span className="font-bold">{usd(market.shared_weekly)}</span> per
                    week
                    <br />
                    with a shared bathroom
                  </div>
                  <div className="mt-1.5 text-[12px] text-neutral-700">
                    <span className="font-bold">{usd(market.private_weekly)}</span> per
                    week
                    <br />
                    with a private bathroom
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-neutral-600">
                {Math.round(market.avg_occupancy * 100)}% average occupancy ·{" "}
                {market.days_to_first_booking} days to first booking
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-neutral-400">
              No market data saved for {deal.zip}.
            </p>
          )}
        </div>

        {/* Income */}
        <div className="rounded-lg border border-neutral-300 p-4">
          <h3 className="text-[13px] font-black uppercase tracking-wide">
            Projected income
          </h3>
          <div className="mt-3 text-[11px] font-semibold text-neutral-600">
            Estimated Gross
            <br />
            Monthly Income:
          </div>
          <div className="text-[30px] font-black leading-none">
            {usd(p.grossMonthly)}
          </div>
          <div className="my-3 border-t border-neutral-200" />
          <div className="text-[11px] font-semibold text-neutral-600">
            Estimated Annual
            <br />
            Gross Income:
          </div>
          <div className="text-[30px] font-black leading-none">
            {usd(p.grossAnnual)}
          </div>
          <p className="mt-3 text-[9.5px] leading-snug text-neutral-500">
            Higher income may be achievable with premium room positioning,
            amenities, and optimized pricing strategies.
          </p>
        </div>
      </div>

      {/* ---------- INCLUDED BAR ---------- */}
      <div className="mx-8 rounded-xl px-6 py-4" style={{ backgroundColor: "#141914" }}>
        <h3
          className="text-[12px] font-black uppercase tracking-wide"
          style={{ color: LIME }}
        >
          Included with purchase
        </h3>
        <div className="mt-3 grid grid-cols-7 gap-3">
          {includes.map((item) => (
            <div key={item} className="text-center">
              <div
                className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: LIME, color: LIME }}
              >
                <span className="text-xs">✓</span>
              </div>
              <div className="text-[9px] font-semibold leading-tight text-white">
                {item}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- FLOOR PLAN ---------- */}
      <div className="px-8 py-5">
        <h3 className="mb-2 text-right text-[13px] font-black uppercase tracking-wide">
          Floor plan — {mix.bedrooms} bedrooms | {deal.bathrooms} bathrooms
          {sqft ? ` | ${num(sqft)} sq ft` : ""}
        </h3>

        <div className="relative overflow-hidden rounded border border-neutral-300 bg-white">
          {deal.floor_plan_url ? (
            <>
              <img src={deal.floor_plan_url} alt="Floor plan" className="block w-full" />
              {rooms
                .filter((r) => r.plan_x != null && r.plan_y != null)
                .map((r) => (
                  <div
                    key={r.id || r.room_number}
                    className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold text-white shadow"
                    style={{
                      left: `${r.plan_x}%`,
                      top: `${r.plan_y}%`,
                      backgroundColor:
                        r.room_type === "ensuite"
                          ? GREEN
                          : r.room_type === "bath"
                          ? "#2563EB"
                          : "#1F2937",
                    }}
                  >
                    {r.label}
                    {r.room_type === "ensuite" && " ✦"}
                  </div>
                ))}
            </>
          ) : (
            <div className="flex h-48 items-center justify-center text-[11px] text-neutral-400">
              Draw the layout in Conversion Sketch to populate this.
            </div>
          )}
        </div>

        {/* Room rate strip */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {bedrooms.map((r) => {
            const isEnsuite = r.room_type === "ensuite";
            return (
              <div
                key={r.id || r.room_number}
                className="flex items-center gap-1.5 rounded border px-2 py-1"
                style={{
                  borderColor: isEnsuite ? GREEN : "#D4D4D4",
                  backgroundColor: isEnsuite ? "rgba(0,166,81,0.07)" : "white",
                }}
              >
                <span className="text-[10px] font-bold text-neutral-800">
                  {r.label}
                </span>
                {isEnsuite && (
                  <span
                    className="text-[8px] font-black uppercase"
                    style={{ color: GREEN }}
                  >
                    Ensuite
                  </span>
                )}
                <span className="text-[10px] font-semibold tabular-nums text-neutral-600">
                  {usd(roomRate(r, market))}/wk
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-center text-[9px] italic text-neutral-500">
          This rendering is a representation. Actual layout may vary.
        </p>
      </div>

      {/* ---------- ABOUT ---------- */}
      <div className="mx-8 grid grid-cols-2 gap-0 overflow-hidden rounded-t-xl">
        <div className="p-5" style={{ backgroundColor: "#141914" }}>
          <h4
            className="text-[11px] font-black uppercase tracking-wide"
            style={{ color: LIME }}
          >
            About this property
          </h4>
          <p className="mt-2 text-[9.5px] leading-relaxed text-neutral-300">
            Designed specifically for the growing co-living market, this home
            provides investors with a professionally renovated, fully furnished,
            income-producing asset that eliminates months of planning,
            construction, furnishing, and onboarding.
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase" style={{ color: LIME }}>
            Simply close and begin operating.
          </p>
        </div>
        <div className="p-5" style={{ backgroundColor: "#1C231C" }}>
          <h4
            className="text-[11px] font-black uppercase tracking-wide"
            style={{ color: LIME }}
          >
            ◉ {deal.city}, {deal.state}
          </h4>
          <p className="mt-2 text-[9.5px] leading-relaxed text-neutral-300">
            {market && market.upcoming_units === 0
              ? "High rental demand area with strong cash flow potential and minimal upcoming competition."
              : "High rental demand area with strong cash flow potential."}
            {p.compStats &&
              ` Closed comps average ${usd(p.compStats.avg)} in this submarket.`}
          </p>
          <p className="mt-3 text-[11px] font-black uppercase leading-tight text-white">
            Don't miss out on this turnkey investment opportunity!
          </p>
        </div>
      </div>

      {/* ---------- FOOTER ---------- */}
      <div
        className="mx-8 mb-8 flex items-center justify-between rounded-b-xl px-5 py-3"
        style={{ backgroundColor: "#0D110D" }}
      >
        <div>
          <div className="text-[15px] font-black uppercase leading-none text-white">
            Green <span style={{ color: LIME }}>Light</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Buying Machine
          </div>
          <div className="text-[7px] uppercase tracking-[0.3em] text-neutral-600">
            The Coliving Ecosystem
          </div>
        </div>
        <div className="text-right text-[11px] font-semibold leading-tight text-white">
          Solving Affordable Housing
          <br />
          One Room at a Time.
        </div>
      </div>
    </div>
  );
}

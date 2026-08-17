"use client";

import { computeProForma, usd, num, roomMix, roomRate } from "../lib/proforma";
import { useEffect, useRef } from "react";
import { roomColor } from "../lib/rooms";
import { BrandMark } from "./Brand";

// ============================================================
// Turnkey PadSplit flyer — 8.5 x 11, print to PDF.
// Laid out to match the printed original: masthead over a hero
// photo with the price plate overlapping it, a three-column
// band, the included bar, finishes beside the plan, and the
// dark about/footer.
// ============================================================

const GREEN = "#00A651";
const LIME = "#8CC63F";
const BANNER = "#2E4A2E";
const INK = "#141914";

const DEFAULT_INCLUDES = [
  { label: "Complete Furniture Package", icon: "▭" },
  { label: "Kitchen Inventory", icon: "🍴" },
  { label: "Smart Locks Installed", icon: "🔒" },
  { label: "Professional Photography", icon: "📷" },
  { label: "PadSplit Listing Created", icon: "🖥" },
  { label: "Host Launch Completed", icon: "🚀" },
  { label: "Operations Ready", icon: "✓" },
];

const DEFAULT_FEATURES = [
  "Fully Renovated to Green Light Buying Machine Standards",
  "Fully Furnished",
  "Launched on PadSplit Platform",
  "Digital Smart Locks",
  "High-Speed Internet Installed",
  "Kitchen Fully Equipped",
  "Laundry Room Complete",
];

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

export default function DealFlyer({
  deal,
  rooms = [],
  market = null,
  comps = [],
  orgRows = null,
  includes = DEFAULT_INCLUDES,
  features,
  finishes = [],
  defaults = {},
}) {
  const sheetRef = useRef(null);
  const innerRef = useRef(null);

  // Fit the sheet to one page before the print dialog opens.
  //
  // CSS can't measure, so a fixed height either clipped the closing
  // paragraph or spilled a near-blank second page. This measures the
  // rendered height and scales the sheet down to a US Letter page —
  // 11in at 96dpi — leaving it untouched when it already fits.
  useEffect(() => {
    const PAGE_PX = 1056; // 11in
    // The outer box now carries the drawn height, so pagination and
    // appearance agree and the old safety allowances were just making
    // the sheet small. Keep a hair of rounding room, nothing more.
    const MARGIN = 8;
    const SAFETY = 0.995;

    const fit = () => {
      const el = sheetRef.current;
      const inner = innerRef.current;
      if (!el || !inner) return;

      inner.style.setProperty("--print-scale", "1");
      el.style.height = "";

      const h = inner.scrollHeight;
      const scale = h > 0 ? Math.min(1, ((PAGE_PX - MARGIN) / h) * SAFETY) : 1;

      inner.style.setProperty("--print-scale", scale.toFixed(4));

      // Mark the sheet's ancestors. Everything else on the page — the
      // tab bar's siblings, panels, notes, whatever else the route
      // renders — is hidden by the matching CSS rule, so nothing but
      // the flyer can reach the printer.
      document
        .querySelectorAll("[data-print-keep]")
        .forEach((n) => n.removeAttribute("data-print-keep"));
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        n.setAttribute("data-print-keep", "");
      }
      document.body.setAttribute("data-print-keep", "");
      // The outer box takes the drawn height, so the page measures what
      // it actually sees. Scaling alone left the box full height and
      // break-inside clipped the foot off every time.
      // Hard cap at one page. The measurement runs before print styles
      // fully apply, so the computed height can come out a little over
      // — and a single pixel past the page box is a whole extra sheet.
      el.style.height = `${Math.min(Math.ceil(h * scale), PAGE_PX - MARGIN)}px`;
    };

    const reset = () => {
      innerRef.current?.style.setProperty("--print-scale", "1");
      if (sheetRef.current) sheetRef.current.style.height = "";
      document
        .querySelectorAll("[data-print-keep]")
        .forEach((n) => n.removeAttribute("data-print-keep"));
    };

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);

    // Safari fires neither reliably; the media query listener does.
    const mq = window.matchMedia?.("print");
    const onChange = (e) => (e.matches ? fit() : reset());
    mq?.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      mq?.removeEventListener?.("change", onChange);
    };
  }, []);

  const p = computeProForma({ deal, rooms, market, comps, orgRows });
  const mix = roomMix(rooms);
  // finished_sqft is measured on completion; post_reno_sqft is what we
  // underwrote to. Once the real number exists it wins, so the flyer
  // stops advertising an estimate.
  const sqft = deal.finished_sqft || deal.post_reno_sqft || deal.living_area_sqft;
  // Room chips follow the record, like every other count on this page.
  //
  // Drawn rooms are used where they exist, because per-room rates and
  // labels live on them. Where the record says more rooms than have
  // been traced, the remainder are filled in — otherwise the heading
  // says nine bedrooms and the chips below it show eight.
  const drawnBedrooms = rooms.filter(
    (r) => r.room_type === "shared" || r.room_type === "ensuite"
  );

  const bedrooms = (() => {
    const target = mix.bedrooms || drawnBedrooms.length;
    if (drawnBedrooms.length >= target) return drawnBedrooms.slice(0, target);

    const ensuiteShort = Math.max(
      0,
      mix.ensuiteCount - drawnBedrooms.filter((r) => r.room_type === "ensuite").length
    );

    const filler = Array.from({ length: target - drawnBedrooms.length }, (_, i) => {
      const n = drawnBedrooms.length + i + 1;
      return {
        id: `record-${n}`,
        room_number: n,
        label: `Bedroom ${n}`,
        room_type: i < ensuiteShort ? "ensuite" : "shared",
      };
    });

    return [...drawnBedrooms, ...filler];
  })();
  // Deal-specific first, then the brand standard. A flyer should never
  // go out with empty swatches just because nobody re-uploaded the same
  // flooring sample for the ninth time.
  const finishList = (
    finishes.length
      ? finishes
      : deal.finishes?.length
      ? deal.finishes
      : defaults?.default_finishes || []
  ).slice(0, 6);

  const heroUrl = deal.hero_image_url || defaults?.default_hero?.url || null;

  const copy = defaults?.flyer_copy || {};
  const featureList = features || copy.features || DEFAULT_FEATURES;
  const aboutText = copy.about ||
    "Designed specifically for the growing co-living market, this home provides investors with a professionally renovated, fully furnished, income-producing asset that eliminates months of planning, construction, furnishing, and onboarding.";
  const closingText = copy.closing || "Simply close and begin operating.";

  const usingStandardPhotos = !deal.hero_image_url && !!heroUrl;

  return (
    <div
      ref={sheetRef}
      className="print-sheet relative mx-auto w-full max-w-[816px] bg-white font-sans text-neutral-900"
    >
      <div ref={innerRef} className="print-sheet-inner">
      {/* ================= MASTHEAD ================= */}
      {/* Photo bleeds to the top and right page edges, as printed */}
      <div className="relative grid grid-cols-[0.88fr_1fr]">
        <div className="pl-8 pr-2 pt-7">
          <BrandMark height={40} className="mb-3" />
          <h1 className="text-[46px] font-black uppercase leading-[0.82] tracking-[-0.02em]">
            Turnkey
            <br />
            PadSplit
          </h1>

          {/* Banner with the arrow point on the right */}
          <div
            className="mt-2 inline-block py-[5px] pl-3 pr-7 text-[12.5px] font-bold uppercase tracking-wide text-white"
            style={{
              backgroundColor: BANNER,
              clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
            }}
          >
            Fully Furnished &amp; Launched
          </div>

          <p className="mt-2 text-[13px] font-bold italic uppercase tracking-tight text-neutral-800">
            Cash-Flow Ready From Day One
          </p>
        </div>

        <div className="relative">
          {heroUrl ? (
            <img
              src={heroUrl}
              alt=""
              className="h-[192px] w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-[192px] w-full items-center justify-center bg-neutral-200 text-[11px] text-neutral-500">
              Hero photo
            </div>
          )}

          {/* Price plate overlapping the photo */}
          <div
            className="absolute -bottom-4 right-0 px-6 py-2 text-[34px] font-black leading-none tracking-tight text-white"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            {usd(p.price)}
          </div>

          {/* Cost per foot under the plate. The comps table is quoted
              in $/sq ft, so a buyer comparing them needs the same unit
              on the subject without doing the arithmetic. */}
          {sqft > 0 && (
            <div className="absolute -bottom-4 right-0 translate-y-full pt-1 pr-1 text-right text-[9px] text-neutral-500">
              {usd(p.price / sqft)} per sq ft · {usd(p.price / mix.bedrooms)} per bedroom
            </div>
          )}
        </div>
      </div>

      {/* ================= THREE-COLUMN BAND ================= */}
      <div className="grid grid-cols-[0.95fr_0.85fr_0.95fr] gap-0 px-8 pb-4 pt-8">
        {/* Checklist */}
        <ul className="pr-5">
          <li className="flex gap-2 border-b border-neutral-200 pb-[5px] text-[11.5px] font-semibold">
            <Check />
            {mix.bedrooms} Bedrooms | {mix.bathrooms} Bathroom
            {mix.bathrooms === 1 ? "" : "s"}
            {mix.ensuiteCount > 0
              ? ` (${mix.commonBathrooms} common + ${mix.ensuiteCount} ensuite)`
              : ""}
          </li>
          {sqft && (
            <li className="flex gap-2 border-b border-neutral-200 py-[5px] text-[11.5px] font-semibold">
              <Check />
              {num(sqft)} Sq Ft
            </li>
          )}
          {featureList.map((f) => (
            <li
              key={f}
              className="flex gap-2 border-b border-neutral-200 py-[5px] text-[11.5px] leading-snug text-neutral-800"
            >
              <Check />
              {f}
            </li>
          ))}
        </ul>

        {/* Market data, with the vertical rule on its left */}
        <div className="border-l border-neutral-300 px-5">
          <h3 className="text-[12px] font-black uppercase tracking-wide" style={{ color: BANNER }}>
            Market Data ({deal.city}, {deal.state})
          </h3>

          {market ? (
            <div className="mt-3 space-y-3.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[17px] leading-none" style={{ color: BANNER }}>
                  ⌂
                </span>
                <div>
                  <div className="text-[13px] font-bold">
                    {num(market.active_units)} Active Units
                  </div>
                  <div className="mt-1.5 text-[13px] font-bold">
                    {num(market.upcoming_units)} Upcoming Units
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                  style={{ borderColor: BANNER, color: BANNER }}
                >
                  $
                </span>
                <div>
                  <div className="text-[11.5px] font-black uppercase tracking-wide">
                    Weekly Room Price
                  </div>
                  <div className="mt-1.5 text-[12px] leading-snug text-neutral-800">
                    {usd(market.shared_weekly)} per week
                    <br />
                    with a shared bathroom
                  </div>
                  <div className="mt-2 text-[12px] leading-snug text-neutral-800">
                    {usd(market.private_weekly)} per week
                    <br />
                    with a private bathroom
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-neutral-400">
              No market data saved for {deal.zip}.
            </p>
          )}
        </div>

        {/* Projected income */}
        <div className="ml-1 rounded-xl border border-neutral-300 px-4 py-3">
          <h3 className="text-[13px] font-black uppercase tracking-wide">Projected Income</h3>

          <div className="mt-2.5 text-[11.5px] font-semibold leading-tight text-neutral-700">
            Estimated Gross
            <br />
            Monthly Income:
          </div>
          <div className="mt-1 text-[30px] font-black leading-none">{usd(p.grossMonthly)}</div>

          <div className="my-2.5 border-t border-neutral-300" />

          <div className="text-[11.5px] font-semibold leading-tight text-neutral-700">
            Estimated Annual
            <br />
            Gross Income:
          </div>
          <div className="mt-1 text-[30px] font-black leading-none">{usd(p.grossAnnual)}</div>

          <p className="mt-2.5 text-[8.5px] leading-snug text-neutral-600">
            Higher income may be achievable with premium room positioning, amenities, and
            optimized pricing strategies.
          </p>
        </div>
      </div>

      {/* ================= INCLUDED BAR ================= */}
      <div className="mx-8 rounded-xl px-5 py-3.5" style={{ backgroundColor: INK }}>
        <h3 className="text-[12px] font-black uppercase tracking-wide" style={{ color: LIME }}>
          Included With Purchase
        </h3>

        <div className="mt-3 flex items-start">
          {includes.map((item, i) => {
            const label = typeof item === "string" ? item : item.label;
            const icon = typeof item === "string" ? "✓" : item.icon;
            return (
              <div key={label} className="flex items-start">
                {/* Divider after the fourth item, as on the original */}
                {i === 4 && <div className="mx-3 h-12 w-px shrink-0 bg-neutral-600" />}
                <div className="w-[76px] px-1 text-center">
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

      {/* ================= FINISHES + FLOOR PLAN ================= */}
      <div className="grid grid-cols-[0.62fr_1fr] gap-4 px-8 pb-2 pt-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-neutral-400" />
            <h3 className="text-[10.5px] font-black uppercase tracking-wide">Interior Finishes</h3>
            <div className="h-px flex-1 bg-neutral-400" />
          </div>

          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-neutral-300 p-2">
            {finishList.length > 0
              ? finishList.map((f, i) => (
                  <div key={i}>
                    <div className="aspect-square overflow-hidden rounded border border-neutral-200 bg-neutral-100">
                      {f.image_url ? (
                        <img
                          src={f.image_url}
                          alt={f.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[7px] text-neutral-400">
                          {f.label}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-center text-[6.5px] font-bold uppercase leading-tight text-neutral-700">
                      {f.label}
                    </div>
                    {f.spec && (
                      <div className="text-center text-[6px] leading-tight text-neutral-500">
                        {f.spec}
                      </div>
                    )}
                  </div>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    <div className="aspect-square rounded border border-dashed border-neutral-300 bg-neutral-50" />
                  </div>
                ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-right text-[11px] font-black uppercase tracking-wide">
            Floor Plan – {mix.bedrooms} Bedrooms | {mix.bathrooms} Bathroom
            {mix.bathrooms === 1 ? "" : "s"}
            {mix.ensuiteCount > 0
              ? ` (${mix.commonBathrooms} common + ${mix.ensuiteCount} ensuite)`
              : ""}
            {sqft ? ` | ${num(sqft)} Sq Ft` : ""}
          </h3>

          <div className="relative overflow-hidden rounded border border-neutral-300 bg-white">
            {deal.marketed_floor_plan_url ? (
              <>
                <img
                  src={deal.marketed_floor_plan_url}
                  alt="Floor plan"
                  className="block max-h-[250px] w-full object-contain"
                />
              </>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-[11px] text-neutral-400">
                No rendered floor plan yet — make one on the Plan tab and press
                "Use this on the flyer".
              </div>
            )}
          </div>

          <p className="mt-1 text-center text-[8px] italic text-neutral-500">
            This rendering is a representation. Actual layout may vary.
          </p>
        </div>
      </div>

      {/* ================= ROOM SCHEDULE ================= */}
      {bedrooms.length > 0 && (
        <div className="px-8 pb-3">
          <div className="flex flex-wrap gap-1">
            {bedrooms.map((r) => (
              <div
                key={r.id || r.room_number}
                className="flex items-center gap-1 rounded px-1.5 py-[3px]"
                style={{ backgroundColor: `${roomColor(r.room_number || 1)}1A` }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: roomColor(r.room_number || 1) }}
                />
                <span className="text-[8.5px] font-bold text-neutral-800">{r.label}</span>
                {r.room_type === "ensuite" && (
                  <span className="text-[7px] font-black uppercase" style={{ color: GREEN }}>
                    Ensuite
                  </span>
                )}
                <span className="text-[8.5px] font-semibold tabular-nums text-neutral-600">
                  {usd(roomRate(r, market))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= ABOUT ================= */}
      <div className="mx-8 grid grid-cols-2 overflow-hidden rounded-t-xl">
        <div className="flex gap-3 p-4" style={{ backgroundColor: INK }}>
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[14px]"
            style={{ borderColor: LIME, color: LIME }}
          >
            ⌂
          </span>
          <div>
            <h4 className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: LIME }}>
              About This Property
            </h4>
            <p className="mt-1.5 text-[8.5px] leading-relaxed text-neutral-300">
              {aboutText}
            </p>
            <p className="mt-2 text-[9.5px] font-black uppercase" style={{ color: LIME }}>
              {closingText}
            </p>
          </div>
        </div>

        <div className="p-4" style={{ backgroundColor: "#1C231C" }}>
          <h4 className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: LIME }}>
            <span className="mr-1">◉</span>
            {deal.city}, {deal.state}
          </h4>
          <p className="mt-1.5 text-[8.5px] leading-relaxed text-neutral-300">
            {market && market.upcoming_units === 0
              ? "High rental demand area with strong cash flow potential and minimal upcoming competition."
              : "High rental demand area with strong cash flow potential."}
            {p.compStats && ` Closed comps average ${usd(p.compStats.avg)} in this submarket.`}
          </p>
          <p className="mt-3 text-[11px] font-black uppercase leading-tight text-white">
            Don't Miss Out On This Turnkey
            <br />
            Investment Opportunity!
          </p>
        </div>
      </div>

      {/* ================= FOOTER ================= */}
      <div
        className="mx-8 mb-8 flex items-center justify-between rounded-b-xl px-5 py-3"
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

      <p className="px-8 pb-6 text-center text-[7px] leading-relaxed text-neutral-400">
        {usingStandardPhotos || !deal.hero_image_url
          ? "Interior photography is representative of Green Light Buying Machine finish standards."
          : "Interior photography is of this property."}{" "}
        Projections are estimates based on PadSplit market data for ZIP {deal.zip}. Actual results
        vary. Not an offer to sell a security.
      </p>
      </div>
    </div>
  );
}

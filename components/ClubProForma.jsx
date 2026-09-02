"use client";

// ============================================================
// Club-format pro forma — screen and printed sheet.
//
// Takes a fully built inputs object. The demo route seeds it from
// presets; /buyer-sheets/[slug] seeds it from the deals table.
//
// Laid out as a document rather than a dashboard, so Print produces
// the thing on screen instead of a reflowed approximation. It borrows
// the page furniture the rest of the app already prints with:
// print-doc, print-section, print-break-before, print-keep, no-print,
// and BrandMark from components/Brand.
//
// The only files it reads are the two club libs, the charts and the
// brand mark. Nothing else in the app knows this screen exists.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { runClubProForma, downPaymentOptions, usd, pct, multiple } from "../lib/proformaClub";
import { resolveLabel, toTemplateLens } from "../lib/proformaClubPresets";
import { BrandMark } from "./Brand";
import { computeProForma, roomRate } from "../lib/proforma";
import {
  CapitalRequired,
  IncomeAndExpenses,
  MarketPanel,
  NetPerformance,
  VettingBlock,
  RoomRevenueStack,
} from "./ClubCore";
import ClubAssumptions from "./ClubAssumptions";
import BuyerComps from "./BuyerComps";
import BuyerMap from "./BuyerMap";
import ViewPicker from "./ViewPicker";
import SyndicationPanel from "./SyndicationPanel";
import ProvenancePanel from "./ProvenancePanel";
import {
  CompsScatter,
  CompsTable,
  FloorPlan,
  FlyerFooter,
  FlyerHeading,
  FlyerMasthead,
  HeadlineMetrics,
  IncludedBar,
  PropertyFacts,
  DownPaymentOptions,
  MarketReport,
  OccupancyControl,
  PropertyGallery,
  Readiness,
  ScenarioBasis,
  SupportingDocuments,
} from "./ClubPresentation";
import {
  BreakEvenCurve,
  CashOnCashBars,
  EquityCurve,
  ExpenseBars,
  IncomeWaterfall,
} from "./ClubCharts";

const GREEN = "#00A651";

// The tiles a buyer picks from, in reading order.
//
// The pro forma itself is NOT in this list. Income, costs, financing
// and capital are the sheet — the thing a buyer opened the link for —
// and a document whose numbers can be switched off isn't a pro forma,
// it's a brochure. Everything here is an addition to that base.
//
// "Comps & market" used to be one tile carrying two unrelated things:
// houses that sold nearby, and PadSplit's figures for the ZIP. A buyer
// checking what the neighbours went for and a buyer checking room
// rates are asking different questions, and one of those is Green
// Light's evidence while the other is a third party's. Separate tiles,
// separately labelled.
const SECTIONS = [
  { id: "summary", label: "Summary", hint: "the deal in one screen" },
  { id: "flyer", label: "Flyer", hint: "photos, specs, floor plan, finishes" },
  { id: "comps", label: "Comps", hint: "recent sales near this house" },
  { id: "padsplit", label: "PadSplit market", hint: "ZIP room rates and occupancy" },
  // Split out of the two tiles that used to carry them. The map was
  // filed under comps because it plots comparable sales, but a buyer
  // asking "where is this" and a buyer asking "what did the
  // neighbours get" are two questions. Market research sat under
  // PadSplit market for the same reason — one is PadSplit's data for
  // the ZIP, the other is city demographics from elsewhere.
  { id: "map", label: "Map", hint: "the house and the PadSplit ZIPs around it" },
  { id: "research", label: "Market research", hint: "city demographics, jobs, incomes" },
  { id: "syndication", label: "Syndication", hint: "raise, waterfall, break-even" },
  { id: "diligence", label: "Diligence", hint: "documents and assumptions" },
];

// Lit on arrival. The four a buyer opens the link for; the rest are
// one click away. Syndication is never a default — it is entitlement
// gated per firm.
const DEFAULT_VIEWS = ["summary", "flyer", "comps"];


const SCENARIOS = [
  {
    key: "glbm",
    label: "GLBM",
    hint: "Our underwriting standard",
    detail:
      "The vacancy rate Green Light Buying Machine holds every deal to, whatever a particular ZIP happens to be running. This is the case our own pro forma uses, so it's the number we stand behind.",
  },
  {
    key: "bear",
    label: "Bear",
    hint: "Below market — the stress case",
    detail:
      "Runs meaningfully below the market: occupancy several points light, members turning over faster, and costs growing quicker than rent. Not a disaster case — no vacancy event, no capital failure, no rate shock. It answers how far this can slip and still cover debt.",
  },
  {
    key: "base",
    label: "Base",
    hint: "At the published market average",
    detail:
      "Runs at PadSplit's own published occupancy for this ZIP — not our estimate, their data, which you can verify. The neutral case.",
  },
  {
    key: "bull",
    label: "Bull",
    hint: "Above market — upside only",
    detail:
      "Runs above market with members staying longer. Occupancy is capped below 100% because a room that turns at all has a gap. Context, not a promise.",
  },
];

function Stat({ label, value, sub, good }) {
  return (
    <div
      className="print-keep border-l-2 pl-3"
      style={{ borderColor: good === false ? "#B91C1C" : GREEN }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums text-neutral-900">{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

// Fixed grid tracks rather than flex — a label that wraps to two
// lines would otherwise drop its figure to the second baseline.
function Row({ label, value, tone = "normal", note }) {
  const styles = {
    normal: "text-neutral-800",
    minus: "text-neutral-600",
    total: "font-bold text-neutral-900",
  };
  return (
    <div
      className={`print-keep grid grid-cols-[1fr_7rem] items-start gap-x-3 py-1.5 ${
        tone === "total" ? "border-b-2 border-neutral-900" : "border-b border-neutral-200"
      }`}
    >
      <div className={`text-[13px] leading-5 ${styles[tone]}`}>
        {label}
        {note && <span className="ml-1.5 text-[11px] text-neutral-400">{note}</span>}
      </div>
      <div className={`text-right text-[13px] leading-5 tabular-nums ${styles[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children, kicker }) {
  return (
    <div className="print-keep mb-3">
      {kicker && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {kicker}
        </div>
      )}
      <h2 className="text-[15px] font-black uppercase tracking-tight text-neutral-900">
        {children}
      </h2>
    </div>
  );
}

const HOLDS = [5, 7, 10];
const TICKETS = [10000, 25000, 50000, 100000];

export default function ClubProForma({
  initialInputs,
  backHref,
  backLabel,
  // "buyer" drops the controls and panels that only make sense on our
  // side: the assumptions editor, the lens toggle, internal view, and
  // the per-subscription investor block. A firm buying the whole house
  // does its own investor math downstream.
  audience = "seller",
  // Raw deal row and comps, when the caller has them. Buyer view leads
  // with the property; seller view doesn't need the photography.
  deal = null,
  comps = [],
  documents = [],
  market = null,
  // Raw rows, so the sheet can run computeProForma — the same engine
  // the deal page uses. Year one comes from there; the club engine
  // handles only what it doesn't cover.
  rooms = [],
  orgRows = null,
  marketReport = null,
  nearbyMarkets = [],
  // Where the research report is for. Falls back to the deal, but can
  // be passed directly so a market-level sheet — one with no house on
  // it — still carries the city research.
  city = null,
  state = null,
  enabledViews = null,
  // GLBM leads: it's the standard we underwrite to, and it's the case
  // a buyer should see first. Falls back to base where a saved model
  // predates the GLBM scenario.
  initialScenario = "glbm",
  // Brand defaults from org_settings: standard hero, standard interior
  // gallery and flyer_copy. Same source the flyer draws on.
  defaults = null,
  // Called whenever the editable model changes, so a parent can share
  // exactly what's on screen rather than rebuilding from the record.
  onModelChange = null,
  // Let a buyer stress-test the figures. Their edits live in the
  // browser only — nothing is written back, and the sheet marks
  // itself as adjusted so their number can't be read as ours.
  allowAdjust = false,
}) {
  const isBuyer = audience === "buyer";
  // The model is editable now, so it's state rather than a frozen
  // seed. holdYears lives inside it; the buttons write through.
  const [base, setBase] = useState(initialInputs);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [scenario, setScenario] = useState(initialScenario);

  const [subscription, setSubscription] = useState(25000);

  // Off by default and never persisted, so a reload drops back to the
  // external label. Print also hides everything gated behind it.
  const [internalView, setInternalView] = useState(false);

  // Occupancy is the assumption a buyer most wants to push on, so it
  // gets its own control rather than being buried in the panel.
  // null follows the selected case; a number overrides it.
  const [occupancyOverride, setOccupancyOverride] = useState(null);

  // Twenty-six sections is four documents stacked, so they're grouped
  // and one shows at a time. Print ignores this and emits everything —
  // a PDF is read differently from a screen, and an analyst who prints
  // it wants the whole package in one file.
  //
  // A set rather than a single id: a buyer reading the comps against
  // the pro forma shouldn't have to flip between them. Seeded from
  // ?views= so a forwarded link opens on the same thing the sender
  // was looking at.
  // Sections this firm is entitled to. Null means the route did not
  // send a list — an older client or an unmigrated database — so fall
  // back to everything except syndication, which is always opt-in.
  const visibleSections = useMemo(() => {
    const allowed = enabledViews
      ? new Set(enabledViews)
      : new Set(SECTIONS.filter((s) => s.id !== "syndication").map((s) => s.id));
    return SECTIONS.filter((s) => {
      if (!allowed.has(s.id)) return false;
      // A tile that can never render is worse than a missing tile: it
      // reads as broken. Drop the ones with nothing behind them on
      // this particular sheet.
      if (s.id === "map" && !deal) return false;
      if (s.id === "research" && !marketReport) return false;
      return true;
    });
  }, [enabledViews, deal, marketReport]);

  const [views, setViews] = useState(() => {
    if (typeof window !== "undefined") {
      const raw = new URLSearchParams(window.location.search).get("views");
      if (raw != null) {
        const valid = new Set(SECTIONS.map((s) => s.id));
        // An empty ?views= is a deliberate "hide everything", so it is
        // honoured. Only a missing parameter falls back to the default.
        return new Set(raw.split(",").filter((v) => valid.has(v)));
      }
    }
    return new Set(DEFAULT_VIEWS);
  });

  // A URL can name a section the firm is not entitled to, either
  // because it was forwarded from a firm that has it or because
  // someone typed it. Intersect rather than trust.
  const allowedIds = useMemo(() => new Set(visibleSections.map((s) => s.id)), [visibleSections]);
  const effectiveViews = useMemo(
    () => new Set([...views].filter((v) => allowedIds.has(v))),
    [views, allowedIds]
  );
  const [printing, setPrinting] = useState(false);

  // The pro forma section carried eight blocks and several said the
  // same thing twice: a ranked expense stack under a table of those
  // expenses, an equity curve beside an investor-position table, a
  // return-of-capital line beside cash-on-cash by year. All of it is
  // real and none of it is what a buyer reads first.
  //
  // Collapsed rather than deleted, and gathered into one run at the
  // end so a single control governs a single region — scattered
  // toggles that pop content in above where you clicked are worse
  // than the clutter they fix. Internal views and the printed sheet
  // are unaffected.
  const [detailOpen, setDetailOpen] = useState(false);
  const showDetail = !isBuyer || printing || detailOpen;
  // Order matters. Entitlement is checked before printing, so a firm
  // cannot reach a section it was not given by opening the print
  // dialog. Everything else — seller and admin views — is unfiltered.
  const show = (name) => {
    if (!isBuyer) return true;
    if (!allowedIds.has(name)) return false;
    return printing || effectiveViews.has(name);
  };

  // Reflect the selection in the URL without adding history entries —
  // back should leave the page, not undo five tile clicks.
  useEffect(() => {
    if (typeof window === "undefined" || !isBuyer) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("views");
    let qs = url.searchParams.toString();
    if (effectiveViews.size !== visibleSections.length) {
      // Written by hand rather than through searchParams, which
      // percent-encodes the separator: a link someone forwards should
      // read ?views=summary,market and not ?views=summary%2Cmarket.
      qs = (qs ? qs + "&" : "") + "views=" + [...effectiveViews].join(",");
    }
    window.history.replaceState(null, "", url.pathname + (qs ? "?" + qs : "") + url.hash);
  }, [effectiveViews, visibleSections, isBuyer]);

  const toggleView = (id) =>
    setViews((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const showAllViews = () => setViews(new Set(visibleSections.map((s) => s.id)));
  const onlyView = (id) => setViews(new Set([id]));

  // A PDF is read differently from a screen. Before the print dialog
  // opens, drop the section filter so the file carries the whole
  // package; restore it afterwards.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const holdYears = base.exit.holdYears;
  const setHoldYears = (h) =>
    setBase((m) => ({ ...m, exit: { ...m.exit, holdYears: h } }));

  const inputs = base;

  // Compared against the inputs as received, so the banner appears on
  // any change and clears on reset.
  const isAdjusted =
    allowAdjust && JSON.stringify(base) !== JSON.stringify(initialInputs);

  useEffect(() => {
    if (onModelChange) onModelChange(base);
    // onModelChange is intentionally excluded — parents commonly pass an
    // inline arrow, and including it would fire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // A refinance scheduled on or after the sale year never happens.
  const refiApplies = base.refinance.enabled && base.refinance.year < holdYears;

  // Two lenses on the same house.
  //
  // "glbm" is the real operating stack. "template" is how a
  // syndicator's calculator reads it — one flat monthly catch-all,
  // management at 8%. The second number is always the better one,
  // which is exactly why a buyer needs to see both: without the
  // comparison, honest underwriting just looks like a worse deal.
  const [lens, setLens] = useState("glbm");

  const modelInputs = useMemo(() => {
    const withLens = lens === "template" ? toTemplateLens(inputs) : inputs;
    if (occupancyOverride == null) return withLens;

    // The headline cards come from the club engine, the tables from
    // computeProForma. Both have to move together or the sheet
    // contradicts itself mid-page.
    return {
      ...withLens,
      scenarios: Object.fromEntries(
        Object.entries(withLens.scenarios).map(([k, sc]) => [
          k,
          { ...sc, income: { ...sc.income, occupancyPct: occupancyOverride } },
        ])
      ),
    };
  }, [inputs, lens, occupancyOverride]);

  // A model saved before GLBM existed has no such case. Fall back
  // rather than reading a scenario that isn't there.
  // One case, everywhere — buyer sheet, share link and the editor
  // alike. The bear/base/bull picker moved rent growth, expense growth
  // and appreciation together, so the spread between the cases was
  // real but no one could say which change caused it, and it sat next
  // to an occupancy slider that does the same job on a single axis.
  //
  // The engine still computes all four; nothing downstream that reads
  // result.base changes. They are simply no longer a thing anyone is
  // asked to choose between.
  const scenarioLocked = true;
  const requestedScenario = scenarioLocked ? "glbm" : scenario;
  const activeScenario = modelInputs?.scenarios?.[requestedScenario]
    ? requestedScenario
    : modelInputs?.scenarios?.glbm
    ? "glbm"
    : "base";

  const result = useMemo(() => runClubProForma(modelInputs), [modelInputs]);
  const s = result[activeScenario] || result.base;
  const y1 = s.years[0];
  const cap = s.capitalization;
  const p = inputs.property;

  // The single source for year one. GLBM maps to its 'glbm' scenario,
  // everything else to 'market'.
  const core = useMemo(() => {
    if (!deal) return null;
    try {
      // computeProForma reads income straight off deal_rooms. A deal
      // with no room schedule yet produced a sheet of zeros, so stand
      // in rooms from the record's own counts — the same fallback the
      // club engine uses. Real rooms always win.
      const rentable = (rooms || []).filter(
        (r) => r.room_type === "shared" || r.room_type === "ensuite"
      );

      const effectiveRooms = rentable.length
        ? rooms
        : [
            ...Array.from({ length: Number(deal.ensuite_count) || 0 }, (_, i) => ({
              id: `synth-e${i}`,
              room_number: i + 1,
              room_type: "ensuite",
            })),
            ...Array.from(
              {
                length: Math.max(
                  0,
                  (Number(deal.bedrooms) || 0) - (Number(deal.ensuite_count) || 0)
                ),
              },
              (_, i) => ({
                id: `synth-s${i}`,
                room_number: (Number(deal.ensuite_count) || 0) + i + 1,
                room_type: "shared",
              })
            ),
          ];

      // The parameter is orgRows, not org. Passing the wrong key
      // silently fell back to ORG_DEFAULTS, so the sheet quoted stock
      // assumptions while the deal page quoted yours.
      return computeProForma({
        deal,
        rooms: effectiveRooms,
        market,
        comps,
        orgRows,
        scenario: activeScenario === "glbm" ? "glbm" : "market",
        overrides: {
          price: modelInputs.capitalization.purchasePrice,
          ...(occupancyOverride != null ? { vacancy: 1 - occupancyOverride } : {}),
        },
      });
    } catch {
      return null;
    }
  }, [deal, rooms, market, comps, orgRows, activeScenario, modelInputs, occupancyOverride]);

  // Each hold is its own run — the multiple changes because the exit
  // moves, not because the cash flows are being sliced differently.
  // Independent of subscription, so it survives typing in the box.
  const holdComparison = useMemo(
    () =>
      HOLDS.map((years) => {
        const withHold = { ...base, exit: { ...base.exit, holdYears: years } };
        const r = runClubProForma(
          lens === "template" ? toTemplateLens(withHold) : withHold
        );
        // Same fallback as the sheet: a model without the requested
        // case still has base.
        const x = r[scenario] || r.base;
        return { years, moic: x?.leveredMoic ?? 0, irr: x?.leveredIrr ?? 0 };
      }),
    [base, scenario, lens]
  );

  // The same house under the other lens, for the delta callout.
  const templateResult = useMemo(() => runClubProForma(toTemplateLens(inputs)), [inputs]);
  const glbmResult = useMemo(() => runClubProForma(inputs), [inputs]);

  const dscrTight = s.minDscr < 1.2;

  const asOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-neutral-100 p-4 font-sans sm:p-8">
      <div className="print-doc mx-auto max-w-4xl bg-white shadow-xl">
        {isBuyer && deal ? (
          <FlyerMasthead
            deal={deal}
            beds={p.beds}
            baths={p.baths}
            sqft={deal.finished_sqft || p.sqft}
            price={cap.purchasePrice}
            scenarioLabel="Green Light underwriting"
            defaults={defaults}
            readyDate={deal.reno_complete_date || deal.disposition_coe || null}
            readyLabel={deal.reno_complete_estimated === false ? "Complete" : "Ready"}
          />
        ) : (
        <div className="print-section bg-neutral-950 px-6 py-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <BrandMark height={30} />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.3em]"
                  style={{ color: GREEN }}
                >
                  Green Light Buying Machine
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-none text-white sm:text-3xl">
                {p.name}
              </h1>
              <div className="mt-1 text-sm text-neutral-400">
                {p.city}, {p.state} · {p.beds} bed / {p.baths} bath
                {p.sqft ? ` · ${p.sqft.toLocaleString()} sq ft` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
                {resolveLabel(internalView)}
                {" · Green Light underwriting"}
              </div>
              <div className="text-3xl font-bold tabular-nums text-white">
                {usd(cap.purchasePrice)}
              </div>
              <div className="text-[11px] text-neutral-400">
                {inputs.exit.holdYears}-year hold · {asOf}
              </div>
            </div>
          </div>
        </div>
        )}

        {!isBuyer && (
        <div className="print-section grid grid-cols-2 gap-4 border-b border-neutral-200 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <Stat
            label="Levered IRR"
            value={pct(s.leveredIrr)}
            sub={`Unlevered ${pct(s.unleveredIrr)}`}
          />
          <Stat
            label="Cash on cash, Yr 1"
            value={pct(s.year1LeveredCashOnCash)}
            sub={`on ${usd(cap.totalCapitalizedEquity)} in`}
            good={s.year1LeveredCashOnCash > 0}
          />
          <Stat
            label="Equity multiple"
            value={multiple(s.leveredMoic)}
            sub={`${usd(s.leveredProfit)} profit`}
          />
          <Stat
            label="DSCR"
            value={s.year1Dscr.toFixed(2)}
            sub={dscrTight ? `dips to ${s.minDscr.toFixed(2)}` : "lender-ready"}
            good={!dscrTight}
          />
        </div>
        )}

        {isAdjusted && (
          <div
            className="print-section border-b-2 px-6 py-3 sm:px-8"
            style={{ borderColor: "#B45309", backgroundColor: "#FFFBEB" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
                Your adjusted figures
              </span>
              <span className="flex-1 text-[12px] leading-snug text-amber-900">
                Every number on this sheet now reflects assumptions you changed,
                not the figures as issued by Green Light Buying Machine.
              </span>
              <button
                onClick={() => setBase(initialInputs)}
                className="no-print rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: "#B45309" }}
              >
                Reset to figures as sent
              </button>
            </div>
          </div>
        )}

        {isBuyer && (
          <HeadlineMetrics
            scenario={s}
            holdYears={holdYears}
            listPrice={cap.purchasePrice}
            grossAnnual={y1.income.grossScheduledRent}
            netAnnual={y1.income.netToOwner}
          />
        )}

        <OccupancyControl
          value={occupancyOverride}
          modelled={modelInputs.scenarios[activeScenario].income.occupancyPct}
          onChange={setOccupancyOverride}
          dscr={core ? core.dscr : s.year1Dscr}
          capped={occupancyOverride != null && occupancyOverride >= 0.99}
          marketOccupancy={market ? Number(market.avg_occupancy) : null}
          // With the case picker gone from the buyer sheet, the dial is
          // the only place left to say whose number the modelled rate
          // is. Unattributed it reads as a generic default rather than
          // a standard we hold every deal to.
          standardLabel={scenarioLocked ? "Green Light underwriting standard" : null}
        />

        {isBuyer && (
          <ViewPicker
            sections={visibleSections}
            selected={effectiveViews}
            onToggle={toggleView}
            onAll={showAllViews}
            onOnly={onlyView}
          />
        )}

        {occupancyOverride != null && (
          <div
            className="print-section border-b-2 px-6 py-2.5 sm:px-8"
            style={{ borderColor: "#B45309", backgroundColor: "#FFFBEB" }}
          >
            <span className="text-[12px] text-amber-900">
              <strong>Occupancy set to {Math.round(occupancyOverride * 100)}%.</strong>{" "}
              Every figure below reflects that
              {scenarioLocked ? " rather than the modelled rate" : ", not the case above"}.
            </span>
            <button
              onClick={() => setOccupancyOverride(null)}
              className="no-print ml-3 text-[11px] underline underline-offset-2"
              style={{ color: "#B45309" }}
            >
              Reset
            </button>
          </div>
        )}

        {/* ---------- The pro forma. Always renders. ----------
            Revenue stack, income, net performance, capital and the down
            payment options are the document; they are not switchable. */}
        {isBuyer && core && <RoomRevenueStack p={core} market={market} />}
        {isBuyer && core && <IncomeAndExpenses p={core} />}
        {isBuyer && core && <NetPerformance p={core} />}
        {isBuyer && core && <CapitalRequired p={core} />}
        {isBuyer && core && (
          <VettingBlock
            p={core}
            occupancy={modelInputs.scenarios[activeScenario].income.occupancyPct}
          />
        )}

        {isBuyer && (
          <DownPaymentOptions
            noi={y1.noi}
            options={downPaymentOptions({
              price: cap.purchasePrice,
              noi: y1.noi,
              points: modelInputs.capitalization.loanCostPct,
              closingCosts:
                modelInputs.capitalization.purchasePrice *
                modelInputs.capitalization.closingCostPct,
              termMonths: modelInputs.debt.amortizationMonths,
            })}
          />
        )}

        {/* ---------- Everything below is optional, tile by tile ----------
            The pro forma above is the sheet. These are additions a buyer
            switches on, so they sit under the numbers rather than pushing
            them down the page. */}

        {isBuyer && show("summary") && <IncludedBar defaults={defaults} />}

        {isBuyer && show("diligence") && (
          <ScenarioBasis
            scenario={activeScenario}
            income={modelInputs.scenarios[activeScenario].income}
            expenses={modelInputs.scenarios[activeScenario].expenses}
            exit={modelInputs.scenarios[activeScenario].exit}
            marketOccupancy={market ? Number(market.avg_occupancy) : null}
            adjustable={allowAdjust}
            onAdjust={() => setShowAssumptions(true)}
          />
        )}

        {isBuyer && show("flyer") && deal && (
          <PropertyGallery
            gallery={deal.gallery}
            address={deal.address_line}
            defaults={defaults}
          />
        )}

        {isBuyer && show("flyer") && deal && (
          <FloorPlan
            url={deal.marketed_floor_plan_url}
            beds={p.beds}
            baths={p.baths}
            sqft={p.sqft}
          />
        )}

        {/* Controls. Screen only. */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          {/* The case picker is internal only. On the buyer sheet one
              case is shown and the occupancy dial below is the single
              thing they move — four named cases that each shifted rent
              growth, expense growth and appreciation together was the
              confusing part. */}
          {!scenarioLocked && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Scenario
            </span>
          )}
          {!scenarioLocked &&
            SCENARIOS.filter((sc) => modelInputs?.scenarios?.[sc.key]).map((sc) => (
            <button
              key={sc.key}
              onClick={() => setScenario(sc.key)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                scenario === sc.key
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={scenario === sc.key ? { backgroundColor: GREEN } : undefined}
            >
              {sc.label}
            </button>
          ))}

          {/* Hover card rather than a title attribute: the browser
              tooltip is slow, untruncated and unstyled. Internal only,
              because it explains a picker the buyer no longer has. */}
          {!scenarioLocked && (
          <span className="no-print group relative inline-flex self-center">
            <span
              className="flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border text-[9px] font-bold text-neutral-500"
              style={{ borderColor: "#B4B4B4" }}
              aria-label="What the cases mean"
            >
              i
            </span>

            <span className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-[320px] -translate-x-1/2 rounded-lg bg-neutral-950 p-3 text-left shadow-xl group-hover:block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500">
                What the cases mean
              </span>
              {SCENARIOS.filter((x) => modelInputs?.scenarios?.[x.key]).map((x) => (
                <span key={x.key} className="mb-2 block last:mb-0">
                  <span
                    className="block text-[11px] font-bold"
                    style={{ color: x.key === activeScenario ? GREEN : "#FFFFFF" }}
                  >
                    {x.label}
                    {x.key === activeScenario ? " — showing" : ""}
                  </span>
                  <span className="block text-[10px] leading-snug text-neutral-400">
                    {x.detail}
                  </span>
                </span>
              ))}
              <span className="mt-2 block border-t border-neutral-800 pt-2 text-[10px] leading-snug text-neutral-400">
                All four share the same price, rooms, financing and expense
                stack. Only the operating assumptions differ.
              </span>
            </span>
          </span>
          )}

          <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Hold
          </span>
          {HOLDS.map((h) => (
            <button
              key={h}
              onClick={() => setHoldYears(h)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                holdYears === h
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={holdYears === h ? { backgroundColor: GREEN } : undefined}
            >
              {h} yr
            </button>
          ))}

          {!isBuyer && (
          <span className="ml-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Lens
          </span>
          )}
          {!isBuyer && [
            { id: "glbm", label: "GLBM underwriting" },
            { id: "template", label: "Syndicator template" },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                lens === l.id
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={lens === l.id ? { backgroundColor: GREEN } : undefined}
            >
              {l.label}
            </button>
          ))}

          {backHref && (
            <a
              href={backHref}
              className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 ring-1 ring-neutral-300 transition hover:text-neutral-900"
            >
              ← {backLabel || "Back"}
            </a>
          )}

          {(!isBuyer || allowAdjust) && (
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
              showAssumptions
                ? "text-white"
                : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
            }`}
            style={showAssumptions ? { backgroundColor: "#0A0A0A" } : undefined}
          >
            {showAssumptions ? "Hide" : "Edit"} assumptions
          </button>
          )}

          <button
            onClick={() => window.print()}
            className="ml-auto rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:opacity-90"
            style={{ backgroundColor: GREEN }}
          >
            Print / Save PDF
          </button>
        </div>

        {!isBuyer && (
        <>
        {/* Investment. Its own row — changing the ticket is the thing
            most people came to do, and it shouldn't be buried on the
            third page next to the capitalization table. */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-6 py-3 sm:px-8">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Investment
          </span>
          {TICKETS.map((t) => (
            <button
              key={t}
              onClick={() => setSubscription(t)}
              className={`rounded px-3 py-1.5 text-[11px] font-bold tabular-nums uppercase tracking-wider transition ${
                subscription === t
                  ? "text-white"
                  : "bg-white text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900"
              }`}
              style={subscription === t ? { backgroundColor: GREEN } : undefined}
            >
              {usd(t)}
            </button>
          ))}

          <div className="flex items-center rounded border border-neutral-300 bg-white focus-within:border-[#00A651]">
            <span className="pl-2 text-sm text-neutral-500">$</span>
            <input
              type="number"
              step={1000}
              min={0}
              value={subscription}
              onChange={(e) => setSubscription(parseFloat(e.target.value) || 0)}
              className="w-28 bg-transparent px-2 py-1.5 text-sm tabular-nums text-neutral-900 outline-none"
              aria-label="Investment amount"
            />
          </div>

          <span className="ml-1 text-[12px] text-neutral-600">
            → <strong className="tabular-nums text-neutral-900">
              {usd(s.projectedPositionValue(subscription))}
            </strong>{" "}
            at year {holdYears}
            <span className="text-neutral-400">
              {" "}
              ({multiple(s.leveredMoic)})
            </span>
          </span>

          {!isBuyer && (
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
              <input
                type="checkbox"
                checked={internalView}
                onChange={(e) => setInternalView(e.target.checked)}
              />
              Internal view
            </label>
          )}
        </div>
        </>
        )}

        {internalView && (
          <div className="no-print border-b border-neutral-200 bg-neutral-100 px-6 py-2.5 text-[12px] text-neutral-700 sm:px-8">
            <span className="font-bold">Internal view is on.</span> The two
            benchmark panels below are visible on screen and are hidden from
            print. Don&rsquo;t screenshot or share this screen.
          </div>
        )}

        {dscrTight && (
          <div className="print-section border-b border-neutral-200 bg-red-50 px-6 py-3 text-[13px] text-red-900 sm:px-8">
            <span className="font-semibold">Coverage is tight.</span> DSCR bottoms
            out at {s.minDscr.toFixed(2)}, under the 1.20 most DSCR lenders
            require. Expect reduced proceeds or a rate add-on in this case.
          </div>
        )}

        {(!isBuyer || allowAdjust) && showAssumptions && (
          <ClubAssumptions
            model={base}
            setModel={setBase}
            onReset={() => setBase(initialInputs)}
            perBedOpex={glbmResult[activeScenario].years[0].expenses.total / (p.beds || 1)}
          />
        )}

        {/* Basis. Prints — a buyer holding the sheet needs to know
            which stack produced the numbers above it. */}
        <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2.5 text-[11px] leading-snug text-neutral-600 sm:px-8">
          <span className="font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Expense basis:{" "}
          </span>
          {lens === "glbm" ? (
            <>
              Every operating line is itemized — landlord-paid utilities,
              turnover, common-area cleaning, landscaping, pest, supplies and a
              capital reserve, at {usd(y1.expenses.total / p.beds)} per bed per
              year. Most syndicated offerings model this as one flat monthly
              line, which reads{" "}
              <strong className="text-neutral-900">
                {usd(templateResult[activeScenario].years[0].noi - glbmResult[activeScenario].years[0].noi)}
              </strong>{" "}
              higher in year-1 NOI on this house. Both are shown so the figures
              can be compared like for like.
            </>
          ) : (
            <>
              Operating costs modeled the way a syndicated offering typically
              does — a flat $1,000/month catch-all plus management at 8%. Shown
              for comparability with offerings underwritten this way. Green
              Light Buying Machine&rsquo;s own figures itemize the stack and
              come in{" "}
              <strong className="text-neutral-900">
                {usd(templateResult[activeScenario].years[0].noi - glbmResult[activeScenario].years[0].noi)}
              </strong>{" "}
              lower on year-1 NOI.
            </>
          )}
          <br />
          Income is built room by room and reduced to net-to-owner before any
          return is calculated —{" "}
          {pct(1 - y1.income.netToOwner / y1.income.grossScheduledRent)} of gross
          scheduled rent is lost to vacancy, collections and PadSplit fees.
          Occupancy is modeled at{" "}
          {pct(modelInputs.scenarios[activeScenario].income.occupancyPct, 0)}
          {p.zip ? ` — the ${p.zip} average` : ""}. Rates, taxes, insurance and
          market rents move; these are projections, not quotes.
        </div>

        {/* Side-by-side. This is the sheet's argument: the same house
            under both conventions, with the gap named rather than
            left for the buyer to discover. */}
        <div className="print-section border-b border-neutral-200 px-6 py-4 sm:px-8">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Same house · both conventions
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Year 1
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Syndicator template
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  GLBM underwriting
                </th>
                <th className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Operating expenses",
                  templateResult[activeScenario].years[0].expenses.total,
                  glbmResult[activeScenario].years[0].expenses.total,
                ],
                [
                  "Net operating income",
                  templateResult[activeScenario].years[0].noi,
                  glbmResult[activeScenario].years[0].noi,
                ],
              ].map(([label, t, g]) => (
                <tr key={label} className="border-b border-neutral-200">
                  <td className="py-1.5 text-[12px] text-neutral-800">{label}</td>
                  <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                    {usd(t)}
                  </td>
                  <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-900">
                    {usd(g)}
                  </td>
                  <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                    {g - t >= 0 ? "+" : "−"}
                    {usd(Math.abs(g - t))}
                  </td>
                </tr>
              ))}
              <tr className="border-b-2 border-neutral-900">
                <td className="py-1.5 text-[12px] font-bold text-neutral-900">
                  Levered IRR, {holdYears} yr
                </td>
                <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                  {pct(templateResult[activeScenario].leveredIrr)}
                </td>
                <td className="py-1.5 text-right text-[12px] font-bold tabular-nums text-neutral-900">
                  {pct(glbmResult[activeScenario].leveredIrr)}
                </td>
                <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                  {pct(
                    glbmResult[activeScenario].leveredIrr - templateResult[activeScenario].leveredIrr
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">
            The right-hand column is the one to underwrite against. It already
            carries the utility, turnover and reserve load a {p.beds}-bed house
            actually generates, so it does not need a haircut applied on top.
          </p>
        </div>

        {/* ---------------- page one ---------------- */}
        <div className="px-6 py-6 sm:px-8">
          {isBuyer && show("flyer") && deal && (
            <div className="print-section mb-7">
              <FlyerHeading>Specifications</FlyerHeading>
              <PropertyFacts deal={deal} beds={p.beds} baths={p.baths} />
            </div>
          )}

          {/* With the property, not with the financials. Someone
              reading the specifications is asking what and where this
              is; the map answers the second half.

              Its own tile. It plots the comparable sales, but it also
              answers "where is this" — which is a different question
              from what the comps table answers, and a buyer often
              wants one without the other. */}
          {/* Guarded on deal for the same reason the flyer is: with no
              subject there is nothing to centre on and the map renders
              empty. A market-level sheet has no house, so no map. */}
          {isBuyer && show("map") && deal && (
            <BuyerMap deal={deal} markets={nearbyMarkets} comps={comps} subjectMarket={market} />
          )}

          {isBuyer && show("comps") && (
            <BuyerComps
              subject={{ price: cap.purchasePrice, sqft: p.sqft, beds: p.beds }}
            />
          )}

          {isBuyer && show("comps") && comps.length > 1 && (
            <CompsScatter
              comps={comps}
              subject={{ sqft: p.sqft, price: cap.purchasePrice, beds: p.beds }}
            />
          )}

          {isBuyer && show("comps") && comps.length > 0 && (
            <div className="print-section mb-7">
              <FlyerHeading>Comparable Sales</FlyerHeading>
              <CompsTable
                comps={comps}
                listPrice={cap.purchasePrice}
                sqft={p.sqft}
                subjectBeds={p.beds}
                subjectBaths={p.baths}
                subjectYear={deal?.year_built}
              />
            </div>
          )}

          <div className="print-section mb-7">
            <SectionTitle kicker="Where the rent goes">
              Gross scheduled to net to owner
            </SectionTitle>
            <IncomeWaterfall income={y1.income} />
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              Booking fees are charged per move-in on the full weekly rate, so
              they do not fall with occupancy. A high-turnover year costs twice —
              less rent collected and more fees paid on the churn.
            </p>
          </div>

          {(
          <div className="print-section mb-7 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle kicker="Year 1">Income</SectionTitle>
              <Row label="Gross scheduled rent" value={usd(y1.income.grossScheduledRent)} />
              <Row label="Vacancy" value={`(${usd(y1.income.vacancyLoss)})`} tone="minus" />
              <Row
                label="Collections loss"
                value={`(${usd(y1.income.collectionsLoss)})`}
                tone="minus"
              />
              <Row label="Gross collected" value={usd(y1.income.grossCollected)} />
              <Row
                label="PadSplit booking fees"
                value={`(${usd(y1.income.platformBookingFees)})`}
                tone="minus"
                note="per move-in"
              />
              <Row
                label="PadSplit service fee"
                value={`(${usd(y1.income.platformServiceFees)})`}
                tone="minus"
              />
              <Row label="Net to owner" value={usd(y1.income.netToOwner)} tone="total" />
            </div>

            <div>
              <SectionTitle kicker="Year 1">Operating expenses</SectionTitle>
              <Row label="Property taxes" value={usd(y1.expenses.propertyTaxes)} />
              <Row label="Insurance" value={usd(y1.expenses.insurance)} />
              <Row label="Utilities" value={usd(y1.expenses.utilities)} note="landlord-paid" />
              <Row label="Repairs & maintenance" value={usd(y1.expenses.repairsMaintenance)} />
              <Row label="Turnover / make-ready" value={usd(y1.expenses.turnover)} />
              <Row label="Common-area cleaning" value={usd(y1.expenses.commonAreaCleaning)} />
              <Row label="Landscaping & pest" value={usd(y1.expenses.landscapingPest)} />
              <Row label="Supplies" value={usd(y1.expenses.supplies)} />
              {y1.expenses.management > 0 && (
                <Row label="Management" value={usd(y1.expenses.management)} />
              )}
              <Row label="Capital reserve" value={usd(y1.expenses.capexReserve)} />
              <Row label="Total expenses" value={usd(y1.expenses.total)} tone="total" />
              <Row label="NOI" value={usd(y1.noi)} tone="total" />
            </div>
          </div>
          )}

          </div>

        {/* ---------------- page two ---------------- */}
        <div className="print-break-before px-6 py-6 sm:px-8">

          <div className="print-section mb-7">
            <SectionTitle kicker="By year">Cash-on-cash yield</SectionTitle>
            <CashOnCashBars years={s.years} />
          </div>

          {/* The bear/base/bull comparison chart was removed with the
              picker. Nobody chooses between the cases now, so a chart
              contrasting them is three numbers with no way to
              interrogate any of them — the occupancy dial is where the
              downside gets tested. */}
        </div>

        {/* ---------------- page three ---------------- */}
        <div className="print-break-before px-6 py-6 sm:px-8">
          <div className="print-section mb-7 grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle kicker="Sources and uses">Capitalization</SectionTitle>
              <Row label="Purchase price" value={usd(cap.purchasePrice)} />
              <Row label="Debt" value={`(${usd(cap.loanAmount)})`} tone="minus" />
              <Row label="Equity" value={usd(cap.equity)} />
              <Row label="Closing costs" value={usd(cap.closingCosts)} />
              <Row label="Loan costs" value={usd(cap.loanCosts)} />
              <Row label="Vacancy reserves" value={usd(cap.vacancyReserves)} />
              <Row label="Maintenance reserves" value={usd(cap.maintenanceReserves)} />
              {cap.platformFee > 0 && <Row label="Platform fee" value={usd(cap.platformFee)} />}
              {cap.conversionCapex > 0 && (
                <Row label="Conversion capex" value={usd(cap.conversionCapex)} />
              )}
              {cap.furnishingCost > 0 && (
                <Row label="Furnishing" value={usd(cap.furnishingCost)} />
              )}
              <Row
                label="Total capitalized equity"
                value={usd(cap.totalCapitalizedEquity)}
                tone="total"
              />
              <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                Reserves are{" "}
                {inputs.capitalization.capitalizeReserves
                  ? "funded at close and sit in the equity denominator"
                  : "accrued from cash flow and left out of the denominator"}
                . Confirm against the closing statement — it moves every figure
                on this sheet.
              </p>
            </div>

            {!isBuyer && (
            <div>
              <SectionTitle kicker={`${holdYears}-year hold`}>Investor position</SectionTitle>
              <Row label="Investment" value={usd(subscription)} />
              <Row
                label="Ownership share"
                value={pct(subscription / cap.totalCapitalizedEquity, 2)}
              />
              <Row label="Equity multiple" value={multiple(s.leveredMoic)} />
              <Row
                label={`Projected value, year ${holdYears}`}
                value={usd(s.projectedPositionValue(subscription))}
                tone="total"
              />
              <Row
                label="Projected gain"
                value={usd(s.projectedPositionValue(subscription) - subscription)}
              />
              <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                Investment times the levered equity multiple, after the loan is
                repaid and selling costs are taken out.
                {refiApplies
                  ? ` A year-${base.refinance.year} refinance returns capital along the way.`
                  : ` No refinance — the year-${base.refinance.year} refinance falls on or after the sale, so it never happens.`}
              </p>

              <div className="mt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Same investment, by hold period
                </div>
                {holdComparison.map((h) => (
                  <Row
                    key={h.years}
                    label={`${h.years} years`}
                    value={usd(subscription * h.moic)}
                    note={`${pct(h.irr)} IRR`}
                    tone={h.years === holdYears ? "total" : "normal"}
                  />
                ))}
              </div>
            </div>
            )}
          </div>

          {isBuyer && (
            <div className="no-print mb-6 border-t border-neutral-200 pt-4">
              <button
                onClick={() => setDetailOpen((v) => !v)}
                className="text-[12px] font-semibold underline underline-offset-4"
                style={{ color: "#00A651" }}
              >
                {detailOpen ? "Hide the full detail" : "Show the full detail"}
              </button>
              <span className="ml-2 text-[11.5px] text-neutral-500">
                Expense ranking, equity and return-of-capital curves, and the
                year-by-year cash flows.
              </span>
              <span className="ml-2 text-[11px] text-neutral-400">
                In the printed sheet either way.
              </span>
            </div>
          )}

          {showDetail && (
            <>
          <div className="print-section mb-2">
            <SectionTitle kicker="Year 1 · ranked">Expense stack</SectionTitle>
            <ExpenseBars expenses={y1.expenses} />
          </div>

          <div className="print-section mb-7">
            <SectionTitle kicker="Hold period">Equity, after the debt is repaid</SectionTitle>
            <EquityCurve
              years={s.years}
              purchasePrice={cap.purchasePrice}
              equityBasis={cap.totalCapitalizedEquity}
            />
            <p className="mt-2 text-[11px] leading-snug text-neutral-500">
              The solid line is what the position is actually worth: property
              value less the outstanding loan. The dashed line is gross property
              value, shown for reference only — it is not a return.
            </p>
          </div>

          <div className="print-section mb-7">
            <SectionTitle kicker="Cumulative position">Return of capital</SectionTitle>
            <BreakEvenCurve
              years={s.years}
              equityBasis={cap.totalCapitalizedEquity}
              breakEvenMonths={s.breakEvenMonths}
            />
          </div>

          <div className="print-section">
            <SectionTitle kicker={`${inputs.exit.holdYears}-year hold`}>Cash flows</SectionTitle>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  {["Yr", "Net to owner", "Expenses", "NOI", "Debt service", "Levered CF", "DSCR"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-neutral-500 ${
                          i === 0 ? "" : "text-right"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {s.years.map((row) => (
                  <tr key={row.year} className="print-keep border-b border-neutral-200">
                    <td className="py-1.5 text-[12px] text-neutral-800">{row.year}</td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {usd(row.income.netToOwner)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                      ({usd(row.expenses.total)})
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {usd(row.noi)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-600">
                      ({usd(row.debtService)})
                    </td>
                    <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-neutral-900">
                      {usd(row.leveredCashFlow)}
                    </td>
                    <td className="py-1.5 text-right text-[12px] tabular-nums text-neutral-800">
                      {row.dscr.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          )}

          {/* Internal only, and no-print on top of that — these two
              panels reference the benchmark method and must not reach
              paper even with internal view left on. */}
          {internalView && (
            <div className="no-print mt-7 space-y-4">
              <div className="rounded border-l-4 border-neutral-900 bg-neutral-100 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  Internal · benchmark parity
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-neutral-700">
                  The published template divides year-{inputs.exit.holdYears} gross
                  property value by capitalized equity and never subtracts the
                  loan payoff. On this deal that reads as{" "}
                  <strong>{pct(s.benchmarkParity.grossValueOverEquityPct)}</strong>,
                  overstating modeled levered profit by{" "}
                  <strong>{usd(s.benchmarkParity.overstatementVsLevered)}</strong>.
                </p>
              </div>

              <div className="rounded border-l-4 border-neutral-900 bg-neutral-100 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                  Internal · lens delta
                </div>
                <div className="mt-2">
                  <Row label="NOI, GLBM stack" value={usd(glbmResult[activeScenario].years[0].noi)} />
                  <Row
                    label="NOI, syndicator template"
                    value={usd(templateResult[activeScenario].years[0].noi)}
                  />
                  <Row
                    label="Template runs higher by"
                    value={usd(
                      templateResult[activeScenario].years[0].noi -
                        glbmResult[activeScenario].years[0].noi
                    )}
                    tone="total"
                  />
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Keep this panel off anything a buyer sees. The side-by-side
                  table above is the version to present — it states the gap
                  without characterising anyone else&rsquo;s underwriting.
                </p>
              </div>
            </div>
          )}
        </div>

        {isBuyer && deal && <Readiness deal={deal} sqft={p.sqft} />}
        {isBuyer && show("syndication") && (
          <SyndicationPanel
            price={inputs.capitalization.purchasePrice}
            loan={s.capitalization.loanAmount}
            cashToClose={s.capitalization.totalCapitalizedEquity}
            grossScheduledRent={s.years[0].income.grossScheduledRent}
            annualDebtService={s.years[0].debtService}
            monthlyDebtService={s.years[0].debtService / 12}
            // Two kinds of expense behave differently as occupancy
            // falls. Management and the capex reserve are struck off
            // net income, so they shrink with it; taxes, insurance and
            // utilities do not. Break-even is wrong if they are
            // averaged together.
            variableExpensePct={
              s.years[0].income.grossScheduledRent > 0
                ? (s.years[0].income.grossScheduledRent -
                    s.years[0].income.netToOwner +
                    s.years[0].expenses.management +
                    s.years[0].expenses.capexReserve) /
                  s.years[0].income.grossScheduledRent
                : 0
            }
            fixedExpenses={
              s.years[0].expenses.total -
              s.years[0].expenses.management -
              s.years[0].expenses.capexReserve
            }
            projectCashFlows={s.leveredStream}
            holdYears={inputs.exit.holdYears}
            occupancyLabel={`${Math.round(
              modelInputs.scenarios[activeScenario].income.occupancyPct * 100
            )}% occupancy`}
          />
        )}

        {isBuyer && show("diligence") && (
          <ProvenancePanel
            deal={deal}
            market={market}
            comps={comps}
            rooms={rooms || []}
            sharedRate={roomRate({ room_type: "shared" }, market, {}, deal)}
            ensuiteRate={roomRate({ room_type: "ensuite" }, market, {}, deal)}
            occupancyPct={modelInputs.scenarios[activeScenario].income.occupancyPct}
            pricePerSqft={
              deal?.list_price && (deal.finished_sqft || deal.post_reno_sqft || deal.living_area_sqft)
                ? deal.list_price /
                  (deal.finished_sqft || deal.post_reno_sqft || deal.living_area_sqft)
                : null
            }
            sqft={deal?.finished_sqft || deal?.post_reno_sqft || deal?.living_area_sqft}
          />
        )}

        {isBuyer && show("diligence") && <SupportingDocuments documents={documents} />}

        {isBuyer && core && show("padsplit") && <MarketPanel market={market} deal={deal} />}
        {isBuyer && show("research") && marketReport && (
          <MarketReport
            report={marketReport}
            city={city || deal?.city || marketReport?.city}
            state={state || deal?.state || marketReport?.state}
          />
        )}

        {isBuyer && deal && (
          <FlyerFooter
            deal={deal}
            market={market}
            hasOwnPhotos={!!deal.hero_image_url}
            defaults={defaults}
            adjusted={isAdjusted}
          />
        )}

        {!isBuyer && (
        /* Closing band. Carries the mark onto the last sheet. */
        <div
          className="print-keep flex items-center justify-between border-t-2 px-6 py-4 sm:px-8"
          style={{ borderColor: GREEN }}
        >
          <div className="text-[9px] leading-snug text-neutral-500">
            Figures are estimates for underwriting and are not a guarantee of
            performance. Not investment advice.
            <br />
            Green Light Buying Machine — The Coliving Ecosystem
          </div>
          <BrandMark height={26} />
        </div>
        )}
      </div>
    </div>
  );
}

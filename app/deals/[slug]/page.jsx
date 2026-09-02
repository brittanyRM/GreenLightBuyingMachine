"use client";

import { useState, useEffect } from "react";
import { getDealBundle, marketIsStale, supabase } from "../../../lib/queries";
import { computeProForma, usd } from "../../../lib/proforma";
import ConversionSketch from "../../../components/ConversionSketch";
import ProForma from "../../../components/ProForma";
import DealFlyer from "../../../components/DealFlyer";
import BuyerMap from "../../../components/BuyerMap";
import FloorPlanRender from "../../../components/FloorPlanRender";
import ErrorBoundary from "../../../components/ErrorBoundary";
import DealForm from "../../../components/DealForm";
import CompImport from "../../../components/CompImport";
import MarketResearch from "../../../components/MarketResearch";
import EmailComposer from "../../../components/EmailComposer";

const GREEN = "#00A651";

// Tabs that swap the panel below. Everything here renders in place.
const TABS = [
  { id: "sketch", label: "Sketch" },
  { id: "plan", label: "Plan" },
  { id: "proforma", label: "Pro forma" },
  { id: "flyer", label: "Flyer" },
  { id: "map", label: "Map" },
  { id: "research", label: "Research" },
  { id: "email", label: "Email" },
  { id: "record", label: "Record" },
];

// Tabs that navigate. Both are standalone documents with their own
// print layout and share flow, so they stay separate routes rather
// than being mounted here — but they read as tabs because that is
// what they are to whoever is working the deal. Tucked to the right
// with an arrow they looked like an afterthought.
//
// "Club sheet" was the internal name for the format this was modelled
// against and it meant nothing to anyone else. It is the sheet a buyer
// is sent, so that is what it is called.
const LINK_TABS = [
  { id: "buyer-sheet", label: "Buyer sheet", href: (slug) => `/buyer-sheets/${slug}` },
  { id: "financing", label: "Financing", href: (slug) => `/financing/${slug}` },
];

export default function DealPage({ params }) {
  const [bundle, setBundle] = useState(null);
  // Markets with a centroid, for the map tab. Cheap and only fetched
  // once, so it rides along with the bundle rather than gating it.
  const [nearbyMarkets, setNearbyMarkets] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState(null);
  const [tab, setTab] = useState("sketch");
  const [sketchFile, setSketchFile] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setBundle(await getDealBundle(params.slug));

      // Markets with a centroid, for the map tab.
      const { data: mk } = await supabase
        .from("padsplit_market")
        .select("zip, active_units, upcoming_units, shared_weekly, private_weekly, avg_occupancy, days_to_first_booking, latitude, longitude")
        .not("latitude", "is", null)
        .limit(60);
      setNearbyMarkets(mk || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [params.slug]);

  if (error)
    return (
      <div className="p-8 font-sans text-sm text-red-700">
        Couldn't load this deal: {error}
      </div>
    );
  if (!bundle) return <div className="p-8 font-sans text-sm text-neutral-500">Loading…</div>;

  const { deal, rooms, comps, market, orgRows, documents, defaults } = bundle;
  const p = computeProForma({ deal, rooms, market, comps, orgRows });
  const stale = marketIsStale(market);

  return (
    <div className="min-h-screen bg-neutral-100 font-sans">
      {/* Sticky header — screen only; the sheets carry their own branding */}
      <div className="no-print sticky top-[41px] z-20 bg-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-3">
          <div className="flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              {deal.status.replace("_", " ")}
            </div>
            <div className="text-base font-bold text-white">
              {deal.address_line}, {deal.city} {deal.zip}
            </div>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Config</div>
              <div className="text-sm font-bold text-white">
                {p.mix.bedrooms}/{p.mix.bathrooms}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Gross</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: GREEN }}>
                {usd(p.grossMonthly)}/mo
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Price</div>
              <div className="text-sm font-bold tabular-nums text-white">{usd(p.price)}</div>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                tab === t.id ? "text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
              style={tab === t.id ? { borderBottom: `2px solid ${GREEN}` } : {}}
            >
              {t.label}
            </button>
          ))}

          {/* Same shape as the tabs above, and a divider so it is
              still clear these leave the page. */}
          <span className="my-2 ml-2 mr-1 w-px self-stretch bg-neutral-800" aria-hidden="true" />
          {LINK_TABS.map((t) => (
            <a
              key={t.id}
              href={t.href(params.slug)}
              className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {stale && (
        <div className="bg-amber-50 px-5 py-2 text-center text-[11px] text-amber-900">
          PadSplit market data for {deal.zip}{" "}
          {market ? "is over 60 days old" : "hasn't been entered"}. Rents and occupancy may be off.
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        {tab === "sketch" && (
          <ErrorBoundary label="The sketch">
          <ConversionSketch deal={deal} initialRooms={rooms} market={market} onSaved={load} onSketchFile={setSketchFile} />
          </ErrorBoundary>
        )}
        {tab === "plan" && (
          <div className="p-4 sm:p-8">
            <ErrorBoundary label="The plan">
              <FloorPlanRender
                deal={deal}
                onSaved={load}
                rooms={rooms}
                market={market}
                sketchFile={sketchFile}
                defaults={defaults}
              />
            </ErrorBoundary>
          </div>
        )}
        {tab === "proforma" && (
          <div>
            <div className="no-print flex justify-end px-4 pt-4 sm:px-8">
              <button
                onClick={() => window.print()}
                className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: GREEN }}
              >
                Print / save PDF
              </button>
            </div>
            <ProForma deal={deal} rooms={rooms} market={market} comps={comps} orgRows={orgRows} />
          </div>
        )}
        {tab === "flyer" && (
          <div className="p-4 sm:p-8">
            <div className="no-print mb-3 flex justify-end">
              <button
                onClick={() => window.print()}
                className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: GREEN }}
              >
                Print / save PDF
              </button>
            </div>
            <div className="bg-white shadow-xl">
              <DealFlyer deal={deal} rooms={rooms} market={market} comps={comps} orgRows={orgRows} finishes={deal.finishes || []} defaults={defaults} />
            </div>
          </div>
        )}
        {tab === "email" && (
          <EmailComposer
            deal={deal}
            rooms={rooms}
            market={market}
            comps={comps}
            orgRows={orgRows}
            documents={documents}
          />
        )}

        {tab === "map" && (
          <div className="mx-auto max-w-4xl px-5 py-6">
            <p className="mb-3 text-[12px] text-neutral-600">
              What a buyer sees. The subject property with PadSplit occupancy,
              rates and active units for the ZIPs around it.
            </p>
            <BuyerMap
              deal={deal}
              markets={nearbyMarkets}
              comps={comps}
              subjectMarket={market}
            />

            {/* Shown when the subject has no coordinates as well as when
                the comps don't. A deal with no lat/long gives the map
                nothing to centre on, so it renders blank — and the old
                condition only looked at comps, which meant the one
                button that would fix it stayed hidden. */}
            {(!deal?.latitude ||
              !deal?.longitude ||
              comps.filter((c) => c.latitude).length < comps.length) && (
              <div className="mt-3 rounded border border-neutral-200 bg-white px-4 py-3">
                <p className="text-[12px] text-neutral-700">
                  {!deal?.latitude || !deal?.longitude ? (
                    <>
                      This property has no coordinates, so the map has nothing to
                      centre on and stays blank.{" "}
                    </>
                  ) : null}
                  {comps.length - comps.filter((c) => c.latitude).length > 0 ? (
                    <>
                      {comps.length - comps.filter((c) => c.latitude).length} of{" "}
                      {comps.length} comps have no coordinates, so they
                      aren&rsquo;t on the map.
                    </>
                  ) : null}
                </p>
                <button
                  onClick={async () => {
                    setGeocoding(true);
                    try {
                      const { data: sess } = await supabase.auth.getSession();
                      const res = await fetch("/api/geocode-comps", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${sess?.session?.access_token || ""}`,
                        },
                        body: JSON.stringify({ slug: params.slug }),
                      });
                      const j = await res.json();
                      // Show why, not just how many. A silent count is
                      // what made this read as "the button does nothing".
                      setGeoMsg(
                        j.error
                          ? j.error
                          : j.blocked
                          ? `The geocoder refused this server after ${j.located} of ${j.attempted}. ${
                              j.failures?.[0]?.reason || ""
                            }`
                          : (j.dealLocated ? "Placed the property. " : "") +
                            `Placed ${j.located} of ${j.attempted} comps.` +
                            (j.failed
                              ? ` ${j.failed} failed — ${j.failures
                                  ?.map((f) => `${f.address}: ${f.reason}`)
                                  .join("; ")}`
                              : "") +
                            " Reload to see them."
                      );
                    } catch (e) {
                      setGeoMsg(e.message);
                    } finally {
                      setGeocoding(false);
                    }
                  }}
                  disabled={geocoding}
                  className="mt-2 rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  style={{ backgroundColor: GREEN }}
                >
                  {geocoding ? "Placing…" : "Place on the map"}
                </button>
                {geoMsg && (
                  <span className="ml-3 text-[12px] text-neutral-600">{geoMsg}</span>
                )}
                <p className="mt-1.5 text-[10px] text-neutral-400">
                  Looked up once and stored. Takes about a second per comp.
                </p>
              </div>
            )}
            {!deal.latitude && (
              <p className="mt-3 text-[12px] text-amber-800">
                This deal has no coordinates, so the map falls back to the ZIP
                centroid. Set latitude and longitude on the record to pin the
                house itself.
              </p>
            )}
          </div>
        )}

        {/* City-level demographics. Keyed by city, not by deal — research
            run from one house covers every deal in that city, and the
            panel says so rather than making the work look undone.

            Its own tab because it is a step someone performs, not part
            of the record they fill in. Once saved it feeds the Market
            research tile on the buyer sheet. */}
        {tab === "research" && (
          <div className="mx-auto max-w-4xl space-y-4 px-5 py-6">
            <p className="text-[12px] text-neutral-600">
              Population, incomes, jobs and rents for {deal?.city || "this city"}
              {deal?.state ? `, ${deal.state}` : ""}. Run once per city — every
              deal here picks it up. Saved reports appear on the buyer sheet
              under the <span className="font-semibold">Market research</span> tile.
            </p>
            <ErrorBoundary label="Market research">
              <MarketResearch
                city={deal?.city}
                state={deal?.state}
                zip={deal?.zip}
                onSaved={load}
              />
            </ErrorBoundary>
          </div>
        )}

        {tab === "record" && (
          <>
            <DealForm initial={deal} initialMarket={market} onSaved={load} />
            {/* Sits under the record because comps are part of the
                record, and because DealForm's own paste box takes the
                short clipboard format while this one reads the full
                summary report. */}
            <div className="mx-auto max-w-4xl space-y-4 px-5 pb-10">
              <CompImport slug={params.slug} onImported={load} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

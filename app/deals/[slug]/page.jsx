"use client";

import { useState, useEffect } from "react";
import { getDealBundle, marketIsStale } from "../../../lib/queries";
import { computeProForma, usd } from "../../../lib/proforma";
import ConversionSketch from "../../../components/ConversionSketch";
import ProForma from "../../../components/ProForma";
import DealFlyer from "../../../components/DealFlyer";
import FloorPlanRender from "../../../components/FloorPlanRender";
import ErrorBoundary from "../../../components/ErrorBoundary";
import DealForm from "../../../components/DealForm";
import EmailComposer from "../../../components/EmailComposer";

const GREEN = "#00A651";

const TABS = [
  { id: "sketch", label: "Sketch" },
  { id: "plan", label: "Plan" },
  { id: "proforma", label: "Pro forma" },
  { id: "flyer", label: "Flyer" },
  { id: "email", label: "Email" },
  { id: "record", label: "Record" },
];

export default function DealPage({ params }) {
  const [bundle, setBundle] = useState(null);
  const [tab, setTab] = useState("sketch");
  const [sketchFile, setSketchFile] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setBundle(await getDealBundle(params.slug));
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

          {/* Links out rather than mounting a tab — the club sheet is a
              standalone document with its own print layout and share
              flow, and nothing on this page needs to know about it. */}
          <a
            href={`/proforma-club/${params.slug}`}
            className="ml-auto self-center px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
          >
            Club sheet →
          </a>
          <a
            href={`/financing/${params.slug}`}
            className="self-center px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
          >
            Financing →
          </a>
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
        {tab === "record" && (
          <DealForm initial={deal} initialMarket={market} onSaved={load} />
        )}
      </div>
    </div>
  );
}

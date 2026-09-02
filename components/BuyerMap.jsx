"use client";

// ============================================================
// The property on a map, with the market and the comps around it.
//
// Three things a buyer wants to know about location: where the house
// is, how this ZIP performs against its neighbours, and what nearby
// houses actually sold for. Each is a layer they can switch off.
//
// The numbers sit in a list beside the map rather than only in popups.
// A popup is fine for one lookup and useless for comparing six ZIPs,
// which is the actual task.
//
// Leaflet with OpenStreetMap tiles: no API key, no account, no
// per-view billing. Loaded on demand.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";

const GREEN = "#00A651";
const INK = "#141914";
const COMP = "#7C3AED";

const usd0 = (n) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";

function occupancyColour(occ, median) {
  if (occ == null) return "#9AA3AB";
  if (median == null) return GREEN;
  if (occ >= median + 0.03) return "#046A38";
  if (occ <= median - 0.05) return "#B45309";
  return GREEN;
}

export default function BuyerMap({ deal, markets = [], comps = [], subjectMarket }) {
  const holder = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ markets: null, comps: null });
  // Kept so the zoom buttons can return to a known frame rather than
  // stepping out one level at a time.
  const boundsRef = useRef({ near: null, all: null });

  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showMarkets, setShowMarkets] = useState(true);
  const [showComps, setShowComps] = useState(true);
  // What's currently selected, shown in a card above the map so it
  // doesn't require hunting at zoom. Clicking a marker or a row in the
  // list both land here.
  const [selected, setSelected] = useState(null);

  const plottableMarkets = useMemo(
    () => markets.filter((m) => Number(m.latitude) && Number(m.longitude)),
    [markets]
  );
  const plottableComps = useMemo(
    () => comps.filter((c) => Number(c.latitude) && Number(c.longitude)),
    [comps]
  );

  const lat = Number(deal?.latitude) || Number(subjectMarket?.latitude) || null;
  const lng = Number(deal?.longitude) || Number(subjectMarket?.longitude) || null;

  const median = useMemo(() => {
    const occs = plottableMarkets
      .map((m) => Number(m.avg_occupancy))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    return occs.length ? occs[Math.floor(occs.length / 2)] : null;
  }, [plottableMarkets]);

  useEffect(() => {
    if (!open || mapRef.current || !holder.current || !lat || !lng) return;
    let cancelled = false;

    (async () => {
      try {
        // Imported here rather than at module scope: Leaflet reaches
        // for window on load and would break the server render.
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !holder.current) return;

        const map = L.map(holder.current, { scrollWheelZoom: false }).setView([lat, lng], 12);
        mapRef.current = map;

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        // Two sets. The ZIP markers span the whole metro, so fitting
        // to them zooms out until the comps are a single cluster of
        // dots — which is what made this unreadable. The default view
        // is the subject and the sales it is priced against; the ZIPs
        // are context you can zoom out to.
        const bounds = [[lat, lng]];
        const nearBounds = [[lat, lng]];

        const marketLayer = L.layerGroup();
        for (const m of plottableMarkets) {
          const occ = Number(m.avg_occupancy) || null;
          const isSubject = m.zip === deal?.zip;
          const colour = isSubject ? INK : occupancyColour(occ, median);
          L.circleMarker([Number(m.latitude), Number(m.longitude)], {
            radius: isSubject ? 13 : 9 + Math.min(6, (Number(m.active_units) || 0) / 8),
            color: colour,
            weight: isSubject ? 3 : 1.5,
            fillColor: colour,
            fillOpacity: isSubject ? 0.85 : 0.5,
          })
            .bindTooltip(`${m.zip}${occ ? ` · ${Math.round(occ * 100)}%` : ""}`, {
              direction: "top",
            })
            .on("click", () => setSelected({ kind: "market", data: m }))
            .addTo(marketLayer);
          bounds.push([Number(m.latitude), Number(m.longitude)]);
        }
        layersRef.current.markets = marketLayer;
        marketLayer.addTo(map);

        const compLayer = L.layerGroup();
        for (const c of plottableComps) {
          L.circleMarker([Number(c.latitude), Number(c.longitude)], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: COMP,
            fillOpacity: 0.95,
          })
            .bindTooltip(
              `<span style="background:#fff;border:1px solid ${COMP};color:#1B2A20;border-radius:4px;font:700 10.5px system-ui;padding:2px 5px;white-space:nowrap">${usd0(
                c.sold_price || c.list_price
              )}</span>`,
              {
                // Permanent: the price is the reason a comp is on the
                // map, and hiding it behind a hover means it cannot be
                // read at all on a phone.
                permanent: true,
                direction: "top",
                offset: [0, -6],
                opacity: 1,
                className: "",
              }
            )
            .on("click", () => setSelected({ kind: "comp", data: c }))
            .addTo(compLayer);
          bounds.push([Number(c.latitude), Number(c.longitude)]);
          nearBounds.push([Number(c.latitude), Number(c.longitude)]);
        }
        layersRef.current.comps = compLayer;
        compLayer.addTo(map);

        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:${GREEN};border:3px solid #fff;border-radius:50%;width:20px;height:20px;box-shadow:0 1px 8px rgba(0,0,0,.45)"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        })
          .bindTooltip(
            `<span style="background:${INK};color:#fff;border-radius:4px;font:700 11px system-ui;padding:3px 7px;white-space:nowrap">${
              deal?.address_line || "This property"
            }</span>`,
            {
            permanent: true,
            direction: "right",
            offset: [12, 0],
            opacity: 1,
            // Styled inline rather than through a global stylesheet,
            // which this component can't reach.
            className: "",
          })
          .addTo(map);

        // maxZoom so a deal with one nearby comp doesn't land on the
        // roof of a single house with no streets for orientation.
        const fitTo = nearBounds.length > 1 ? nearBounds : bounds;
        if (fitTo.length > 1) map.fitBounds(fitTo, { padding: [44, 44], maxZoom: 15 });
        boundsRef.current = { near: nearBounds, all: bounds };

        // Scroll-to-zoom is off until the map is clicked, so scrolling
        // the page past it doesn't get captured. Once someone has
        // clicked into it, they mean to be here.
        map.once("click", () => map.scrollWheelZoom.enable());
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = { markets: null, comps: null };
      }
    };
  }, [open, lat, lng, plottableMarkets, plottableComps, median, deal]);

  // Toggling a layer shouldn't rebuild the map or lose the view.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current.markets;
    if (!map || !layer) return;
    showMarkets ? layer.addTo(map) : map.removeLayer(layer);
  }, [showMarkets]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current.comps;
    if (!map || !layer) return;
    showComps ? layer.addTo(map) : map.removeLayer(layer);
  }, [showComps]);

  const flyTo = (a, b, sel) => {
    if (mapRef.current && a && b) {
      mapRef.current.setView([Number(a), Number(b)], 15, { animate: true });
    }
    if (sel) setSelected(sel);
  };

  if (!lat || !lng) return null;

  const Toggle = ({ on, set, colour, label, count }) => (
    <button
      onClick={() => set(!on)}
      className="flex items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] font-semibold transition"
      style={{
        borderColor: on ? colour : "#D4D4D4",
        backgroundColor: on ? `${colour}14` : "#fff",
        color: on ? "#0A0A0A" : "#8A9198",
      }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: on ? colour : "#D4D4D4" }}
      />
      {label}
      <span className="text-neutral-400">{count}</span>
    </button>
  );

  return (
    <div className="no-print px-8 pb-4">
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-neutral-900">
              This property on the map
            </div>
            <div className="text-[11px] leading-snug text-neutral-600">
              PadSplit performance for the ZIPs around it, and the comparable
              sales it&rsquo;s priced against. Switch either off.
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: GREEN }}
          >
            {open ? "Hide map" : "Open map"}
          </button>
        </div>

        {open && (
          <div className="mt-3">
            {failed ? (
              <div className="rounded border border-neutral-200 px-4 py-6 text-center text-[12px] text-neutral-500">
                The map couldn&rsquo;t load. The figures above are unaffected.
              </div>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Toggle
                    on={showMarkets}
                    set={setShowMarkets}
                    colour={GREEN}
                    label="PadSplit ZIPs"
                    count={plottableMarkets.length}
                  />
                  <Toggle
                    on={showComps}
                    set={setShowComps}
                    colour={COMP}
                    label="Comparable sales"
                    count={plottableComps.length}
                  />
                  {/* Two framings rather than pinch-and-hunt. The
                      neighbourhood is what a buyer is judging; the metro
                      is where the ZIP data lives. */}
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => {
                        const b = boundsRef.current.near;
                        if (mapRef.current && b?.length > 1)
                          mapRef.current.fitBounds(b, { padding: [44, 44], maxZoom: 15 });
                      }}
                      className="rounded border border-neutral-300 px-2 py-1 text-[10.5px] font-semibold text-neutral-700 hover:border-neutral-500"
                    >
                      This neighbourhood
                    </button>
                    <button
                      onClick={() => {
                        const b = boundsRef.current.all;
                        if (mapRef.current && b?.length > 1)
                          mapRef.current.fitBounds(b, { padding: [30, 30] });
                      }}
                      className="rounded border border-neutral-300 px-2 py-1 text-[10.5px] font-semibold text-neutral-700 hover:border-neutral-500"
                    >
                      All ZIPs
                    </button>
                  </span>
                  {comps.length > plottableComps.length && (
                    <span className="text-[10px] text-neutral-400">
                      {comps.length - plottableComps.length} comp
                      {comps.length - plottableComps.length === 1 ? "" : "s"} not
                      placed
                    </span>
                  )}
                </div>

                {/* What's selected, spelled out above the map. Reading
                    a marker shouldn't mean zooming in to find it again. */}
                {selected && (
                  <div
                    className="mb-2 rounded-lg border-2 px-4 py-3"
                    style={{
                      borderColor: selected.kind === "comp" ? COMP : GREEN,
                      backgroundColor: selected.kind === "comp" ? "#FAF5FF" : "#F2FAF5",
                    }}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-500">
                          {selected.kind === "comp" ? "Comparable sale" : "PadSplit market"}
                        </div>
                        <div className="text-[15px] font-bold text-neutral-900">
                          {selected.kind === "comp"
                            ? selected.data.address
                            : `ZIP ${selected.data.zip}`}
                          {selected.kind === "market" && selected.data.zip === deal?.zip && (
                            <span className="ml-2 text-[10px] font-black uppercase tracking-wider" style={{ color: GREEN }}>
                              this property
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelected(null)}
                        className="text-[11px] text-neutral-400 underline underline-offset-2"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                      {(selected.kind === "comp"
                        ? [
                            ["Sold", usd0(selected.data.sold_price || selected.data.list_price)],
                            ["Beds", selected.data.bedrooms],
                            ["Baths", selected.data.bathrooms],
                            ["Sq ft", selected.data.approx_sqft ? Number(selected.data.approx_sqft).toLocaleString() : null],
                            ["$/sq ft", selected.data.price_per_sqft ? `$${selected.data.price_per_sqft}` : null],
                            ["Built", selected.data.year_built],
                            [
                              "Date",
                              selected.data.sold_date
                                ? new Date(selected.data.sold_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                                : null,
                            ],
                          ]
                        : [
                            [
                              "Occupancy",
                              selected.data.avg_occupancy
                                ? `${Math.round(selected.data.avg_occupancy * 100)}%`
                                : null,
                            ],
                            ["Shared", selected.data.shared_weekly ? `$${selected.data.shared_weekly}/wk` : null],
                            ["Private bath", selected.data.private_weekly ? `$${selected.data.private_weekly}/wk` : null],
                            ["Active units", selected.data.active_units],
                            ["Upcoming", selected.data.upcoming_units],
                            [
                              "To first booking",
                              selected.data.days_to_first_booking
                                ? `${selected.data.days_to_first_booking} days`
                                : null,
                            ],
                          ]
                      )
                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                        .map(([label, value]) => (
                          <div key={label}>
                            <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                              {label}
                            </div>
                            <div className="text-[15px] font-bold tabular-nums leading-tight text-neutral-900">
                              {value}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
                  <div
                    ref={holder}
                    className="h-[560px] w-full overflow-hidden rounded-lg border border-neutral-200"
                    style={{ background: "#EEF2F0" }}
                  />

                  {/* The numbers, readable without hovering anything. */}
                  <div className="max-h-[560px] overflow-y-auto rounded-lg border border-neutral-200">
                    {showMarkets && plottableMarkets.length > 0 && (
                      <div>
                        <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                          PadSplit by ZIP
                        </div>
                        {[...plottableMarkets]
                          .sort(
                            (a, b) =>
                              (Number(b.avg_occupancy) || 0) - (Number(a.avg_occupancy) || 0)
                          )
                          .map((m) => {
                            const occ = Number(m.avg_occupancy) || null;
                            const isSubject = m.zip === deal?.zip;
                            return (
                              <button
                                key={m.zip}
                                onClick={() => flyTo(m.latitude, m.longitude, { kind: "market", data: m })}
                                className="block w-full border-b border-neutral-100 px-3 py-2 text-left transition hover:bg-neutral-50"
                                style={{
                                  backgroundColor: isSubject ? "#F2FAF5" : undefined,
                                }}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[12px] font-bold text-neutral-900">
                                    {m.zip}
                                    {isSubject && (
                                      <span
                                        className="ml-1.5 text-[8px] font-black uppercase tracking-wider"
                                        style={{ color: GREEN }}
                                      >
                                        this one
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className="text-[13px] font-bold tabular-nums"
                                    style={{ color: occupancyColour(occ, median) }}
                                  >
                                    {occ ? `${Math.round(occ * 100)}%` : "—"}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-neutral-500">
                                  {m.shared_weekly ? <span>${m.shared_weekly} shared</span> : null}
                                  {m.private_weekly ? <span>${m.private_weekly} private</span> : null}
                                  {m.active_units != null ? (
                                    <span>{m.active_units} active</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {showComps && plottableComps.length > 0 && (
                      <div>
                        <div className="sticky top-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                          Comparable sales
                        </div>
                        {plottableComps.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => flyTo(c.latitude, c.longitude, { kind: "comp", data: c })}
                            className="block w-full border-b border-neutral-100 px-3 py-2 text-left transition hover:bg-neutral-50"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[11.5px] font-semibold text-neutral-900">
                                {c.address}
                              </span>
                              <span
                                className="text-[12px] font-bold tabular-nums"
                                style={{ color: COMP }}
                              >
                                {usd0(c.sold_price || c.list_price)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-neutral-500">
                              {c.bedrooms ? <span>{c.bedrooms} bed</span> : null}
                              {c.approx_sqft ? (
                                <span>{Number(c.approx_sqft).toLocaleString()} sq ft</span>
                              ) : null}
                              {c.price_per_sqft ? <span>${c.price_per_sqft}/sf</span> : null}
                              {c.sold_date ? (
                                <span>{new Date(c.sold_date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}</span>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {!showMarkets && !showComps && (
                      <div className="px-3 py-6 text-center text-[11px] text-neutral-400">
                        Both layers are off.
                      </div>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                  Marker size is active units; colour is occupancy against the
                  local median. Comp prices are labelled on the map. Tap any row
                  to centre on it, and click the map once to turn on scroll
                  zoom. PadSplit data as last recorded &mdash; occupancy and
                  rates move.
                </p>
              </>
            )}
          </div>
        )}
      </div>


    </div>
  );
}

"use client";

// ============================================================
// The property on a map, with PadSplit market data for the ZIPs
// around it.
//
// A buyer looking at one house in Glendale wants to know whether this
// ZIP is strong relative to its neighbours — 95% occupancy means
// little without knowing the metro runs at 87%. Numbers in a table
// can't answer "is this a good part of town"; a map can.
//
// Leaflet with OpenStreetMap tiles: no API key, no account, no
// per-view billing. Loaded on demand so the sheet doesn't carry the
// weight for buyers who never open it.
// ============================================================

import { useEffect, useRef, useState } from "react";

const GREEN = "#00A651";
const INK = "#141914";

// Colour by occupancy against the set being shown, so "good" is
// relative to this market rather than an absolute we invented.
function occupancyColour(occ, median) {
  if (occ == null) return "#9AA3AB";
  if (median == null) return GREEN;
  if (occ >= median + 0.03) return "#046A38";
  if (occ <= median - 0.05) return "#B45309";
  return GREEN;
}

export default function BuyerMap({ deal, markets = [], subjectMarket }) {
  const holder = useRef(null);
  const mapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const plottable = markets.filter(
    (m) => Number(m.latitude) && Number(m.longitude)
  );

  const lat = Number(deal?.latitude) || Number(subjectMarket?.latitude) || null;
  const lng = Number(deal?.longitude) || Number(subjectMarket?.longitude) || null;

  useEffect(() => {
    if (!open || mapRef.current || !holder.current) return;
    if (!lat || !lng) return;

    let cancelled = false;

    (async () => {
      try {
        // Imported here rather than at module scope: Leaflet reaches
        // for window on load and would break the server render.
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        if (cancelled || !holder.current) return;

        const map = L.map(holder.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        }).setView([lat, lng], 11);
        mapRef.current = map;

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        const occs = plottable
          .map((m) => Number(m.avg_occupancy))
          .filter((v) => v > 0)
          .sort((a, b) => a - b);
        const median = occs.length
          ? occs[Math.floor(occs.length / 2)]
          : null;

        const bounds = [[lat, lng]];

        for (const m of plottable) {
          const occ = Number(m.avg_occupancy) || null;
          const isSubject = m.zip === deal?.zip;
          const colour = isSubject ? INK : occupancyColour(occ, median);

          const marker = L.circleMarker([Number(m.latitude), Number(m.longitude)], {
            radius: isSubject ? 13 : 9 + Math.min(6, (Number(m.active_units) || 0) / 8),
            color: colour,
            weight: isSubject ? 3 : 1.5,
            fillColor: colour,
            fillOpacity: isSubject ? 0.9 : 0.55,
          }).addTo(map);

          const row = (label, value) =>
            value != null && value !== ""
              ? `<div style="display:flex;gap:10px;justify-content:space-between"><span style="color:#6B7280">${label}</span><strong>${value}</strong></div>`
              : "";

          marker.bindPopup(
            `<div style="font:13px/1.45 system-ui;min-width:172px">
              <div style="font-weight:700;margin-bottom:4px">
                ${m.zip}${isSubject ? " · this property" : ""}
              </div>
              ${row("Occupancy", occ ? `${Math.round(occ * 100)}%` : null)}
              ${row("Shared", m.shared_weekly ? `$${m.shared_weekly}/wk` : null)}
              ${row("Private bath", m.private_weekly ? `$${m.private_weekly}/wk` : null)}
              ${row("Active units", m.active_units)}
              ${row("Upcoming", m.upcoming_units)}
              ${row(
                "To first booking",
                m.days_to_first_booking ? `${m.days_to_first_booking} days` : null
              )}
            </div>`
          );

          bounds.push([Number(m.latitude), Number(m.longitude)]);
        }

        // The house itself, on top of its ZIP marker.
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:${GREEN};border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        })
          .addTo(map)
          .bindPopup(
            `<div style="font:13px/1.45 system-ui"><strong>${
              deal?.address_line || "This property"
            }</strong><br/>${deal?.city || ""} ${deal?.zip || ""}</div>`
          );

        if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, lat, lng, plottable, deal]);

  if (!lat || !lng) return null;

  return (
    <div className="no-print px-8 pb-4">
      <div className="rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-neutral-900">
              This property on the map
            </div>
            <div className="text-[11px] leading-snug text-neutral-600">
              With PadSplit occupancy, room rates and active units for the ZIPs
              around it — so you can see how this one sits against its
              neighbours.
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
                <div
                  ref={holder}
                  className="h-[420px] w-full overflow-hidden rounded-lg border border-neutral-200"
                  style={{ background: "#EEF2F0" }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-neutral-600">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: GREEN, border: "2px solid #fff", boxShadow: "0 0 0 1px #ccc" }}
                    />
                    This property
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#046A38" }} />
                    Occupancy above the local median
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#B45309" }} />
                    Below it
                  </span>
                  <span className="text-neutral-400">
                    Marker size is active units. Tap one for its numbers.
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
                  PadSplit market data as last recorded. Occupancy and rates
                  move; treat these as indicative rather than current.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

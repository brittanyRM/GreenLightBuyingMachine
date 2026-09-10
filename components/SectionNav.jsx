"use client";

// ============================================================
// Section navigation for a buyer sheet.
//
// Built to match the internal deal bar: a dark header with the address
// and the headline figures, and a tab strip under it with the active
// section underlined. The two sides of the product should navigate the
// same way — a buyer who has been walked through the sheet on a call
// and then opens it themselves shouldn't have to learn a second
// pattern.
//
// Same three figures as the internal bar, because config, gross rent
// and price are facts about the house rather than about us. Nothing
// here is internal.
//
// The tiles above choose what is on the page; this moves you around
// it. It lists only sections that are actually showing, so it never
// offers to scroll somewhere empty.
// ============================================================

import { useEffect, useState } from "react";

const GREEN = "#00A651";

export default function SectionNav({
  sections = [],
  visible,
  address,
  location,
  config,
  gross,
  price,
}) {
  const shown = sections.filter((s) => visible.has(s.id));
  const [active, setActive] = useState(null);

  // Whichever section sits nearest the top third of the viewport.
  // Approximate on purpose — enough to say where you are without
  // recomputing on every pixel of scroll.
  useEffect(() => {
    if (!shown.length) return;
    const onScroll = () => {
      let current = null;
      for (const s of shown) {
        const el = document.getElementById(`sec-${s.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= window.innerHeight / 3) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [shown.map((s) => s.id).join(",")]);

  if (shown.length < 2) return null;

  return (
    <div className="no-print sticky top-0 z-20 bg-neutral-950">
      {address && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 pt-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-black uppercase tracking-[0.2em]"
              style={{ color: GREEN }}
            >
              Turnkey
            </div>
            <div className="truncate text-[17px] font-bold text-white">{address}</div>
            {location && <div className="text-[11px] text-neutral-400">{location}</div>}
          </div>

          <div className="flex shrink-0 items-end gap-6">
            {config && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  Config
                </div>
                <div className="text-sm font-bold tabular-nums text-white">{config}</div>
              </div>
            )}
            {gross && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  Gross
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: GREEN }}>
                  {gross}
                </div>
              </div>
            )}
            {price && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  Price
                </div>
                <div className="text-sm font-bold tabular-nums text-white">{price}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-wrap items-center px-5">
        {shown.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              const el = document.getElementById(`sec-${s.id}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition ${
              active === s.id ? "text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
            style={{
              borderBottom: active === s.id ? `2px solid ${GREEN}` : "2px solid transparent",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

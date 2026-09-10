"use client";

// ============================================================
// Section navigation for a buyer sheet.
//
// The same bar the deal page uses internally: every section the firm
// can see, listed, click to go there.
//
// It used to list only the sections currently ticked, which meant that
// with two of eight showing it offered two links and a buyer wanting
// the comps had to find the tiles, work out which box to tick, and
// then scroll. Now a section that isn't showing is still on the bar —
// clicking it turns it on and takes you to it. The tiles remain for
// choosing what a printed copy contains; this is for reading.
// ============================================================

import { useEffect, useState } from "react";

const GREEN = "#00A651";

export default function SectionNav({ sections = [], visible, onReveal }) {
  const [active, setActive] = useState(null);

  // Highlight whichever section is in view. Cheap and approximate —
  // the nearest anchor above the top third of the viewport — which is
  // enough to tell someone where they are without watching every pixel.
  useEffect(() => {
    const shown = sections.filter((s) => visible.has(s.id));
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
  }, [sections, visible]);

  if (sections.length < 2) return null;

  const go = (id) => {
    const el = document.getElementById(`sec-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Not on the page yet. Reveal it, then scroll once React has had a
    // frame to render it — scrolling to an element that does not exist
    // does nothing and looks like a dead button.
    onReveal?.(id);
    setTimeout(() => {
      document.getElementById(`sec-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  };

  return (
    <div className="no-print sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-5 py-1.5">
        {sections.map((s) => {
          const isShown = visible.has(s.id);
          const isActive = active === s.id && isShown;
          return (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              title={s.hint}
              className={`rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                isActive
                  ? "text-neutral-900"
                  : isShown
                  ? "text-neutral-500 hover:text-neutral-900"
                  : // Off the page but reachable. Dimmer, so the bar
                    // still shows what you are currently reading.
                    "text-neutral-400 hover:text-neutral-900"
              }`}
              style={
                isActive
                  ? { borderBottom: `2px solid ${GREEN}` }
                  : { borderBottom: "2px solid transparent" }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

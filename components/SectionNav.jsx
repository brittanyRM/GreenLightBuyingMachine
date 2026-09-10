"use client";

// ============================================================
// Section navigation for a buyer sheet.
//
// A tab strip in the same shape as the internal deal bar, sitting
// directly under the masthead so it is the first thing after the
// address. The two sides of the product should navigate the same way:
// a buyer walked through the sheet on a call and then opening it
// themselves shouldn't meet a second pattern.
//
// It selects rather than scrolls. Showing every section at once meant
// a buyer hunting for the comps had to scroll past the whole pro
// forma; now the page carries one section at a time and this chooses
// which. The pro forma above stays put — that is the document, not a
// section of it.
//
// No address or figures here: the masthead directly above already
// carries them, and repeating them a few pixels lower reads as a
// mistake.
// ============================================================

const GREEN = "#00A651";

export default function SectionNav({ sections = [], visible, active, onSelect }) {
  const shown = sections.filter((s) => visible.has(s.id));
  if (shown.length < 2) return null;

  return (
    <div className="no-print sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center px-5">
        {shown.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect?.(s.id)}
            title={s.hint || undefined}
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

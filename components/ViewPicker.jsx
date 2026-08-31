"use client";

// ============================================================
// Which parts of the sheet a buyer wants to look at.
//
// This replaced a row of tabs. Tabs pick one thing; a buyer
// comparing the comps against the pro forma had to keep switching
// back and forth and holding numbers in their head. These are
// toggles, so any combination can be on at once, and the ones a
// buyer turns off stay off while they read.
//
// The selection lives in the URL rather than in storage. A buyer
// who sends the link to a partner or a lender sends the view they
// were looking at, and a reload doesn't reset it.
//
// Printing ignores all of it — a PDF with sections missing is a
// document that gets forwarded and then argued about.
// ============================================================

const GREEN = "#00A651";

export default function ViewPicker({ sections, selected, onToggle, onAll, onOnly }) {
  const count = selected.size;
  const total = sections.length;

  return (
    <div className="no-print border-b border-neutral-200 bg-white px-6 py-4 sm:px-8">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          What you want to see
        </span>
        <span className="text-[11px] text-neutral-400">
          {count === total
            ? "Showing everything"
            : count === 0
            ? "Nothing selected"
            : `Showing ${count} of ${total}`}
        </span>
        {count !== total && (
          <button
            onClick={onAll}
            className="text-[11px] font-semibold underline underline-offset-2"
            style={{ color: GREEN }}
          >
            Show all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sections.map((sec) => {
          const on = selected.has(sec.id);
          return (
            <button
              key={sec.id}
              onClick={() => onToggle(sec.id)}
              // Double-click is a shortcut, not the only way to get
              // there — "Show all" covers the way back.
              onDoubleClick={() => onOnly(sec.id)}
              aria-pressed={on}
              className="group relative rounded border-2 px-3 py-2.5 text-left transition"
              style={{
                borderColor: on ? GREEN : "#E5E7EB",
                background: on ? "#F2FBF5" : "#FFFFFF",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[12.5px] font-bold leading-tight"
                    style={{ color: on ? "#0A0A0A" : "#6B7280" }}
                  >
                    {sec.label}
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-neutral-500">
                    {sec.hint}
                  </div>
                </div>

                {/* A checkbox, drawn rather than native, so the whole
                    tile is the hit target on a phone. */}
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2 text-[10px] font-black leading-none text-white"
                  style={{
                    borderColor: on ? GREEN : "#D1D5DB",
                    background: on ? GREEN : "transparent",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {count === 0 && (
        <p className="mt-2.5 text-[11.5px] text-neutral-500">
          Everything is hidden. Pick a tile above, or{" "}
          <button
            onClick={onAll}
            className="font-semibold underline underline-offset-2"
            style={{ color: GREEN }}
          >
            show all of it
          </button>
          .
        </p>
      )}
    </div>
  );
}

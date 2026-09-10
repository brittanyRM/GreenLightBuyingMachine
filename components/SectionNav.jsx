"use client";

// ============================================================
// The buyer sheet's chrome.
//
// Deliberately the same bar as the internal deal page: green kicker,
// address, three small figures on the right, tab strip beneath with
// the active one underlined. Same sizes, same weights, same spacing.
//
// The two sides were built at different times and read as two
// products. A buyer walked through the sheet on a call and then
// opening it themselves shouldn't meet a different design, and neither
// should you when you switch between them.
//
// Config, gross and price are the same three the internal bar shows,
// because they are facts about the house rather than about us. The
// buyer's own headline — cash flow, cash on cash, coverage — sits in
// the sheet below, where a buyer reading rather than scanning will
// find it.
//
// Selects rather than scrolls: the page carries one section at a time.
// ============================================================

const GREEN = "#00A651";

export default function SectionNav({
  sections = [],
  visible,
  active,
  onSelect,
  address,
  location,
  config,
  gross,
  price,
}) {
  const shown = sections.filter((s) => visible.has(s.id));
  if (!shown.length) return null;

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

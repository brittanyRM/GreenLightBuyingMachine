"use client";

// ============================================================
// The deal tab bar, shared.
//
// It lived inside the deal page, so /financing and anything else about
// a house rendered with no way back except the browser button. A page
// about a deal should carry the deal's navigation.
//
// On the deal page the tabs are local state and switch in place, so it
// takes an onSelect. Everywhere else they are links back to the deal
// with ?tab= — which is why the deal page reads that parameter.
// ============================================================

const GREEN = "#00A651";

export const DEAL_TABS = [
  { id: "sketch", label: "Sketch" },
  { id: "plan", label: "Plan" },
  { id: "proforma", label: "Pro forma" },
  { id: "flyer", label: "Flyer" },
  { id: "map", label: "Map" },
  { id: "research", label: "Research" },
  { id: "email", label: "Email" },
  { id: "record", label: "Record" },
  { id: "lender", label: "Lender pack" },
];

// Pages of their own rather than tabs of the deal page. Kept in the
// same bar because to anyone using it they are the same set.
export const DEAL_LINKS = [
  { id: "financing", label: "Financing", href: (slug) => `/financing/${slug}` },
];

export default function DealTabs({ slug, active, onSelect, address, price }) {
  const tabClass = (isActive) =>
    `px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
      isActive ? "text-white" : "text-neutral-500 hover:text-neutral-300"
    }`;
  const activeStyle = (isActive) =>
    isActive ? { borderBottom: `2px solid ${GREEN}` } : {};

  return (
    <div className="no-print bg-neutral-950">
      {address && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-3 px-5 pt-3">
          <a
            href={`/deals/${slug}`}
            className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-white"
          >
            ←
          </a>
          <span className="text-[15px] font-bold text-white">{address}</span>
          {price ? (
            <span className="text-[13px] tabular-nums text-neutral-400">{price}</span>
          ) : null}
        </div>
      )}

      <div className="mx-auto flex max-w-6xl flex-wrap items-center px-5">
        {DEAL_TABS.map((t) =>
          onSelect ? (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={tabClass(active === t.id)}
              style={activeStyle(active === t.id)}
            >
              {t.label}
            </button>
          ) : (
            <a
              key={t.id}
              href={`/deals/${slug}?tab=${t.id}`}
              className={tabClass(active === t.id)}
              style={activeStyle(active === t.id)}
            >
              {t.label}
            </a>
          )
        )}

        <span className="mx-2 h-4 w-px bg-neutral-700" />

        {DEAL_LINKS.map((t) => (
          <a
            key={t.id}
            href={t.href(slug)}
            className={tabClass(active === t.id)}
            style={activeStyle(active === t.id)}
          >
            {t.label}
          </a>
        ))}

        {/* Inline, not pushed right. ml-auto threw it to the far edge
            of a wide screen, miles from the tabs it belongs with — the
            deal page keeps it in the run and these two bars should
            read the same. */}
        <a
          href="/buyer-calculator.html"
          target="_blank"
          rel="noopener"
          className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
        >
          Calculator
        </a>
      </div>
    </div>
  );
}

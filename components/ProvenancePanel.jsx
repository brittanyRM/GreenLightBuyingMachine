"use client";

// ============================================================
// Where each number came from.
//
// The sheet already links the source documents, but a buyer reading
// "$220 per square foot" and wanting to check it had to open the comps
// package and work out which rows it was derived from. This names the
// origin of each headline figure next to the figure itself — the
// record, a third party, or a Green Light assumption.
//
// The distinction that matters is the last one. A ZIP occupancy rate
// published by PadSplit and an occupancy rate Green Light underwrites
// to are both defensible, and presenting them as the same kind of
// thing is what turns a projection into a claim. Every row here says
// which it is.
// ============================================================

const GREEN = "#00A651";

const SOURCE_STYLE = {
  record: { label: "Deal record", colour: "#1B2A20", bg: "#F2F5F1" },
  third_party: { label: "Third party", colour: "#1D4ED8", bg: "#EFF4FF" },
  assumption: { label: "Our assumption", colour: "#8A6D1F", bg: "#FCFAF1" },
  derived: { label: "Calculated", colour: "#4A5A50", bg: "#F7F8F7" },
};

function Tag({ kind }) {
  const s = SOURCE_STYLE[kind] || SOURCE_STYLE.derived;
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ color: s.colour, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

const fmtDate = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString();
};

export default function ProvenancePanel({
  deal,
  market,
  comps = [],
  rooms = [],
  sharedRate,
  ensuiteRate,
  occupancyPct,
  pricePerSqft,
  sqft,
}) {
  const rows = [];

  // ---- price -------------------------------------------------------
  if (deal?.list_price) {
    rows.push({
      figure: "Asking price",
      value: `$${Number(deal.list_price).toLocaleString()}`,
      kind: "record",
      note: "Set on the deal record.",
    });
  }

  // ---- square footage ---------------------------------------------
  // Which of the four columns actually won, named rather than implied.
  const sqftSource = deal?.finished_sqft
    ? ["Measured on completion", "record"]
    : deal?.post_reno_sqft
    ? ["Marketed area after renovation, not yet measured", "assumption"]
    : deal?.living_area_sqft
    ? ["Assessor living area, before any conversion", "third_party"]
    : null;
  if (sqft && sqftSource) {
    rows.push({
      figure: "Square feet",
      value: Number(sqft).toLocaleString(),
      kind: sqftSource[1],
      note: sqftSource[0],
    });
  }

  // ---- room counts -------------------------------------------------
  const realRooms = rooms.length;
  rows.push({
    figure: "Bedrooms",
    value: deal?.target_bedrooms ?? deal?.bedrooms ?? "—",
    kind: "record",
    note: realRooms
      ? `${realRooms} rooms entered individually on the record.`
      : "From the deal record. Individual rooms not yet entered.",
  });

  // ---- room rates --------------------------------------------------
  const rateSeeded = deal?.assumption_overrides?.rate_source === "padsplit_market_seed";
  const rateSeedDate = deal?.assumption_overrides?.rate_seeded_at;
  if (sharedRate) {
    rows.push({
      figure: "Shared room rate",
      value: `$${sharedRate}/week`,
      kind: deal?.shared_weekly_rate ? "record" : "third_party",
      note: deal?.shared_weekly_rate
        ? rateSeeded
          ? `On the record. Seeded from the ZIP ${
              deal.zip || ""
            } market rate${rateSeedDate ? ` on ${rateSeedDate}` : ""}.`
          : "Set on the deal record for this house."
        : `No rate on the record, so the ZIP ${deal?.zip || ""} average is being used.`,
    });
  }
  if (ensuiteRate) {
    rows.push({
      figure: "Ensuite room rate",
      value: `$${ensuiteRate}/week`,
      kind: deal?.ensuite_weekly_rate ? "record" : "third_party",
      note: deal?.ensuite_weekly_rate
        ? "Set on the deal record for this house."
        : `No rate on the record, so the ZIP ${deal?.zip || ""} average is being used.`,
    });
  }

  // ---- occupancy ---------------------------------------------------
  const zipOcc = Number(market?.avg_occupancy) || null;
  if (occupancyPct) {
    const modelled = Math.round(occupancyPct * 100);
    const zip = zipOcc ? Math.round(zipOcc * 100) : null;
    rows.push({
      figure: "Occupancy",
      value: `${modelled}%`,
      kind: "assumption",
      note:
        `Green Light's stabilised portfolio average.` +
        (zip !== null
          ? ` PadSplit reports ${zip}% for ZIP ${deal?.zip || ""}${
              zip < modelled ? " — lower than modelled here" : ""
            }.`
          : ""),
    });
  }
  if (zipOcc) {
    rows.push({
      figure: `ZIP ${deal?.zip || ""} occupancy`,
      value: `${Math.round(zipOcc * 100)}%`,
      kind: "third_party",
      note: "PadSplit Market Insights, as last recorded.",
    });
  }

  // ---- comps -------------------------------------------------------
  if (comps.length) {
    const sources = [...new Set(comps.map((c) => c.source).filter(Boolean))];
    const observed = comps.map((c) => c.observed_on).filter(Boolean).sort();
    const sold = comps.map((c) => c.sold_date).filter(Boolean).sort();
    const closed = comps.filter((c) => c.comp_status === "closed");
    const withSqft = comps.filter((c) => c.approx_sqft);

    rows.push({
      figure: "Comparable sales",
      value: `${comps.length} (${closed.length} closed)`,
      kind: "third_party",
      note:
        (sources.length ? sources.join("; ") : "Source not recorded on these rows") +
        (observed.length
          ? `. Pulled ${fmtDate(observed[observed.length - 1]) || observed[observed.length - 1]}`
          : "") +
        (sold.length
          ? `. Sales from ${fmtDate(sold[0])} to ${fmtDate(sold[sold.length - 1])}`
          : "") +
        ".",
    });

    if (pricePerSqft) {
      rows.push({
        figure: "Price per square foot",
        value: `$${Math.round(pricePerSqft)}`,
        kind: "derived",
        note:
          `Asking price divided by square feet.` +
          (withSqft.length < comps.length
            ? ` ${comps.length - withSqft.length} of ${comps.length} comps have no area recorded, so the comparison against them is incomplete.`
            : ""),
      });
    }
  }

  if (!rows.length) return null;

  return (
    <div className="print-section px-8 pb-4">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-500">
        Where these numbers come from
      </div>
      <p className="mb-3 max-w-3xl text-[11.5px] leading-snug text-neutral-600">
        Every figure on this sheet is one of three things: something recorded
        about the house, something a third party published, or something Green
        Light assumes. They are not equally certain, so they are labelled.
      </p>

      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.figure}
                className={`print-keep align-top ${
                  i % 2 ? "bg-neutral-50" : "bg-white"
                }`}
              >
                <td className="w-[9.5rem] px-3 py-2 text-[11.5px] font-semibold text-neutral-900">
                  {r.figure}
                </td>
                <td className="w-[7rem] px-3 py-2 text-[12.5px] font-bold tabular-nums text-neutral-900">
                  {r.value}
                </td>
                <td className="w-[7rem] px-3 py-2">
                  <Tag kind={r.kind} />
                </td>
                <td className="px-3 py-2 text-[11px] leading-snug text-neutral-600">
                  {r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
        Anything marked as our assumption is a projection, not a result. The
        documents below are the sources themselves &mdash; we&rsquo;d rather you
        checked them than took our word.
      </p>
    </div>
  );
}

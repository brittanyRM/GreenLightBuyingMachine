// ============================================================
// Green Light Buying Machine — buyer deal email
//
// Every number comes from computeProForma, so the email can't
// disagree with the pro forma or the flyer.
// ============================================================

import { usd, num, resolveRooms, roomMix, roomRate } from "./proforma";

function longDate(d) {
  if (!d) return null;
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

function rateGroups(rooms, market, overrides) {
  const groups = {};
  rooms
    /* record-resolved upstream */
    .forEach((r) => {
      const rate = roomRate(r, market, overrides);
      const key = `${r.room_type}-${rate}`;
      groups[key] = groups[key] || { type: r.room_type, rate, count: 0 };
      groups[key].count += 1;
    });
  return Object.values(groups).sort(
    (a, b) => b.rate - a.rate || b.count - a.count
  );
}

// ============================================================
// buildDealEmail
//   tone: 'standard' | 'numbers_first' | 'short'
// ============================================================
export function buildDealEmail({
  deal,
  rooms,
  market,
  proforma,
  contactName = "there",
  tone = "standard",
  senderName = "",
  overrides = {},
}) {
  const mix = roomMix(rooms, deal);
  const groups = rateGroups(resolveRooms(rooms, deal), market, overrides);
  const sqft = deal.post_reno_sqft || deal.living_area_sqft;
  const ready = longDate(deal.disposition_coe) || longDate(deal.close_of_escrow);
  const price = proforma.price;
  const config = `${mix.bedrooms} bed / ${deal.bathrooms} bath`;

  const address = `${deal.address_line}, ${deal.city}, ${deal.state} ${deal.zip}`;

  const rentLines = groups.map((g) => {
    const monthly = (g.count * g.rate * 52) / 12;
    const annual = g.count * g.rate * 52;
    const label =
      g.type === "ensuite"
        ? `${g.count} en suite${g.count > 1 ? "s" : ""}`
        : `${g.count} bedroom${g.count > 1 ? "s" : ""}`;
    return `- ${label} @ ${usd(g.rate)}/week — ${usd(monthly)}/month, ${usd(annual)}/year`;
  });

  const totalLine = `- Total — ${usd(proforma.grossMonthly)}/month, ${usd(
    proforma.grossAnnual
  )}/year`;

  const subject = {
    standard: `New Deal — ${deal.address_line}, ${deal.city} | ${config} PadSplit`,
    numbers_first: `${config} PadSplit — ${usd(price)}, ${usd(
      proforma.grossAnnual
    )} gross | ${deal.address_line}`,
    short: `Next deal — ${deal.address_line} | ${mix.bedrooms}/${deal.bathrooms} PadSplit, ${usd(price)}`,
  }[tone];

  const compLine = proforma.compStats
    ? `Closed comps in the area run ${usd(proforma.compStats.low)} to ${usd(
        proforma.compStats.high
      )} with an average of ${usd(proforma.compStats.avg)}${
        proforma.compStats.belowLow
          ? ", so you're buying below every closed comp in the set"
          : ", so you're buying under the market average"
      } before we add a bedroom count none of those comps have.`
    : null;

  const marketLine = market
    ? `PadSplit shows ${num(market.active_units)} active units in ${
        deal.zip
      } at ${Math.round(market.avg_occupancy * 100)}% average occupancy, ${
        market.days_to_first_booking
      } days to first booking${
        market.upcoming_units === 0 ? ", and no upcoming supply" : ""
      }.`
    : null;

  const sig = senderName ? `\n\nThank you,\n${senderName}` : "\n\nThank you,";

  const bodies = {
    standard: [
      `${contactName},`,
      ``,
      `Here is another deal for you.`,
      ``,
      address,
      ``,
      `After remodeling this home will be ${mix.bedrooms} bedrooms with ${
        mix.ensuiteCount
      } en suite${mix.ensuiteCount === 1 ? "" : "s"} and ${
        deal.bathrooms
      } total baths — a ${config} PadSplit.${
        sqft
          ? ` Total square footage after the remodel will be right around ${num(sqft)}.`
          : ""
      }${ready ? ` We anticipate it being ready to purchase on ${ready}.` : ""}`,
      ``,
      `This will be our normal top-end remodel with all the bells and whistles.`,
      ``,
      `Projected gross rents:`,
      ``,
      ...rentLines,
      totalLine,
      ``,
      `Purchase price is ${usd(price)}.`,
      ``,
      `I've attached comparables, the assessor record, PadSplit market data for ${deal.zip}, and the floor plan for your review.`,
      ``,
      `Please let me know asap so I can go to work and lock it up. Happy to jump on a call if you want to walk through it.`,
    ].join("\n") + sig,

    numbers_first: [
      `${contactName},`,
      ``,
      `Another one for you — ${usd(price)} purchase, ${usd(
        proforma.grossAnnual
      )} in projected annual gross rents.`,
      ``,
      address,
      ``,
      `After remodel: ${mix.bedrooms} bedrooms, ${mix.ensuiteCount} en suite${
        mix.ensuiteCount === 1 ? "" : "s"
      }, ${deal.bathrooms} total baths.${
        sqft ? ` Approximately ${num(sqft)} square feet.` : ""
      }${ready ? ` Ready to purchase ${ready}.` : ""}`,
      ``,
      `Rent breakdown:`,
      ``,
      ...rentLines,
      totalLine,
      ``,
      [compLine, marketLine].filter(Boolean).join(" "),
      ``,
      `This is our normal top-end remodel with all the bells and whistles. Comparables, assessor record, market data, and floor plan are attached.`,
      ``,
      `Let me know asap so I can go to work and lock it up — or grab a call if you'd rather talk it through.`,
    ].join("\n") + sig,

    short: [
      `${contactName},`,
      ``,
      `Next one is ready for you.`,
      ``,
      `${address} — ${config} with ${mix.ensuiteCount} en suite${
        mix.ensuiteCount === 1 ? "" : "s"
      }${sqft ? `, ~${num(sqft)} sq ft after remodel` : ""}.${
        ready ? ` Available to purchase ${ready}.` : ""
      }`,
      ``,
      `${usd(price)} purchase. ${usd(proforma.grossMonthly)}/month gross, ${usd(
        proforma.grossAnnual
      )}/year — ${groups
        .map(
          (g) =>
            `${g.count} ${g.type === "ensuite" ? "en suite" : "bedroom"}${
              g.count > 1 ? "s" : ""
            } at ${usd(g.rate)}/week`
        )
        .join(", ")}.`,
      ``,
      `Same top-end remodel we always do. Comps, market data, and floor plan attached.`,
      ``,
      `Let me know asap and I'll lock it up. Call if you want to talk it through.`,
    ].join("\n") + sig,
  };

  return { subject, body: bodies[tone] };
}

// Warnings surfaced next to the compose button, so nothing goes out wrong.
export function emailPreflight({ deal, rooms, market, proforma }) {
  const warnings = [];
  const mix = roomMix(rooms, deal);

  if (!rooms.length) warnings.push("No rooms drawn yet — rent math will be zero.");
  if (mix.bedrooms !== deal.bedrooms)
    warnings.push(
      `Layout has ${mix.bedrooms} bedrooms but the deal record says ${deal.bedrooms}.`
    );
  if (!market) warnings.push(`No PadSplit market data saved for ${deal.zip}.`);
  if (!deal.disposition_coe && !deal.close_of_escrow)
    warnings.push("No delivery date set — the email will omit it.");
  if (!proforma.compStats) warnings.push("No closed comps loaded.");
  if (!deal.post_reno_sqft)
    warnings.push("Post-remodel square footage is blank.");
  if (
    deal.living_area_sqft &&
    deal.post_reno_sqft &&
    deal.added_sqft &&
    deal.post_reno_sqft !== deal.living_area_sqft + deal.added_sqft
  )
    warnings.push(
      `Marketed sq ft (${num(deal.post_reno_sqft)}) doesn't equal assessor living area + added (${num(
        deal.living_area_sqft + deal.added_sqft
      )}). Confirm before sending.`
    );

  return warnings;
}

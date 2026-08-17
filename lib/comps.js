// ============================================================
// Comp parsing, shared.
//
// Lifted out of DealForm so a buyer pasting their own flexmls export
// gets the same treatment we give ours — one parser, one set of
// assumptions about what a row means.
//
// The format is whatever flexmls puts on the clipboard: an address
// followed by trailing numbers. Status is inferred from the row text.
// ============================================================

export function parseComps(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tokens = line.match(/[\d,]+\.?\d*/g) || [];
      const nums = tokens.slice(-4).map((n) => parseFloat(n.replace(/,/g, "")));

      const address = line
        .replace(/(?:[\d,]+\.?\d*[\s$]+){3}\$?[\d,]+\.?\d*\s*$/, "")
        .replace(/[,\s]+$/, "")
        .trim();

      const status = /pend/i.test(line)
        ? "pending"
        : /activ/i.test(line)
        ? "active"
        : /ucb|backup/i.test(line)
        ? "ucb"
        : "closed";

      const [list, sqft, psf, sold] = nums;

      return {
        address: address || line,
        comp_status: status,
        list_price: list ?? null,
        approx_sqft: sqft ?? null,
        price_per_sqft: psf ?? (sold && sqft ? +(sold / sqft).toFixed(2) : null),
        sold_price: sold ?? null,
      };
    })
    .filter((c) => c.sold_price || c.list_price);
}

// Closed sales only, since an active listing is an asking price and
// tells you what a seller hopes for rather than what a buyer paid.
export function compStats(comps = []) {
  const closed = comps.filter(
    (c) => c.comp_status === "closed" && Number(c.sold_price) > 0
  );
  if (!closed.length) return null;

  const prices = closed.map((c) => Number(c.sold_price)).sort((a, b) => a - b);
  const psf = closed
    .map((c) => Number(c.price_per_sqft))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const median = (arr) =>
    !arr.length
      ? null
      : arr.length % 2
      ? arr[(arr.length - 1) / 2]
      : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

  return {
    count: closed.length,
    low: prices[0],
    high: prices[prices.length - 1],
    median: median(prices),
    average: prices.reduce((a, b) => a + b, 0) / prices.length,
    medianPsf: median(psf),
  };
}

// How the subject sits against a set of comps. Returned as a shape the
// UI can render without recomputing, so the buyer's own comps and ours
// are compared the same way.
export function compareToSubject(comps, subject) {
  const stats = compStats(comps);
  if (!stats || !subject?.price) return null;

  const subjectPsf = subject.sqft ? subject.price / subject.sqft : null;

  return {
    ...stats,
    subjectPsf,
    psfDelta:
      subjectPsf && stats.medianPsf ? subjectPsf / stats.medianPsf - 1 : null,
    priceDelta: stats.median ? subject.price / stats.median - 1 : null,
    aboveHigh: subject.price > stats.high,
    belowLow: subject.price < stats.low,
  };
}

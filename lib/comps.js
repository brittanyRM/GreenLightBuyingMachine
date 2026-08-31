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

// ============================================================
// Structured comps, straight from extraction.
//
// The intake form used to flatten these back into a line of text and
// run parseComps over it. That parser reads the last few numbers on a
// line, so everything not in the join was lost — sold_date, MLS
// number, days on market — and a comp missing one field shifted the
// rest a column left. A model had already read the table correctly and
// the answer was being degraded on the way to the database.
//
// This takes the rows as they came and makes them safe to insert:
// known columns only, numbers as numbers, and a status the table
// recognises.
// ============================================================

const COMP_COLUMNS = [
  "mls_number",
  "address",
  "comp_status",
  "list_price",
  "sold_price",
  "sold_date",
  "approx_sqft",
  "price_per_sqft",
  "adom",
  "cdom",
  "bedrooms",
  "bathrooms",
  "year_built",
  "notes",
];

const STATUSES = ["closed", "pending", "active", "coming_soon", "ucb", "expired", "cancelled"];

const num = (v) => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isoDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, d, y] = m;
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

export function normalizeExtractedComps(comps = []) {
  return comps
    .map((raw) => {
      const c = {};
      for (const k of COMP_COLUMNS) if (raw[k] != null) c[k] = raw[k];

      for (const k of ["list_price", "sold_price", "approx_sqft", "price_per_sqft", "bathrooms"])
        if (k in c) c[k] = num(c[k]);
      for (const k of ["adom", "cdom", "bedrooms", "year_built"])
        if (k in c) {
          const n = num(c[k]);
          c[k] = n == null ? null : Math.round(n);
        }

      c.sold_date = isoDate(raw.sold_date);
      c.mls_number = raw.mls_number ? String(raw.mls_number).replace(/\D/g, "") || null : null;
      c.address = raw.address ? String(raw.address).trim() : null;

      // comp_status is NOT NULL. An unrecognised value would fail the
      // whole insert, and a row that reached this point is a real sale
      // whatever the sheet called it.
      const st = String(raw.comp_status || "").toLowerCase().replace(/[\s-]+/g, "_");
      c.comp_status = STATUSES.includes(st) ? st : "closed";

      // Derived, not observed. If the sheet's figure disagrees with
      // price over area by more than a rounding, drop it rather than
      // storing a number that contradicts its own row.
      const price = c.sold_price ?? c.list_price;
      if (c.price_per_sqft && price && c.approx_sqft) {
        const implied = price / c.approx_sqft;
        if (Math.abs(implied - c.price_per_sqft) / c.price_per_sqft > 0.02) c.price_per_sqft = null;
      }
      if (!c.price_per_sqft && price && c.approx_sqft)
        c.price_per_sqft = +(price / c.approx_sqft).toFixed(2);

      return c;
    })
    .filter((c) => c.address && (c.sold_price || c.list_price));
}

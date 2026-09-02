// ============================================================
// flexmls export parsing.
//
// lib/comps.js has parseComps, which takes the last four numbers on a
// line. That works for the short clipboard format — address then a few
// figures — and fails on the report flexmls actually prints, where a
// row carries an MLS number, list price, two day counts, square feet,
// price per foot, a sold date and two more prices. Fed one of those,
// it read the year as the square footage and the sold price as the
// price per foot, and called every row closed.
//
// This reads the report format positionally, which is safe because it
// is a fixed-column report rather than free text. Rows it cannot read
// are returned as warnings rather than dropped: a comp that silently
// vanishes is worse than one that asks to be looked at.
// ============================================================

const MONEY = /^\$?[\d,]+(?:\.\d+)?$/;

const toNum = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// flexmls prints US dates. Stored as ISO because Postgres wants a date
// and "07/10/2026" is ambiguous the moment anyone opens it elsewhere.
const toIsoDate = (v) => {
  const m = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(iso + "T00:00:00Z");
  return Number.isNaN(parsed.getTime()) ? null : iso;
};

// The section headings flexmls prints above each block. Status comes
// from the heading, not from guessing at the row: an active listing
// and a closed sale have the same shape, and the difference between an
// asking price and a paid price is the whole point of a comp.
const SECTION_STATUS = [
  [/summary of closed/i, "closed"],
  [/summary of pending/i, "pending"],
  [/summary of active/i, "active"],
  [/summary of coming soon/i, "coming_soon"],
  [/summary of (?:ucb|under contract)/i, "ucb"],
  [/summary of expired/i, "expired"],
  [/summary of cancell?ed/i, "cancelled"],
];

const SKIP = [
  /^mls\s*#/i,
  /^low,\s*average/i,
  /^overall market analysis/i,
  /price per/i,
  /^status\b/i,
  /^\s*(low|average|median|high|overall)\b/i,
  /^https?:/i,
  /flexmls web/i,
  /^page \d+/i,
  /^\d{1,2}\/\d{1,2}\/\d{2},/,
];

// Scanned exports come back through OCR, which introduces artefacts a
// clean copy-paste never has: table borders read as pipes and
// backslashes, and an address wrapped in its cell arriving as a second
// line with no MLS number in front of it. Cleaned before parsing so
// the parser itself stays a reader of one format rather than a
// collection of special cases.
export function normalizeOcrText(text) {
  const cleaned = String(text || "")
    .replace(/[|\\]/g, " ")
    .replace(/[—–]{2,}/g, "")
    .replace(/[ \t]+/g, " ");

  const out = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // A short fragment with no MLS number that looks like the tail of
    // an address — "Glendale AZ", "AZ" — belongs to the row above.
    const isTail =
      !/^\d{6,8}\s/.test(line) &&
      line.length <= 30 &&
      /^[A-Za-z][A-Za-z .'-]*(?:\s+[A-Z]{2})?$/.test(line) &&
      out.length &&
      /^\d{6,8}\s/.test(out[out.length - 1]);
    if (isTail) out[out.length - 1] += " " + line;
    else out.push(line);
  }
  return out.join("\n");
}

export function parseFlexmlsExport(text) {
  const lines = String(text || "").split("\n");
  const comps = [];
  const warnings = [];
  let status = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const heading = SECTION_STATUS.find(([re]) => re.test(line));
    if (heading) {
      status = heading[1];
      continue;
    }
    if (SKIP.some((re) => re.test(line))) continue;

    // Every data row opens with a 6-8 digit MLS number. Anything else
    // is a header, a footer or a page break.
    const m = line.match(/^(\d{6,8})\s+(.*)$/);
    if (!m) continue;

    const [, mls, rest] = m;
    if (!status) {
      warnings.push({ line, reason: "row appeared before any section heading" });
      continue;
    }

    // Split the trailing figures off the address. The address is
    // everything up to the first money value, which is the list price.
    const tokens = rest.split(/\s+/);
    const firstMoney = tokens.findIndex((t) => MONEY.test(t) && /[$,]/.test(t));
    if (firstMoney < 1) {
      warnings.push({ line, reason: "could not find the list price" });
      continue;
    }

    const address = tokens
      .slice(0, firstMoney)
      .join(" ")
      .replace(/[,\s]+$/, "")
      .trim();
    const tail = tokens.slice(firstMoney);

    // Positional read of the tail. Coming-soon rows carry no day
    // counts and pending rows no sold date, so each field is taken by
    // shape rather than by index.
    const dates = tail.filter((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t));
    const soldDate = dates.length ? toIsoDate(dates[0]) : null;

    const plainInts = tail
      .slice(1)
      .filter((t) => /^\d{1,3}$/.test(t))
      .map(Number);
    const adom = plainInts.length ? plainInts[0] : null;
    const cdom = plainInts.length > 1 ? plainInts[1] : adom;

    // Square feet is the one comma-grouped number that is not money.
    const sqft = toNum(
      tail.find((t) => /^\d{1,2},\d{3}$/.test(t) && !t.startsWith("$"))
    );

    // Price per foot is the only money value with cents.
    const ppsf = toNum(tail.find((t) => /^\$\d{1,4}\.\d{2}$/.test(t)));

    // Money values in order. The closed report prints list, sold,
    // adjusted; the pending and active reports print ORIGINAL list,
    // current list, adjusted. Taking the first as "the list price"
    // therefore reads the original asking price on a listing that has
    // since been reduced — which is how three rows came through with a
    // price per foot that disagreed with price divided by area.
    const monies = tail.filter((t) => /^\$[\d,]+$/.test(t)).map(toNum);
    const soldPrice = status === "closed" && monies.length > 1 ? monies[1] : null;
    const currentList =
      status === "closed"
        ? monies[0] ?? null
        : monies.length > 1
        ? monies[1]
        : monies[0] ?? null;
    const originalList = monies.length > 1 ? monies[0] : null;
    const reduced =
      status !== "closed" && originalList && currentList && originalList !== currentList
        ? `Originally listed ${originalList.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })}`
        : null;

    if (!address) {
      warnings.push({ line, reason: "no address" });
      continue;
    }

    comps.push({
      mls_number: mls,
      address,
      comp_status: status,
      list_price: currentList,
      sold_price: soldPrice,
      sold_date: soldDate,
      approx_sqft: sqft,
      price_per_sqft:
        ppsf ?? (soldPrice && sqft ? +(soldPrice / sqft).toFixed(2) : null),
      adom,
      cdom,
      // A listing that has come down in price is telling you something
      // an asking price alone does not.
      notes: reduced,
    });
  }

  return { comps, warnings };
}

// Rows that would land in the database as something misleading. These
// are surfaced next to the preview rather than blocking the import —
// a comp with no square footage is still a sale that happened.
export function auditComps(comps = []) {
  const notes = [];
  for (const c of comps) {
    if (c.comp_status === "closed" && !c.sold_price)
      notes.push(`${c.address}: closed with no sold price`);
    if (!c.approx_sqft) notes.push(`${c.address}: no square footage`);
    if (c.approx_sqft && c.price_per_sqft) {
      const implied = (c.sold_price || c.list_price) / c.approx_sqft;
      if (implied && Math.abs(implied - c.price_per_sqft) / c.price_per_sqft > 0.02)
        notes.push(
          `${c.address}: $/sqft of ${c.price_per_sqft} does not match ` +
            `${Math.round(implied)} implied by price and area`
        );
    }
    if (c.sold_date) {
      const age = (Date.now() - new Date(c.sold_date).getTime()) / 86400000;
      if (age > 365) notes.push(`${c.address}: sold ${Math.round(age / 30)} months ago`);
      if (age < 0) notes.push(`${c.address}: sold date is in the future`);
    }
  }
  return notes;
}

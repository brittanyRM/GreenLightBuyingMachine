// ============================================================
// Buy box matching.
//
// Pure functions, no imports. Used by the portal to lead with what
// fits a buyer, and by the admin side to see who a new deal suits.
//
// Every criterion is optional. Null, undefined or an empty array
// means no constraint — a buy box with nothing set matches
// everything, which is right for a buyer who hasn't told us yet.
//
// Returns reasons rather than a bare boolean, because "close but the
// price is $40K over" is a conversation and "no match" isn't.
// ============================================================

const has = (v) => v !== null && v !== undefined && v !== "";
const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * `metrics` is keyed by scenario: { bear: {dscr, capRate}, base: {...},
 * bull: {...} }. Yield floors are tested against box.scenario — a
 * buyer underwriting to the downside sets bear, and the same 1.25
 * floor becomes a much harder bar.
 *
 * @returns {{ matches: boolean, failures: string[], nearMisses: string[], checked: number, scenario: string }}
 * A near miss is a numeric criterion missed by 10% or less — worth a
 * conversation even though it doesn't strictly qualify.
 */
export function matchBuyBox(deal = {}, box = null, metrics = null) {
  const scenario = ["glbm", "bear", "base", "bull"].includes(box?.scenario)
    ? box.scenario
    : "base";

  if (!box || box.active === false) {
    return { matches: true, failures: [], nearMisses: [], checked: 0, scenario };
  }

  const failures = [];
  const nearMisses = [];
  let checked = 0;

  const price = Number(deal.list_price) || 0;
  const beds = Number(deal.bedrooms) || 0;
  const baths = Number(deal.bathrooms) || 0;
  const sqft = Number(deal.post_reno_sqft) || Number(deal.living_area_sqft) || 0;
  const year = Number(deal.year_built) || 0;

  // Numeric bound with a near-miss band. `over` flips the direction.
  const bound = (value, limit, label, over) => {
    if (!has(limit) || !value) return;
    checked++;
    const fails = over ? value > Number(limit) : value < Number(limit);
    if (!fails) return;
    const drift = Math.abs(value - Number(limit)) / Number(limit);
    (drift <= 0.1 ? nearMisses : failures).push(label);
  };

  bound(price, box.max_price, `Over max price`, true);
  bound(price, box.min_price, `Under min price`, false);
  bound(beds, box.min_bedrooms, `Fewer than ${box.min_bedrooms} bedrooms`, false);
  bound(baths, box.min_bathrooms, `Fewer than ${box.min_bathrooms} bathrooms`, false);
  bound(sqft, box.min_sqft, `Under ${box.min_sqft} sq ft`, false);
  bound(year, box.min_year_built, `Built before ${box.min_year_built}`, false);
  bound(year, box.max_year_built, `Built after ${box.max_year_built}`, true);

  // Yield floors are the only criteria that depend on the case.
  const m = metrics ? metrics[scenario] || metrics : null;
  if (m) {
    const caseLabel = scenario === "base" ? "" : ` in the ${scenario} case`;
    bound(m.dscr, box.min_dscr, `DSCR under ${box.min_dscr}${caseLabel}`, false);
    bound(m.capRate, box.min_cap_rate, `Cap rate under ${box.min_cap_rate}%${caseLabel}`, false);
  }

  // Geography is a hard filter — a buyer who named three cities means
  // those three cities, and being one town over isn't a near miss.
  const cities = list(box.cities).map(norm);
  if (cities.length) {
    checked++;
    if (!cities.includes(norm(deal.city))) failures.push(`Outside target cities`);
  }

  const zips = list(box.zips).map(norm);
  if (zips.length) {
    checked++;
    if (!zips.includes(norm(deal.zip))) failures.push(`Outside target ZIPs`);
  }

  const states = list(box.states).map(norm);
  if (states.length) {
    checked++;
    if (!states.includes(norm(deal.state))) failures.push(`Outside target states`);
  }

  return {
    matches: failures.length === 0,
    failures,
    nearMisses,
    checked,
    scenario,
  };
}

/** Sorts matches first, then near misses, then the rest. */
export function rankByBuyBox(deals = [], box = null) {
  return deals
    .map((d) => ({ deal: d, fit: matchBuyBox(d, box) }))
    .sort((a, b) => {
      const score = (x) =>
        x.fit.matches ? (x.fit.nearMisses.length ? 1 : 0) : 2;
      return score(a) - score(b);
    });
}

/** Human summary for the admin list. */
export function describeBuyBox(box) {
  if (!box) return "No buy box set";
  const bits = [];

  if (has(box.min_price) || has(box.max_price)) {
    const fmt = (n) => `$${Math.round(Number(n) / 1000)}K`;
    if (has(box.min_price) && has(box.max_price))
      bits.push(`${fmt(box.min_price)}–${fmt(box.max_price)}`);
    else if (has(box.max_price)) bits.push(`up to ${fmt(box.max_price)}`);
    else bits.push(`${fmt(box.min_price)}+`);
  }

  if (has(box.min_bedrooms)) bits.push(`${box.min_bedrooms}+ bed`);
  if (has(box.min_bathrooms)) bits.push(`${box.min_bathrooms}+ bath`);
  if (has(box.min_sqft)) bits.push(`${Number(box.min_sqft).toLocaleString()}+ sq ft`);

  const geo = [...list(box.cities), ...list(box.zips), ...list(box.states)];
  if (geo.length) bits.push(geo.slice(0, 4).join(", ") + (geo.length > 4 ? "…" : ""));

  if (has(box.min_dscr) || has(box.min_cap_rate)) {
    const suffix =
      box.scenario && box.scenario !== "base" ? ` (${box.scenario} case)` : "";
    if (has(box.min_dscr)) bits.push(`DSCR ${box.min_dscr}+${suffix}`);
    if (has(box.min_cap_rate)) bits.push(`Cap ${box.min_cap_rate}%+${suffix}`);
  }

  return bits.length ? bits.join(" · ") : "No criteria set";
}

/** Comma or newline separated text into a clean array. */
export function parseList(text) {
  return String(text || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

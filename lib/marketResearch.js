// ============================================================
// City market research, as a function.
//
// It lived inside the team-only API route, so the only way to run it
// was to be a team member. A buyer looking at a house in a city we
// have not researched saw an empty section and nothing else — and the
// research is about the city, not about us, so there is no reason they
// should not be able to fill it. Whoever runs it, the result lands in
// the same table and shows on the deal.
//
// Extracted rather than copied. Two implementations of a prompt drift,
// and the one that drifts is always the one nobody is reading.
// ============================================================

import { admin } from "./supabaseAdmin";

const MODEL = "claude-sonnet-5";

const PROMPT = `You are researching a US city as a market for co-living rental property, where a house is let room by room.

Return ONLY a JSON object in this shape. No preamble, no markdown fences.

{
  "population": null,
  "population_prior": null,
  "population_year": null,
  "households": null,
  "median_household_income": null,
  "median_age": null,
  "renter_share": null,
  "median_rent_1br": null,
  "median_rent_2br": null,
  "median_rent_3br": null,
  "rent_yoy": null,
  "median_home_value": null,
  "home_value_yoy": null,
  "major_employers": [],
  "as_of": "YYYY-MM-DD",
  "source": "the sources actually used, named",
  "notes": "two or three sentences a buyer would want: where the jobs are, whether the population is growing or shrinking, what is driving rental demand",
  "confidence": {
    "population": "high | medium | low",
    "income": "high | medium | low",
    "rents": "high | medium | low",
    "employers": "high | medium | low"
  },
  "figures": [
    { "field": "population", "value": null, "source": "where this specific number came from", "year": null }
  ]
}

Rules:
- Search for current figures. Do not answer from memory.
- renter_share and the yoy fields are decimal fractions, not percentages: 42% is 0.42, a 3.5% rise is 0.035.
- population_prior is the same measure one year earlier, so growth can be computed. If only a multi-year figure exists, leave both prior and year null rather than implying an annual rate.
- median_household_income and rents are for the city itself, not the metro, unless only metro data exists — say so in source if you substitute.
- major_employers: real named employers with a significant presence, largest first, up to eight. Hospitals, school districts, universities, distribution centres and large private employers all count. Do not list industries — "healthcare" is not an employer, "Banner Health" is.
- Every number in "figures" must name where it came from. A figure you cannot source, leave null.
- Never estimate, interpolate or round to make a set look complete. Null is a real answer and a wrong number is worse than a missing one.
- notes is for a buyer deciding whether people will rent rooms here. Employment concentration, a single dominant employer, a university, a growing or shrinking population — the things that make room demand durable or fragile.`;


export async function researchCity({ city, state, zip = null }) {
  if (!city || !state) throw new Error("A city and state are required.");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY isn't set.");

  const where = `${city}, ${state}${zip ? ` (ZIP ${zip})` : ""}`;

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [
          {
            role: "user",
            content: `Research ${where} as a co-living rental market. Population, households, income, renter share, rents, home values, and the named major employers.`,
          },
        ],
      }),
    });
  } catch (e) {
    throw new Error(`Couldn't reach the API: ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Research failed (${res.status}). ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  // Content comes back as a mix of text, tool calls and tool results.
  // Only the text blocks carry the answer, and the model may narrate
  // before it, so take the last block that parses as JSON rather than
  // assuming a position.
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The research came back in a form we couldn't read.");
  }

  // A percentage where a fraction belongs turns 42% renters into
  // 4,200%. Caught here rather than in the panel, which would render
  // it without complaint.
  // Number(null) is 0 and Number("") is 0, so a missing figure would
  // arrive as a real zero — "0% renters" rather than an empty cell.
  // Absent has to be checked before the value is coerced.
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // Magnitude, not sign: a rent fall of -2.4 is a percentage and needs
  // dividing, and testing n > 1.5 would have passed it through as
  // -240%.
  const frac = (v) => {
    const n = num(v);
    if (n === null) return null;
    return Math.abs(n) > 1.5 ? +(n / 100).toFixed(4) : +n.toFixed(4);
  };
  const int = (v) => {
    const n = num(v);
    return n === null ? null : Math.round(n);
  };
  const money = (v) => {
    const n = num(v);
    return n === null ? null : +n.toFixed(2);
  };

  const row = {
    city,
    state,
    zip: zip || null,
    population: int(parsed.population),
    population_prior: int(parsed.population_prior),
    population_year: int(parsed.population_year),
    households: int(parsed.households),
    median_household_income: money(parsed.median_household_income),
    median_age: num(parsed.median_age) === null ? null : +num(parsed.median_age).toFixed(1),
    renter_share: frac(parsed.renter_share),
    median_rent_1br: money(parsed.median_rent_1br),
    median_rent_2br: money(parsed.median_rent_2br),
    median_rent_3br: money(parsed.median_rent_3br),
    rent_yoy: frac(parsed.rent_yoy),
    median_home_value: money(parsed.median_home_value),
    home_value_yoy: frac(parsed.home_value_yoy),
    major_employers: Array.isArray(parsed.major_employers)
      ? parsed.major_employers.filter((e) => typeof e === "string" && e.trim()).slice(0, 8)
      : [],
    source: parsed.source || null,
    as_of: /^\d{4}-\d{2}-\d{2}$/.test(parsed.as_of || "") ? parsed.as_of : null,
    notes: parsed.notes || null,
    active: true,
  };

  // Things worth a second look before this goes in front of a buyer.
  const flags = [];
  if (row.population && row.population_prior) {
    const g = row.population / row.population_prior - 1;
    if (Math.abs(g) > 0.1)
      flags.push(
        `Population change of ${(g * 100).toFixed(1)}% in a year is unusual — check the two figures are the same measure.`
      );
  }
  if (row.renter_share && (row.renter_share < 0.05 || row.renter_share > 0.85))
    flags.push(`Renter share of ${(row.renter_share * 100).toFixed(0)}% is outside the usual range.`);
  if (row.median_rent_2br && row.median_rent_1br && row.median_rent_2br < row.median_rent_1br)
    flags.push("Two-bedroom rent is below one-bedroom — likely a mix-up.");
  if (!row.major_employers.length) flags.push("No employers found.");

  const missing = Object.entries(row)
    .filter(([k, v]) => v === null && !["zip", "as_of", "notes", "source"].includes(k))
    .map(([k]) => k);


  return {
    row,
    flags,
    missing,
    figures: parsed.figures || [],
    confidence: parsed.confidence || {},
    place: where,
  };
}

// The unique index is on lower(city), lower(state) and coalesce(zip,''),
// an expression index that upsert's onConflict cannot name — hence the
// explicit find-then-write.
export async function saveReport(row) {
  const { data: existing } = await admin()
    .from("market_reports")
    .select("id")
    .ilike("city", row.city)
    .ilike("state", row.state)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin().from("market_reports").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { updated: true };
  }
  const { error } = await admin().from("market_reports").insert(row);
  if (error) throw new Error(error.message);
  return { updated: false };
}

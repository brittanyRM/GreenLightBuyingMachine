import { admin } from "../../../lib/supabaseAdmin";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/extract-deal
//
// Takes the deal packet — assessor record, MLS comps, PadSplit
// market screenshot, marked-up sketch — and returns structured
// fields for the intake form.
//
// It extracts. It does not save. Everything lands in the form
// for review first, because a wrong square footage that reaches
// a buyer email is worse than one you had to type.
// ============================================================

const MODEL = "claude-sonnet-5";

const SCHEMA_PROMPT = `You are reading a real estate deal packet for a co-living / PadSplit acquisition.

Extract into JSON. Use null for anything not present — never guess, never infer a plausible value.

{
  "deal": {
    "address_line": "street address only",
    "city": null,
    "state": "two-letter",
    "zip": "five digits only, drop any +4 extension",
    "parcel_number": "assessor parcel number",
    "subdivision": null,
    "year_built": null,
    "lot_sqft": null,
    "lot_acres": null,
    "living_area_sqft": "assessor living area",
    "added_sqft": "added attached square footage",
    "post_reno_sqft": "marketed square footage after remodel, often handwritten",
    "construction_type": "e.g. 8\\" painted block / asphalt shingle",
    "zoning": "county and city zone codes",
    "school_district": null,
    "legal_class": null,
    "assessed_tax_amount": "most recent annual tax amount",
    "bathrooms": "bathroom count AFTER conversion if noted, else current",
    "purchase_price": "what the investor pays to acquire, if stated",
    "list_price": "turnkey price to the end buyer, if stated",
    "close_of_escrow": "acquisition COE, YYYY-MM-DD",
    "disposition_coe": "delivery date to buyer, YYYY-MM-DD"
  },
  "conversion": {
    "bedrooms_after": "bedroom count after conversion",
    "bathrooms_after": null,
    "ensuite_count": null,
    "shared_count": null,
    "note": "how it was written, e.g. '9/4 with 2 ensuites'"
  },
  "market": {
    "zip": null,
    "active_units": null,
    "upcoming_units": null,
    "shared_weekly": null,
    "private_weekly": null,
    "avg_occupancy": "decimal, so 74% becomes 0.74",
    "days_to_first_booking": null,
    "days_to_80_percent": null
  },
  "rents": {
    "ensuite_weekly": null,
    "shared_weekly": null,
    "gross_monthly": null,
    "gross_annual": null
  },
  "comps": [
    {
      "mls_number": "the MLS number, usually the leftmost column",
      "address": null,
      "comp_status": "closed | pending | active | ucb | ccbs",
      "list_price": null,
      "sold_price": null,
      "approx_sqft": null,
      "price_per_sqft": null,
      "sold_date": "YYYY-MM-DD",
      "adom": null,
      "cdom": null
    }
  ],
  "notes": ["anything handwritten or annotated, quoted as written"],
  "conflicts": ["any two figures in the packet that disagree, described plainly"]
}

Comps — the sale date matters more than anything derived:
- mls_number identifies the row. It is a 6-8 digit number in the first column. Read it digit by digit; it is how a re-import matches an existing comp rather than duplicating it, so a single wrong digit creates a comp that does not exist.
- sold_date is required on every closed comp. It is usually a column headed "Sold Date", "Close of Escrow", "COE" or "Closed". Read it even when it is abbreviated (3/14/26 is 2026-03-14).
- Never leave sold_date null on a closed sale. A comp without a date can't be weighted, and a stale sale is worse than no comp.
- price_per_sqft is derived, not observed. If it disagrees with sold_price divided by approx_sqft, report the sale price and the area and leave price_per_sqft null — the calculation is done later.
- Read across the row carefully. These tables are whitespace-aligned and the columns are easy to shift by one; sold_price is the large figure in the hundreds of thousands, approx_sqft is the four-digit one, price_per_sqft is the small one.

Important:
- Omit any top-level section entirely if the pages contain nothing for it. Reading only a comps sheet should return "comps" and little else — do not pad the other sections with nulls.
- Read handwriting. Deal packets are marked up by hand — closing dates, prices, room counts, and square footage are often written in pen and are the operative numbers.
- Work through every page. An assessor record, an MLS comps summary, a PadSplit market screenshot, and a marked-up sketch are usually all present, and each fills different fields.
- Only include comps that appear in a comps summary. Do not invent rows.
- If marketed square footage differs from assessor living area plus added area, put that in "conflicts". Do not reconcile it yourself.
- Occupancy as a decimal. Dates as YYYY-MM-DD. A handwritten "8/5" in a 2026 packet means 2026-08-05.

Be brief. Only the JSON, no restating of the schema, no commentary. Return the object and stop.`;

// Comp rows come back with the columns rotated when the source table
// is whitespace-separated rather than delimited: the address swallows
// the whole line and price, area and price-per-sq-ft each shift one
// place. The three numbers are self-checking — price = area × psf —
// so the right assignment can be found rather than trusted.
function repairComp(c) {
  const out = { ...c };

  // Numbers trailing the address belong in their own columns.
  if (typeof out.address === "string") {
    const m = out.address.match(/^(.*?)[\s,]+([\d,]+(?:\.\d+)?)[\s]+([\d,]+(?:\.\d+)?)[\s]+([\d,]+(?:\.\d+)?)\s*$/);
    if (m) {
      out.address = m[1].trim();
      const nums = [m[2], m[3], m[4]].map((v) => Number(String(v).replace(/,/g, "")));
      const [price, area, psf] = assign(nums);
      if (price) out.sold_price = price;
      if (area) out.approx_sqft = area;
      if (psf) out.price_per_sqft = psf;
      return out;
    }
  }

  const nums = [out.sold_price, out.approx_sqft, out.price_per_sqft].filter(
    (v) => Number.isFinite(v) && v > 0
  );
  if (nums.length === 3) {
    const [price, area, psf] = assign(nums);
    if (price) {
      out.sold_price = price;
      out.approx_sqft = area;
      out.price_per_sqft = psf;
    }
  }
  return out;
}

// Given three numbers, return them as [price, area, psf] using the
// arrangement where price is within 2% of area x psf. Returns nulls
// when no arrangement holds, so a genuinely odd row is left alone
// rather than rearranged into something plausible but invented.
function assign(nums) {
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2],
    [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  for (const [a, b, d] of perms) {
    const price = nums[a];
    const area = nums[b];
    const psf = nums[d];
    if (!(price > 1000 && area > 100 && area < 20000 && psf > 20 && psf < 2000)) continue;
    if (Math.abs(area * psf - price) / price < 0.02) return [price, area, psf];
  }
  return [null, null, null];
}

// Salvage JSON that stopped mid-answer.
//
// A packet with thirteen comps can run past the token limit, and the
// response then ends inside an array. The fallback used to hand the
// broken text straight back to JSON.parse, which threw its own raw
// message — "Expected ',' or ']' after array element" — and the whole
// read was lost. This walks the text, cuts at the last complete value
// and closes what's still open, so everything read up to that point
// survives.
function parseLooseJson(text) {
  try {
    return { data: JSON.parse(text), truncated: false };
  } catch {}

  const start = text.indexOf("{");
  if (start < 0) return { data: null, truncated: false };
  const body = text.slice(start);

  try {
    const m = body.match(/\{[\s\S]*\}/);
    if (m) return { data: JSON.parse(m[0]), truncated: false };
  } catch {}

  // Track structure so a brace inside a string isn't counted.
  const stack = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === "," && stack.length) lastSafe = i;
  }

  if (lastSafe < 0) return { data: null, truncated: true };

  // Cut at the last complete element, then close everything still open.
  let repaired = body.slice(0, lastSafe);
  const depth = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth.push(ch);
    else if (ch === "}" || ch === "]") depth.pop();
  }
  if (inString) repaired += '"';
  while (depth.length) repaired += depth.pop() === "{" ? "}" : "]";

  try {
    return { data: JSON.parse(repaired), truncated: true };
  } catch {
    return { data: null, truncated: true };
  }
}

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    // Files arrive as storage paths, not bytes. Vercel caps a request
    // body at 4.5MB and a scanned deal packet blows past that easily;
    // the browser uploads to Supabase directly and we fetch from there.
    // Normally storage paths. Falls back to multipart when the browser
    // couldn't reach storage — small packets only, per Vercel's body cap.
    const contentType = req.headers.get("content-type") || "";
    let paths = [];
    let direct = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      direct = form.getAll("files").filter((f) => typeof f === "object");
    } else {
      ({ paths = [] } = await req.json());
    }

    if (!paths.length && !direct.length) {
      return Response.json({ error: "No files received." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY isn't set. Add it in Vercel project settings." },
        { status: 500 }
      );
    }

    const content = [];

    const sources = direct.length
      ? direct.map((f) => ({ name: f.name, get: () => f.arrayBuffer() }))
      : paths.map((path) => ({
          name: path,
          get: async () => {
            const { data: blob, error } = await admin()
              .storage.from("deal-documents")
              .download(path);
            if (error) throw new Error(`Couldn't read ${path}: ${error.message}`);
            return blob.arrayBuffer();
          },
        }));

    for (const src of sources) {
      const path = src.name;
      const bytes = Buffer.from(await src.get());
      const data = bytes.toString("base64");

      // Decide by magic bytes, then extension. Storage sometimes hands
      // back application/octet-stream, and sending a PDF as an image
      // makes the model read a blank page and invent nothing useful.
      const head = bytes.subarray(0, 4).toString("latin1");
      const ext = (path.split(".").pop() || "").toLowerCase();

      const isPdf = head === "%PDF" || ext === "pdf";
      const imageType =
        head.startsWith("\x89PNG") || ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : ext === "gif"
          ? "image/gif"
          : "image/jpeg";

      if (isPdf) {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        });
      } else {
        content.push({
          type: "image",
          source: { type: "base64", media_type: imageType, data },
        });
      }

      // Name each file so the model can attribute what it reads
      content.push({
        type: "text",
        text: `(above: ${path.split("/").pop()})`,
      });
    }

    if (!content.length) {
      return Response.json(
        { error: "Upload a PDF or image. Other formats aren't supported." },
        { status: 400 }
      );
    }

    content.push({ type: "text", text: SCHEMA_PROMPT });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content }],
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Extraction failed");

    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // An empty response almost always means the token budget ran out
    // before any output was written. Say that plainly rather than
    // reporting an unparseable empty string.
    if (!text.trim()) {
      const blocks = (json.content || []).map((b) => b.type).join(", ") || "none";
      throw new Error(
        json.stop_reason === "max_tokens"
          ? "The model ran out of room before writing anything. Read fewer pages at once."
          : `The model returned no text (blocks: ${blocks}, stop: ${json.stop_reason}).`
      );
    }

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    const { data: parsedData, truncated } = parseLooseJson(cleaned);

    if (!parsedData) {
      throw new Error(
        json.stop_reason === "max_tokens"
          ? "The response was cut off mid-answer and couldn't be salvaged. Read fewer pages at once."
          : `Couldn't parse the result. Model returned: ${text.slice(0, 300)}`
      );
    }

    let parsed = parsedData;
    const truncationNote = truncated
      ? "The read was cut off mid-answer — what you see here is everything up to that point. Check the comps and photos against the packet, and re-read the remaining pages separately."
      : null;

    // Models return "$1,816" or "2,242 sq ft" for numeric fields no matter
    // how the schema is worded. Postgres rejects those outright, so strip
    // to a number here rather than at the form.
    const NUMERIC = {
      deal: [
        "year_built", "lot_sqft", "lot_acres", "living_area_sqft", "added_sqft",
        "post_reno_sqft", "assessed_tax_amount", "bathrooms", "purchase_price",
        "list_price",
      ],
      conversion: ["bedrooms_after", "bathrooms_after", "ensuite_count", "shared_count"],
      market: [
        "active_units", "upcoming_units", "shared_weekly", "private_weekly",
        "avg_occupancy", "days_to_first_booking", "days_to_80_percent",
      ],
      rents: ["ensuite_weekly", "shared_weekly", "gross_monthly", "gross_annual"],
    };

    const toNumber = (v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const cleaned = String(v).replace(/[^0-9.\-]/g, "");
      if (!cleaned || cleaned === "-" || cleaned === ".") return null;
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    for (const [section, fields] of Object.entries(NUMERIC)) {
      if (!parsed[section]) continue;
      for (const f of fields) {
        if (f in parsed[section]) parsed[section][f] = toNumber(parsed[section][f]);
      }
    }

    // Comps carry the same problem, one row at a time
    if (Array.isArray(parsed.comps)) {
      parsed.comps = parsed.comps.map((c) =>
        repairComp({
          ...c,
          list_price: toNumber(c.list_price),
          sold_price: toNumber(c.sold_price),
          approx_sqft: toNumber(c.approx_sqft),
          price_per_sqft: toNumber(c.price_per_sqft),
          adom: toNumber(c.adom),
          cdom: toNumber(c.cdom),
        })
      );
    }

    // Dates need to be a real date or nothing at all
    const toDate = (v) => {
      if (!v) return null;
      const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
      return m ? m[0] : null;
    };
    if (parsed.deal) {
      parsed.deal.close_of_escrow = toDate(parsed.deal.close_of_escrow);
      parsed.deal.disposition_coe = toDate(parsed.deal.disposition_coe);
    }

    // Occupancy sometimes comes back as 74 instead of 0.74
    if (parsed.market?.avg_occupancy > 1) {
      parsed.market.avg_occupancy = parsed.market.avg_occupancy / 100;
    }
    // ZIP+4 breaks the market lookup, which keys on five digits
    if (parsed.deal?.zip) parsed.deal.zip = String(parsed.deal.zip).slice(0, 5);
    if (parsed.market?.zip) parsed.market.zip = String(parsed.market.zip).slice(0, 5);

    return Response.json({
      ok: true,
      extracted: parsed,
      debug: {
        files: sources.map((s) => s.name.split("/").pop()),
        stop_reason: json.stop_reason,
        truncated: Boolean(truncationNote),
        truncationNote,
        usage: json.usage,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

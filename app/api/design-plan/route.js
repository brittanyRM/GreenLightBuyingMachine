import { admin } from "../../../lib/supabaseAdmin";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/design-plan
//
// Reads the county assessor sketch and designs a full floor plan
// inside that footprint: bedrooms, ensuite baths, shared baths,
// kitchen, dining, common area, hallways, closets, laundry.
//
// The room counts are the specification, not a suggestion. If the
// design comes back with the wrong number of bedrooms or baths, the
// error is fed back and it tries again. A flyer that says 9/4 and
// shows 8/3 is worse than no plan at all.
// ============================================================

const MODEL = "claude-sonnet-5";

function buildPrompt({ bedrooms, baths, ensuites, sqft, labels, retryNote }) {
  const shared = bedrooms - ensuites;
  const standaloneBaths = baths - ensuites;

  return `This is a county assessor building sketch showing a house footprint with dimensions in feet.

Design a complete co-living floor plan inside that footprint.

THE SPECIFICATION — this is exact, not a target:
- ${bedrooms} bedrooms total${labels.length ? `, named in this order: ${labels.join(", ")}` : ""}
- ${ensuites} of them have a private ensuite bathroom
- ${standaloneBaths} additional shared bathrooms
- ${baths} bathrooms in total across the house
${sqft ? `- roughly ${sqft} square feet of living space` : ""}

Also include, as rooms:
- One kitchen, one dining area, one common area — these can be a single open core or separate rooms
- One laundry room
- Hallways wherever bedrooms would otherwise open into each other
- A closet inside each bedroom
${retryNote ? `\nYOUR LAST ATTEMPT WAS WRONG: ${retryNote}\nFix that exactly.` : ""}

HOW TO LAY IT OUT:
- Work on a 0-100 grid in both directions. Match the shape of the footprint in the sketch — if it is L-shaped, the plan is L-shaped.
- Bedrooms go around the perimeter so each gets exterior wall for a window. The kitchen, dining and common area go in the middle.
- Cluster the shared bathrooms together so they share plumbing. Put each ensuite bath against its own bedroom, on the wall nearest the middle of the house.
- Bedrooms should be roughly square — between 1:1 and 1:1.6. A bedroom twice as long as it is wide is wrong.
- Rooms should tile the footprint: shared walls, no gaps. Edges touching exactly is correct. A small overlap where walls meet is fine; a room sitting on top of another is not.
- Every bedroom needs a door onto a hallway or the common area, never through another bedroom.

Return JSON only:

{
  "rooms": [
    {
      "label": "Orange-1",
      "type": "bedroom | ensuite_bath | bath | kitchen | dining | common | hall | laundry | closet | patio",
      "ensuite_of": "bedroom label, only for ensuite_bath",
      "x": 0, "y": 0, "w": 0, "h": 0
    }
  ]
}

Labels: bedrooms use the names given. Bathrooms are "Bath 1", "Bath 2". Ensuite baths are "<Bedroom> Ensuite". Others are "Kitchen", "Dining", "Common Area", "Hall", "Laundry", "Closet".

No preamble, no fences, no commentary.`;
}

function parseRooms(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  return (parsed.rooms || [])
    .filter((r) => Number.isFinite(+r.x) && +r.w > 0 && +r.h > 0)
    .map((r) => ({
      label: r.label || r.type,
      type: r.type,
      ensuite_of: r.ensuite_of || null,
      x: Math.max(0, Math.min(99, +r.x)),
      y: Math.max(0, Math.min(99, +r.y)),
      w: Math.max(1, Math.min(100, +r.w)),
      h: Math.max(1, Math.min(100, +r.h)),
    }));
}

function checkSpec(rooms, { bedrooms, baths }) {
  const bed = rooms.filter((r) => r.type === "bedroom").length;
  const bath = rooms.filter((r) => r.type === "bath" || r.type === "ensuite_bath").length;

  const problems = [];
  if (bed !== bedrooms) problems.push(`you drew ${bed} bedrooms, the spec is ${bedrooms}`);
  if (bath !== baths) problems.push(`you drew ${bath} bathrooms, the spec is ${baths}`);
  return { ok: problems.length === 0, problems, counts: { bedrooms: bed, bathrooms: bath } };
}

async function ask(content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Plan design failed");

  const text = (json.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) {
    throw new Error(
      json.stop_reason === "max_tokens"
        ? "The design was cut off before it finished. Try again."
        : "The model returned nothing."
    );
  }
  return text;
}

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { sketchPath, bedrooms, baths, ensuites = 0, sqft, labels = [] } =
      await req.json();

    if (!sketchPath) {
      return Response.json({ error: "No sketch to read." }, { status: 400 });
    }
    if (!bedrooms || !baths) {
      return Response.json(
        { error: "Set the target bedrooms and bathrooms on the Record tab first." },
        { status: 400 }
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY isn't set." }, { status: 500 });
    }

    const { data: blob, error } = await admin()
      .storage.from("deal-documents")
      .download(sketchPath);
    if (error) throw new Error(`Couldn't read the sketch: ${error.message}`);

    const bytes = Buffer.from(await blob.arrayBuffer());
    const ext = (sketchPath.split(".").pop() || "").toLowerCase();
    const isPdf = bytes.subarray(0, 4).toString("latin1") === "%PDF" || ext === "pdf";
    const mediaType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const b64 = bytes.toString("base64");

    const imagePart = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

    const spec = { bedrooms, baths, ensuites, sqft, labels };

    // First pass, then one correction pass if the counts are wrong.
    let rooms = null;
    let verdict = null;
    let retryNote = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await ask([
        imagePart,
        { type: "text", text: buildPrompt({ ...spec, retryNote }) },
      ]);

      const got = parseRooms(text);
      if (!got?.length) {
        retryNote = "your response could not be parsed as JSON";
        continue;
      }

      rooms = got;
      verdict = checkSpec(got, spec);
      if (verdict.ok) break;
      retryNote = verdict.problems.join(" and ");
    }

    if (!rooms) {
      return Response.json({ error: "Couldn't design a plan from that sketch." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      rooms,
      valid: verdict?.ok ?? false,
      counts: verdict?.counts,
      problems: verdict?.ok ? [] : verdict?.problems || [],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

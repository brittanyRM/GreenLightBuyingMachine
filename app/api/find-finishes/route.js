import { admin } from "../../../lib/supabaseAdmin";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/find-finishes
//
// Given room photos, locate a clean patch of each material —
// flooring, cabinet face, countertop, shower tile, paint — and
// return crop rectangles. The browser does the actual cropping.
//
// Nothing is invented. Every swatch is a piece of a real photo
// of a real house, which is the whole point: a flyer swatch is
// a claim about what's going in the property.
// ============================================================

const MODEL = "claude-sonnet-5";

const SLOTS = [
  { key: "flooring", label: "Interior Flooring", looks: "floor surface, away from rugs and furniture" },
  { key: "shower_walls", label: "Shower Walls", looks: "tiled shower or tub surround wall" },
  { key: "shower_floors", label: "Shower Floors", looks: "shower pan or bathroom floor tile" },
  { key: "paint", label: "Interior Paint", looks: "a plain painted wall, no art or fixtures" },
  { key: "cabinets", label: "Cabinets", looks: "cabinet door face, showing color and style" },
  { key: "countertops", label: "Countertops", looks: "counter or island surface, away from clutter" },
];

const PROMPT = `You are looking at interior photos of a renovated home. For each material below, find the single best square patch of that material to use as a finish swatch on a marketing flyer.

Materials:
${SLOTS.map((s) => `- ${s.key}: ${s.looks}`).join("\n")}

Return JSON:

{
  "crops": [
    {
      "key": "one of the material keys above",
      "photo_index": "0-based index of which photo, in the order given",
      "x": "left edge of the crop, percent of that photo's width",
      "y": "top edge, percent of height",
      "size": "square side length, percent of the SHORTER dimension of the photo",
      "confidence": "high | medium | low",
      "note": "what the material is, e.g. 'light oak LVP' or 'sage green shaker'"
    }
  ],
  "missing": ["keys with no usable patch in these photos"]
}

Rules:
- Pick a patch showing the material clean and flat: no hands, no glare, no reflections, no strong shadow, no object sitting on it.
- Keep size between 10 and 30. Small enough to be one material, big enough to read its texture.
- The crop must stay fully inside the photo: x + size <= 100 and y + size <= 100.
- One crop per material at most. If a material genuinely isn't visible in any photo, list its key under "missing" rather than guessing at something similar.
- A swatch that turns out to be the wrong material is worse than a missing one.

Return only the JSON object. No preamble, no markdown fences.`;

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { paths = [] } = await req.json();

    if (!paths.length) {
      return Response.json({ error: "No photos received." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY isn't set." }, { status: 500 });
    }

    const content = [];

    for (let i = 0; i < paths.length; i++) {
      const { data: blob, error } = await admin()
        .storage.from("deal-photos")
        .download(paths[i]);
      if (error) throw new Error(`Couldn't read photo ${i + 1}: ${error.message}`);

      const bytes = Buffer.from(await blob.arrayBuffer());
      const ext = (paths[i].split(".").pop() || "").toLowerCase();
      const mediaType =
        ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") },
      });
      content.push({ type: "text", text: `(photo index ${i})` });
    }

    content.push({ type: "text", text: PROMPT });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, messages: [{ role: "user", content }] }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Finish detection failed");

    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`Couldn't parse the result. Model returned: ${text.slice(0, 200)}`);
      parsed = JSON.parse(m[0]);
    }

    // Keep crops inside the frame whatever comes back
    const crops = (parsed.crops || [])
      .filter((c) => SLOTS.some((s) => s.key === c.key))
      .map((c) => {
        const size = Math.min(40, Math.max(8, Number(c.size) || 18));
        return {
          ...c,
          size,
          x: Math.max(0, Math.min(100 - size, Number(c.x) || 0)),
          y: Math.max(0, Math.min(100 - size, Number(c.y) || 0)),
          label: SLOTS.find((s) => s.key === c.key)?.label,
        };
      });

    return Response.json({ ok: true, crops, missing: parsed.missing || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

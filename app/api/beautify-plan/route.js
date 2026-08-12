import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/beautify-plan
//
// Takes the rooms as drawn and returns the same rooms tidied into
// something that reads like a real floor plan: walls aligned,
// bedrooms squared up, a hallway threaded through, the common area
// central, baths sharing a plumbing wall.
//
// The model rearranges. It does not invent or delete rooms — the
// response is checked against the input and rejected if the room
// list changed, because a flyer that quietly gains a bedroom is
// worse than an ugly plan.
// ============================================================

const MODEL = "claude-sonnet-5";

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { rooms = [], footprint } = await req.json();

    if (!rooms.length) {
      return Response.json({ error: "No rooms to work with." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY isn't set." }, { status: 500 });
    }

    const inventory = rooms.map((r, i) => ({
      id: i,
      label: r.label,
      type: r.type,
      x: +Number(r.x).toFixed(1),
      y: +Number(r.y).toFixed(1),
      w: +Number(r.w).toFixed(1),
      h: +Number(r.h).toFixed(1),
    }));

    const prompt = `Here is a rough floor plan, drawn by hand on a 0-100 grid. Tidy it into a plan that reads like a real house.

Rooms as drawn:
${JSON.stringify(inventory, null, 1)}

Overall footprint: x ${footprint.x} to ${footprint.x + footprint.w}, y ${footprint.y} to ${
      footprint.y + footprint.h
    }.

Rearrange them so the result looks like a professionally drawn residential plan:

- Align walls. Rooms in a row should share edges exactly, with no slivers or gaps between them.
- Square up the bedrooms. Aim for proportions between 1:1 and 1:1.6 — a bedroom twice as long as it is wide reads wrong.
- Keep the common area central and let it connect to as many bedrooms as possible. It is the kitchen, dining and living space.
- Cluster the bathrooms together or against the common area, so they share a plumbing wall.
- Leave a hallway where bedrooms would otherwise open into each other. Add it as a room with type "hall".
- Stay inside the footprint. Fill it — no dead space left over.
- Keep bedrooms roughly the size they were drawn relative to each other. A room drawn large should stay large.

Rules you must not break:
- Return every room from the input, once each, with its id and label unchanged. Do not add bedrooms or bathrooms. A "hall" is the only room you may add, and give it id -1.
- No two rooms may overlap.
- Every room must sit fully inside the footprint.

Return JSON only:

{"rooms":[{"id":0,"label":"Orange-1","type":"ensuite","x":0,"y":0,"w":0,"h":0}]}

No preamble, no fences, no commentary.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Plan refinement failed");

    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) {
      throw new Error(
        json.stop_reason === "max_tokens"
          ? "The response was cut off. Try again."
          : "The model returned nothing."
      );
    }

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Couldn't parse the refined plan.");
      parsed = JSON.parse(m[0]);
    }

    const out = (parsed.rooms || [])
      .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.w) && r.w > 0 && r.h > 0)
      .map((r) => ({
        ...r,
        x: Math.max(footprint.x, Math.min(footprint.x + footprint.w - 1, +r.x)),
        y: Math.max(footprint.y, Math.min(footprint.y + footprint.h - 1, +r.y)),
        w: Math.max(1, +r.w),
        h: Math.max(1, +r.h),
      }));

    // Every original room has to come back exactly once
    const originalIds = inventory.map((r) => r.id).sort((a, b) => a - b);
    const returnedIds = out
      .map((r) => r.id)
      .filter((id) => id >= 0)
      .sort((a, b) => a - b);

    const sameSet =
      originalIds.length === returnedIds.length &&
      originalIds.every((id, i) => id === returnedIds[i]);

    if (!sameSet) {
      throw new Error(
        `The refined plan changed the room list — ${returnedIds.length} rooms came back from ${originalIds.length}. Keeping the drawn plan.`
      );
    }

    // Overlap check. Small touches are fine; real overlap is not.
    const overlaps = [];
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.6 && oy > 0.6) overlaps.push(`${a.label} / ${b.label}`);
      }
    }

    return Response.json({
      ok: true,
      rooms: out,
      warnings: overlaps.length
        ? [`Rooms still overlap: ${overlaps.slice(0, 3).join(", ")}`]
        : [],
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

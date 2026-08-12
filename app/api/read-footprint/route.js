import { admin } from "../../../lib/supabaseAdmin";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// POST /api/read-footprint
//
// Vision pass over the assessor sketch. Returns the building
// blocks with both their position on the image and their real
// dimensions in feet.
//
// Perception only. lib/layout.js does the geometry — a model
// asked to place nine bedrooms will overlap them; code splitting
// rectangles won't.
//
// Output shape is enforced with a forced tool call rather than
// asked for in the prompt, so it can't come back as prose.
// ============================================================

const MODEL = "claude-sonnet-5";

const TOOL = {
  name: "report_footprint",
  description: "Report the building blocks found in an assessor sketch.",
  input_schema: {
    type: "object",
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "e.g. 'main body', 'north wing'" },
            kind: {
              type: "string",
              enum: ["living", "patio", "carport", "garage"],
            },
            x: { type: "number", description: "Left edge, percent of image width 0-100" },
            y: { type: "number", description: "Top edge, percent of image height 0-100" },
            w: { type: "number", description: "Width, percent of image width" },
            h: { type: "number", description: "Height, percent of image height" },
            feet_w: { type: "number", description: "Real width in feet from the labels" },
            feet_h: { type: "number", description: "Real depth in feet from the labels" },
            sqft: { type: "number" },
          },
          required: ["label", "kind", "x", "y", "w", "h"],
        },
      },
      total_living_sqft: { type: "number" },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["blocks"],
  },
};

const PROMPT = `This is a county assessor building sketch. Each rectangle is labeled with its dimensions in feet along the edges.

Identify every rectangular block and report it with the report_footprint tool.

Coverage — this is the part that matters most:
- Every square foot inside the building outline must belong to exactly one block. Additions, rear extensions, bump-outs, the carport, the garage: all of it.
- Do not report only the main body. A sketch showing a main rectangle plus a 21x21 addition plus a 391 sf carport is three blocks, not one.
- The blocks you return, taken together, should redraw the outline. If you find yourself leaving a labeled area unassigned, that is an error — report it as its own block with the right kind.

Coordinates:
- x, y, w, h are percentages of the FULL image, including any white margin, header text, and the county logo. The drawing usually occupies only the middle portion — do not stretch a block to the image edges.
- Blocks must NOT overlap each other. Each is a distinct part of the building footprint. If two rectangles share a wall, their edges touch but do not cross.
- x + w must not exceed 100. y + h must not exceed 100.
- Work out the drawing's bounding box on the image first, then place each block inside it.

Dimensions:
- Read the printed labels for feet. Never estimate feet from pixel size.
- If a block prints its own square footage (e.g. "391.0 sf"), trust that over multiplying.

Classification:
- Covered patios, carports, and garages are not conditioned living area, so mark kind correctly and keep them out of total_living_sqft.
- Report them anyway. A carport or garage is normally the conversion target — that is where the added bedrooms come from — and it gets used. Only a covered patio stays outside the plan.`;

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const { path } = await req.json();

    if (!path) {
      return Response.json({ error: "No sketch received." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY isn't set." }, { status: 500 });
    }

    const { data: blob, error: dlErr } = await admin()
      .storage.from("deal-documents")
      .download(path);
    if (dlErr) throw new Error(`Couldn't read the sketch: ${dlErr.message}`);

    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const isPdf = (blob.type || "").includes("pdf") || path.endsWith(".pdf");
    const file = { type: blob.type || "image/png" };

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
        tools: [TOOL],
        tool_choice: { type: "tool", name: "report_footprint" },
        messages: [
          {
            role: "user",
            content: [
              isPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
                : { type: "image", source: { type: "base64", media_type: file.type, data } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Vision pass failed");

    const call = json.content?.find((b) => b.type === "tool_use");
    if (!call) {
      const said = json.content?.find((b) => b.type === "text")?.text || "";
      throw new Error(`Couldn't read the sketch. ${said.slice(0, 160)}`);
    }

    if (!call.input.blocks?.length) {
      throw new Error("No building blocks found. Is the sketch cropped to the diagram?");
    }

    return Response.json({ ok: true, ...call.input });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

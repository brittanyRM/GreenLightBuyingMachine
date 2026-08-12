import { admin } from "../../../lib/supabaseAdmin";
import { buildRenderPrompt } from "../../../lib/renderPrompt";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The platform kills a function that runs past its plan's limit, and
// that arrives as a 500 with an empty body — no error, no log line,
// nothing for the caller to act on. This budget is deliberately below
// the ceiling so the handler stops itself and says why.
//
// Vercel's limits: 60s on Hobby, up to 300s on Pro. Set
// RENDER_BUDGET_MS to match the plan.
const BUDGET_MS = Number(process.env.RENDER_BUDGET_MS || 55_000);

// The same string every Anthropic-backed route uses.
const ANTHROPIC_MODEL = "claude-sonnet-5";

// ============================================================
// POST /api/render-plan
//
// Two images in: the county assessor sketch, and a finished plan
// used as a style reference. Then a plain instruction — draw this
// footprint as a 9 bed / 4 bath in that style.
//
// This beats sending our own SVG. The sketch carries the real
// footprint and dimensions; the reference carries the look. Asking
// a model to restyle a drawing we made was solving the wrong half
// of the problem.
// ============================================================

// Flash only by default. The pro model routinely needs more than the
// whole budget, so including it meant one attempt consumed the time
// three could have used. Set RENDER_MODELS to override.
const GEMINI_MODELS = (
  process.env.RENDER_MODELS ||
  "gemini-3.1-flash-image-preview,gemini-2.5-flash-image"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

async function fetchImagePart(source) {
  // Either a storage path in deal-documents, or a public URL
  let bytes;
  let name = "";

  if (source.startsWith("http")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Couldn't fetch ${source}`);
    bytes = Buffer.from(await res.arrayBuffer());
    name = source;
  } else {
    const { data: blob, error } = await admin()
      .storage.from("deal-documents")
      .download(source);
    if (error) throw new Error(`Couldn't read ${source}: ${error.message}`);
    bytes = Buffer.from(await blob.arrayBuffer());
    name = source;
  }

  const head = bytes.subarray(0, 4).toString("latin1");
  const ext = (name.split("?")[0].split(".").pop() || "").toLowerCase();
  const mime =
    head === "%PDF" || ext === "pdf"
      ? "application/pdf"
      : ext === "png" || head.startsWith("\x89PNG")
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";

  return { inline_data: { mime_type: mime, data: bytes.toString("base64") } };
}

// Returning the PNG inline was the failure.
//
// Vercel caps a serverless response at 4.5 MB and base64 inflates an
// image by a third, so a large render blew the limit — the platform
// dropped the response before the handler returned, which arrives as
// a 500 with an empty body and nothing in the function logs. Storing
// it and returning a link keeps the response a few hundred bytes,
// and the render is persisted either way.
async function storeRender(dealId, b64, mime = "image/png") {
  if (!dealId || !b64) return null;
  try {
    const bytes = Buffer.from(b64, "base64");
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const path = `${dealId}/plan/render-${Date.now()}.${ext}`;

    const { error } = await admin().storage
      .from("deal-photos")
      .upload(path, bytes, { upsert: true, contentType: mime });
    if (error) return null;

    const { data } = admin().storage.from("deal-photos").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

// Small enough to inline as a fallback when storage is unavailable.
const INLINE_LIMIT = 3_000_000;

export async function POST(req) {
  const { response: unauthorized } = await requireUser(req);
  if (unauthorized) return unauthorized;

  try {
    const {
      rooms = [],
      probe = false,
      verifyOnly = false,
      verifyUrl = null,
      verifyImage = null,
      dealId = null,
      sketchPath,
      planPath = null,
      notes = null,
      styleRefUrl,
      bedrooms,
      baths,
      ensuites = 0,
      sqft,
      labels = [],
      address,
      grossMonthly = null,
      grossYearly = null,
    } = await req.json();

    // Count an image that already exists. Splitting this out means a
    // slow verification can't consume the time the drawing needed.
    if (verifyOnly) {
      const b64 = await (async () => {
        if (verifyImage) return verifyImage;
        if (!verifyUrl) return null;
        const r = await fetch(verifyUrl, { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) return null;
        return Buffer.from(await r.arrayBuffer()).toString("base64");
      })();

      if (!b64) {
        return Response.json(
          { error: "Nothing to count — no image was supplied." },
          { status: 400 }
        );
      }

      const check = await verifyCounts(b64, bedrooms, baths, labels);
      return Response.json({ ok: true, check });
    }

    // Setup check. Returns what the server can see without drawing
    // anything, so a misconfigured deployment can be identified
    // without reading a stack trace.
    if (probe) {
      const present = (v) => Boolean(v && String(v).trim());
      let sketchReadable = null;
      let sketchError = null;

      if (sketchPath) {
        try {
          const part = await fetchImagePart(sketchPath);
          sketchReadable = Boolean(part?.inline_data?.data);
        } catch (e) {
          sketchReadable = false;
          sketchError = e.message;
        }
      }

      // A real one-token call, because a key being present says
      // nothing about whether it works or whether the model string is
      // valid. Every Anthropic-backed feature — document extraction,
      // footprint reading, room counting — uses the same two.
      let anthropicLive = null;
      let anthropicError = null;
      let anthropicModels = null;
      let googleImageModels = null;
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          const j = await r.json().catch(() => ({}));
          anthropicLive = r.ok;
          if (!r.ok) anthropicError = j?.error?.message || `HTTP ${r.status}`;
        } catch (e) {
          anthropicLive = false;
          anthropicError = e.message;
        }

        // Ask what this key can actually use. A model string that was
        // right when the code was written may not be right now, and
        // guessing at it has cost more time than listing it does.
        try {
          const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
            headers: {
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            signal: AbortSignal.timeout(15_000),
          });
          const j = await r.json().catch(() => ({}));
          anthropicModels = (j?.data || []).map((m) => m.id);
        } catch {
          anthropicModels = null;
        }
      }

      let googleLive = null;
      let googleError = null;
      if (process.env.GOOGLE_AI_API_KEY) {
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_AI_API_KEY}`,
            { signal: AbortSignal.timeout(15_000) }
          );
          const j = await r.json().catch(() => ({}));
          googleLive = r.ok;
          if (!r.ok) googleError = j?.error?.message || `HTTP ${r.status}`;
          // Only the ones that can return an image are useful here.
          googleImageModels = (j?.models || [])
            .map((m) => String(m.name || "").replace(/^models\//, ""))
            .filter((id) => /image/i.test(id));
        } catch (e) {
          googleLive = false;
          googleError = e.message;
        }
      }

      return Response.json({
        probe: true,
        checks: {
          anthropicModel: ANTHROPIC_MODEL,
          anthropicLive,
          anthropicError,
          anthropicModels,
          configuredGeminiModels: GEMINI_MODELS,
          googleImageModels,
          googleLive,
          googleError,
          budgetSeconds: Math.round(BUDGET_MS / 1000),
          maxDurationConfigured: maxDuration,
          GOOGLE_AI_API_KEY: present(process.env.GOOGLE_AI_API_KEY),
          OPENAI_API_KEY: present(process.env.OPENAI_API_KEY),
          ANTHROPIC_API_KEY: present(process.env.ANTHROPIC_API_KEY),
          sketchReadable,
          sketchError,
        },
      });
    }

    if (!sketchPath) {
      return Response.json({ error: "No assessor sketch to work from." }, { status: 400 });
    }
    if (!bedrooms || !baths) {
      return Response.json(
        { error: "Set target bedrooms and bathrooms on the Record tab first." },
        { status: 400 }
      );
    }
    if (!process.env.GOOGLE_AI_API_KEY) {
      return Response.json(
        { error: "GOOGLE_AI_API_KEY isn't set in Vercel." },
        { status: 500 }
      );
    }

    const parts = [];

    // One clock for the whole handler, declared before anything that
    // reads it — image assembly consults it to decide whether there's
    // time for the style reference, and the model loop consults it on
    // every pass.
    const startedAt = Date.now();
    const remaining = () => BUDGET_MS - (Date.now() - startedAt);
    const attempted = [];

    let n = 0;

    if (planPath) {
      n += 1;
      parts.push({
        text: `Image ${n} — THE LAYOUT. This is the approved plan, drawn to scale on the assessor sketch. Room positions, sizes and neighbours are decided. Reproduce this arrangement; do not design your own.`,
      });
      parts.push(await fetchImagePart(planPath));
    }

    if (!planPath) {
      n += 1;
      parts.push({
        text: `Image ${n} — the county assessor sketch, for the true building outline and the dimensions printed on it:`,
      });
      parts.push(await fetchImagePart(sketchPath));
    }

    // Dropped when there isn't time for it: it's a third image to fetch
    // and process, and the drawing style is described in the prompt
    // anyway. The layout image is the one that matters.
    if (styleRefUrl && remaining() > 35_000) {
      n += 1;
      parts.push({
        text: `Image ${n} — style reference only. Take the look from this, never the layout:`,
      });
      parts.push(await fetchImagePart(styleRefUrl));
    }

    let best = null;
    let rateLimitHits = 0;
    const retriesFor = {};

    const instruction = buildRenderPrompt({
      rooms,
      bedrooms,
      baths,
      ensuites,
      sqft,
      address,
      grossMonthly,
      grossYearly,
      notes,
      hasPlan: Boolean(planPath),
      hasStyleRef: Boolean(styleRefUrl),
    });

    parts.push({ text: instruction });

    // Just the images, for providers that take them separately
    const imageParts = parts.filter((p) => p.inline_data);

    // ---------- Gemini first ----------
    // Preferred while it's the key that's set up. OpenAI is the
    // fallback; swap the order here to reverse that.
    // ---------- OpenAI ----------
    if (process.env.OPENAI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("prompt", instruction);
      form.append("size", "1536x1024");

      // Sketch first, style reference second
      for (const p of imageParts) {
        form.append(
          "image[]",
          new Blob([Buffer.from(p.inline_data.data, "base64")], {
            type: p.inline_data.mime_type,
          }),
          "ref.png"
        );
      }

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });

      const json = await res.json();

      if (res.ok && json.data?.[0]?.b64_json) {
        const data = json.data[0].b64_json;
        const check =
          remaining() > 25_000
            ? await verifyCounts(data, bedrooms, baths, labels)
            : { unchecked: true, deferred: true, reason: "deferred to keep the render inside its time budget" };
        {
          const imageUrl = await storeRender(dealId, data, sniffImageMime(data));
          return Response.json({
            ok: true,
            provider: "gpt-image-2",
            imageUrl,
            // Only inline when there's no link and the payload is safely
            // under the platform's response limit.
            image: imageUrl ? undefined : data.length < INLINE_LIMIT ? data : undefined,
            tooLarge: !imageUrl && data.length >= INLINE_LIMIT,
            check,
          });
        }
      }

      // Fall through to Gemini rather than failing outright
      if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error(json.error?.message || "OpenAI couldn't render.");
      }
    }

    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error("No image provider configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.");
    }

    const attempts = [];
    let corrections = 0;
    const MAX_CORRECTIONS = 2;

    // One pass per model. Corrections are handled by MAX_CORRECTIONS
    // within an attempt, so queueing each model twice only ate budget.
    const queue = [...GEMINI_MODELS];

    for (const model of queue) {
      // Six attempts at up to a minute each will always outlast the
      // budget. Stop while there's time to answer.
      if (remaining() < 12_000) {
        return Response.json(
          {
            error:
              `The render didn't finish within ${Math.round(BUDGET_MS / 1000)}s. ` +
              `Attempts: ${attempted.map((a) => `${a.model} ${a.seconds}s`).join(", ") || "none"}. ` +
              `Raise RENDER_BUDGET_MS if the deployment allows longer functions — ` +
              `Vercel caps at 60s on Hobby and 300s on Pro.`,
            timedOut: true,
            attempted,
          },
          { status: 504 }
        );
      }

      const attemptStart = Date.now();
      const record = { model, seconds: 0 };
      attempted.push(record);

      let res;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Leave enough of the budget to answer, and never let one
            // model hold the whole allowance.
            signal: AbortSignal.timeout(
              Math.max(5_000, Math.min(remaining() - 8_000, 45_000))
            ),
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          }
        );
      } catch (e) {
        // A model that runs long is a reason to try the next one, not
        // to abandon the render.
        record.seconds = Math.round((Date.now() - attemptStart) / 1000);
        attempts.push(`${model}: ${e.name === "TimeoutError" ? "timed out" : e.message}`);
        continue;
      }

      record.seconds = Math.round((Date.now() - attemptStart) / 1000);

      const json = await res.json();

      if (!res.ok) {
        const msg = json.error?.message || `HTTP ${res.status}`;
        const rateLimited =
          res.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg);

        if (rateLimited) {
          rateLimitHits += 1;

          // Google says how long to wait, either in a header or in the
          // error detail. Moving straight to the next model doesn't
          // help — the quota is per project, not per model — so wait
          // it out when the budget allows.
          const headerWait = Number(res.headers.get("retry-after")) * 1000;
          const detailWait =
            Number(
              String(
                json.error?.details?.find?.((d) =>
                  String(d["@type"] || "").includes("RetryInfo")
                )?.retryDelay || ""
              ).replace(/[^\d.]/g, "")
            ) * 1000;

          const wait = Math.min(
            Math.max(headerWait || detailWait || 8_000, 2_000),
            20_000
          );

          if (remaining() > wait + 20_000 && retriesFor[model] !== true) {
            retriesFor[model] = true;
            attempts.push(`${model}: rate limited, waited ${Math.round(wait / 1000)}s`);
            await new Promise((r) => setTimeout(r, wait));
            queue.push(model); // one more go after the wait
            continue;
          }
        }

        attempts.push(`${model}: ${msg}`);
        continue;
      }

      const out = json.candidates?.[0]?.content?.parts || [];
      const img = out.find((p) => p.inline_data || p.inlineData);
      const data = img?.inline_data?.data || img?.inlineData?.data;

      if (data) {
        const check =
          remaining() > 25_000
            ? await verifyCounts(data, bedrooms, baths, [])
            : { unchecked: true, deferred: true, reason: "deferred to keep the render inside its time budget" };

        // One correction pass. Telling it what it actually drew works
        // better than restating the spec a third time.
        // Keep it. A correction pass consumes the next model, so when
        // the queue runs out every rendered image was being discarded
        // and the whole thing reported as a failure — even though two
        // models had drawn a plan in twelve and nine seconds.
        if (!best || (check?.problems?.length ?? 99) < (best.problems ?? 99)) {
          best = { data, model, check, problems: check?.problems?.length ?? 99 };
        }

        if (check && !check.ok && !check.unchecked && corrections < MAX_CORRECTIONS) {
          corrections += 1;

          // Naming the rooms it skipped works far better than repeating
          // the total. "Draw nine" it has already ignored; "Bedroom 4
          // and Bedroom 6 are missing" it can act on.
          const seenNums = new Set(
            (check.seen?.labels || [])
              .map((l) => String(l).match(/bedroom\s*(\d+)/i)?.[1])
              .filter(Boolean)
              .map(Number)
          );
          const missing = [];
          for (let i = 1; i <= bedrooms; i++) if (!seenNums.has(i)) missing.push(i);

          const surplusBaths = (check.seen?.bathrooms || 0) - baths;

          parts.push({ inline_data: { mime_type: sniffImageMime(data), data } });
          parts.push({
            text: `That attempt is wrong: it ${check.problems.join(" and ")}.${
              missing.length
                ? ` The rooms you did not draw are ${missing
                    .map((i) => `Bedroom ${i}`)
                    .join(", ")}. Add them — take the space from the common area and the largest bedrooms rather than from the footprint.`
                : ""
            }${
              surplusBaths > 0
                ? ` There ${surplusBaths === 1 ? "is" : "are"} ${surplusBaths} bathroom${
                    surplusBaths === 1 ? "" : "s"
                  } too many — delete ${
                    surplusBaths === 1 ? "it" : "them"
                  } and give the space to the neighbouring room. ${baths} is the total including the ensuite baths.`
                : ""
            } Keep everything else identical: same outline, same room positions, same furniture, same panel. Redraw with exactly ${bedrooms} bedrooms and ${baths} bathrooms.`,
          });
          continue;
        }

        {
          const imageUrl = await storeRender(dealId, data, sniffImageMime(data));
          return Response.json({
            ok: true,
            provider: model,
            imageUrl,
            // Only inline when there's no link and the payload is safely
            // under the platform's response limit.
            image: imageUrl ? undefined : data.length < INLINE_LIMIT ? data : undefined,
            tooLarge: !imageUrl && data.length >= INLINE_LIMIT,
            check,
          });
        }
      }

      const said = out.find((p) => p.text)?.text;
      const reason = json.candidates?.[0]?.finishReason;
      attempts.push(
        `${model}: no image${reason ? ` (${reason})` : ""}${said ? ` — ${said.slice(0, 120)}` : ""}`
      );
    }

    if (rateLimitHits > 0) {
      return Response.json(
        {
          error:
            "Google is rate limiting the image models. Its free tier allows only a few image " +
            "requests per minute — enable billing on the Cloud project behind GOOGLE_AI_API_KEY, " +
            `or wait a minute and try again. Attempts: ${attempts.join(" | ")}`,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    // The corrections didn't converge, but a drawing exists. Return the
    // closest one with its problems attached — a plan that needs a look
    // beats no plan and an error.
    if (best) {
      const imageUrl = await storeRender(dealId, best.data, sniffImageMime(best.data));
      return Response.json({
        ok: true,
        provider: best.model,
        imageUrl,
        image: imageUrl ? undefined : best.data.length < INLINE_LIMIT ? best.data : undefined,
        tooLarge: !imageUrl && best.data.length >= INLINE_LIMIT,
        check: best.check,
        exhausted: true,
      });
    }

    throw new Error(
      `Gemini couldn't render within ${Math.round(BUDGET_MS / 1000)}s. ` +
        `Queue was ${GEMINI_MODELS.join(", ")}. ` +
        `Attempts: ${attempts.join(" | ") || "none failed"}. ` +
        `Timings: ${attempted.map((a) => `${a.model} ${a.seconds}s`).join(", ")}`
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Count what came back. An image model asked for nine bedrooms will
// sometimes draw eight, and a flyer that contradicts its own headline
// is worse than a plain drawing.
// The provider decides the format, not us. Read it off the magic bytes.
function sniffImageMime(b64) {
  const head = Buffer.from(b64.slice(0, 16), "base64");
  if (head[0] === 0x89 && head[1] === 0x50) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head.subarray(0, 4).toString("latin1") === "RIFF") return "image/webp";
  if (head[0] === 0x47 && head[1] === 0x49) return "image/gif";
  return "image/png";
}

async function verifyCounts(imageB64, bedrooms, baths, labels) {
  // Every failure here used to come back as null, which the UI then
  // reported as a missing key. It is usually not the key. Say which.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { unchecked: true, reason: "ANTHROPIC_API_KEY isn't set in Vercel" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        // Asking for "JSON only" in prose and then regexing the reply
        // fails whenever the model prefaces its answer, or returns no
        // text block at all. A forced tool call can only come back as
        // structured input.
        tools: [
          {
            name: "report_counts",
            description: "Report the rooms counted in the floor plan.",
            input_schema: {
              type: "object",
              properties: {
                bedrooms: { type: "integer", description: "Rooms containing a bed." },
                bathrooms: {
                  type: "integer",
                  description:
                    "Rooms containing a toilet, labelled or not, including ensuites.",
                },
                labels: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Every room label exactly as printed, including repeats.",
                },
                legible: {
                  type: "boolean",
                  description: "False if any label is blurred or misspelled.",
                },
              },
              required: ["bedrooms", "bathrooms", "labels", "legible"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "report_counts" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: sniffImageMime(imageB64), data: imageB64 },
              },
              {
                type: "text",
                text: `Count the rooms in this floor plan and read every room label.

Return JSON only:
{"bedrooms":0,"bathrooms":0,"labels":["..."],"legible":true}

A room counts as a bedroom if it contains a bed. A room counts as a bathroom if it contains a toilet, whether or not it is labelled — count unlabelled ones too and report them — include ensuite bathrooms in that total. An ensuite bedroom labelled on two lines is one room, not two. List every label exactly as printed, including any that appear more than once. Set "legible" false if any label is blurred or misspelled.`,
              },
            ],
          },
        ],
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      return {
        unchecked: true,
        reason: `the counting call failed — ${json.error?.message || `HTTP ${res.status}`}`,
      };
    }

    const call = (json.content || []).find(
      (b) => b.type === "tool_use" && b.name === "report_counts"
    );

    if (!call?.input) {
      const text = (json.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        unchecked: true,
        reason:
          `the counting call returned no usable answer (stop: ${json.stop_reason || "unknown"}, ` +
          `blocks: ${(json.content || []).map((b) => b.type).join(",") || "none"})` +
          (text ? ` — ${text.slice(0, 120)}` : ""),
      };
    }

    const seen = call.input;
    const problems = [];

    if (seen.bedrooms !== bedrooms) {
      problems.push(`shows ${seen.bedrooms} bedrooms, should be ${bedrooms}`);
    }
    if (seen.bathrooms !== baths) {
      problems.push(`shows ${seen.bathrooms} bathrooms, should be ${baths}`);
    }
    if (seen.legible === false) problems.push("some labels are blurred or misspelled");

    // Two rooms sharing a name is its own failure — the totals can be
    // right while the sheet still reads Bath 1 twice.
    // Only rooms have to be uniquely named. Closets, W/D stacks,
    // pantries and linen cupboards repeat by design — counting them
    // as duplicates made the check fail every time and spent both
    // correction passes on a problem that didn't exist.
    const NAMED_ROOM = /^(bedroom|bath|ensuite bath)\s*\d+$/i;

    const counts = {};
    (seen.labels || [])
      .map((l) => String(l).trim())
      .filter((l) => NAMED_ROOM.test(l))
      .forEach((l) => {
        const k = l.toLowerCase();
        counts[k] = (counts[k] || 0) + 1;
      });
    const dupes = Object.entries(counts).filter(([, n]) => n > 1);
    if (dupes.length) {
      problems.push(
        `repeats ${dupes.map(([k, n]) => `"${k}" ${n} times`).join(" and ")}`
      );
    }

    return { ok: problems.length === 0, problems, seen };
  } catch (e) {
    return { unchecked: true, reason: `the counting call threw — ${e.message}` };
  }
}

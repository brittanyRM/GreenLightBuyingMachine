"use client";

import { useState } from "react";
import { supabase, updateDeal, apiFetch, apiJson} from "../lib/queries";

const GREEN = "#00A651";

const FINISH_SLOTS = [
  { key: "flooring", label: "Interior Flooring" },
  { key: "shower_walls", label: "Shower Walls" },
  { key: "shower_floors", label: "Shower Floors" },
  { key: "paint", label: "Interior Paint", spec: "Milk Glass DEW358" },
  { key: "cabinets", label: "Cabinets" },
  { key: "countertops", label: "Countertops" },
];

async function uploadTo(dealId, file, folder) {
  const ext = file.name.split(".").pop().toLowerCase();
  const path = `${dealId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error } = await supabase.storage
    .from("deal-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    if (/row-level security|not authorized/i.test(error.message)) {
      throw new Error(
        "Storage upload blocked — run migration 006_storage_policies.sql in Supabase."
      );
    }
    if (/bucket not found/i.test(error.message)) {
      throw new Error("The deal-photos bucket doesn't exist — run migration 002.");
    }
    throw new Error(`Upload failed: ${error.message}`);
  }

  // deal-photos is a public bucket — buyer links need to render these
  // without a session, so a signed URL would expire out from under them.
  const { data } = supabase.storage.from("deal-photos").getPublicUrl(path);
  return data.publicUrl;
}

function Slot({ label, spec, url, busy, onPick, onClear, aspect = "aspect-square" }) {
  return (
    <div>
      <label
        className={`relative block ${aspect} cursor-pointer overflow-hidden rounded border border-neutral-300 bg-neutral-50 hover:border-neutral-500`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-neutral-400">
            {busy ? "Uploading…" : label}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          className="hidden"
        />
      </label>
      <div className="mt-0.5 flex items-baseline justify-between gap-1">
        <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
          {label}
        </span>
        {url && (
          <button onClick={onClear} className="text-[9px] text-neutral-400 hover:text-red-700">
            clear
          </button>
        )}
      </div>
      {spec && <div className="text-[8px] text-neutral-400">{spec}</div>}
    </div>
  );
}

// Crop a square out of a photo in the browser. The model says where;
// the pixels come from the actual file, so a swatch is always a real
// piece of a real photo.
async function cropSquare(url, crop) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });

  const shorter = Math.min(img.width, img.height);
  const side = (crop.size / 100) * shorter;
  const sx = (crop.x / 100) * img.width;
  const sy = (crop.y / 100) * img.height;

  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    img,
    Math.max(0, Math.min(img.width - side, sx)),
    Math.max(0, Math.min(img.height - side, sy)),
    side,
    side,
    0,
    0,
    600,
    600
  );

  return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
}

export default function MediaUploader({ deal, onSaved }) {
  const [d, setD] = useState(deal);
  const [busy, setBusy] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [msg, setMsg] = useState(null);

  const finishes = d.finishes || [];
  const gallery = d.gallery || [];

  const finishFor = (key) => finishes.find((f) => f.key === key);

  async function persist(patch) {
    const next = { ...d, ...patch };
    setD(next);
    try {
      const saved = await updateDeal(d.id, patch);
      onSaved?.(saved);
      setMsg({ ok: true, text: "Saved." });
      return saved;
    } catch (e) {
      // The image is already in storage at this point — say so, so it
      // doesn't look like the upload silently failed.
      setMsg({
        ok: false,
        text: /slug/i.test(e.message)
          ? "Uploaded, but saving to the deal failed — this build is out of date. Push the latest."
          : `Uploaded, but saving to the deal failed: ${e.message}`,
      });
      throw e;
    }
  }

  async function handleUpload(file, folder, apply) {
    if (!d.id) return setMsg({ ok: false, text: "Save the deal first." });
    setBusy(folder);
    setMsg(null);
    try {
      const url = await uploadTo(d.id, file, folder);
      await persist(apply(url));
    } catch (e) {
      // persist() already wrote a message for save failures
      if (!/saving to the deal/i.test(msg?.text || "")) {
        setMsg({ ok: false, text: e.message });
      }
    } finally {
      setBusy(null);
    }
  }

  async function detectFinishes() {
    if (!gallery.length) {
      return setMsg({
        ok: false,
        text: "Add gallery photos first — the swatches get cut out of those.",
      });
    }
    setDetecting(true);
    setMsg(null);
    try {
      // Storage paths, reconstructed from the public URLs
      const paths = gallery.map((u) => u.split("/deal-photos/")[1]).filter(Boolean);

      const res = await apiFetch("/api/find-finishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const json = await apiJson(res);

      const found = [];
      for (const crop of json.crops || []) {
        const src = gallery[crop.photo_index];
        if (!src) continue;

        const blob = await cropSquare(src, crop);
        const path = `${d.id}/finish-${crop.key}/auto-${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from("deal-photos")
          .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (error) continue;

        found.push({
          key: crop.key,
          label: crop.label,
          spec: crop.note || null,
          image_url: supabase.storage.from("deal-photos").getPublicUrl(path).data.publicUrl,
        });
      }

      if (!found.length) throw new Error("No usable material patches found in those photos.");

      const merged = [
        ...finishes.filter((f) => !found.some((n) => n.key === f.key)),
        ...found,
      ].sort(
        (a, b) =>
          FINISH_SLOTS.findIndex((s) => s.key === a.key) -
          FINISH_SLOTS.findIndex((s) => s.key === b.key)
      );

      await persist({ finishes: merged });
      setMsg({
        ok: true,
        text: `Cut ${found.length} swatch${found.length === 1 ? "" : "es"} from the gallery${
          json.missing?.length ? `. Not found: ${json.missing.join(", ")}` : ""
        }. Check each one before it goes on a flyer.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setDetecting(false);
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-neutral-900 pb-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em]">Flyer media</h2>
        <span className="text-[10px] italic text-neutral-400">used on the flyer</span>
      </div>

      {msg && (
        <div
          className={`mb-3 rounded border-l-4 px-3 py-2 text-[12px] ${
            msg.ok
              ? "border-green-600 bg-green-50 text-green-900"
              : "border-red-600 bg-red-50 text-red-900"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Hero + floor plan */}
      <div className="mb-5 grid grid-cols-2 gap-4">
        <div>
          <Slot
            label="Hero photo — kitchen or living"
            aspect="aspect-[16/9]"
            url={d.hero_image_url}
            busy={busy === "hero"}
            onPick={(f) => handleUpload(f, "hero", (url) => ({ hero_image_url: url }))}
            onClear={() => persist({ hero_image_url: null })}
          />
          <p className="mt-1 text-[9px] leading-snug text-neutral-400">
            Runs across the top right of the flyer at 16:9. A wide kitchen shot crops best — the
            price plate sits over the bottom right corner, so keep that area uncluttered.
          </p>
        </div>

        <div>
          <Slot
            label="Rendered floor plan"
            aspect="aspect-[16/9]"
            url={d.marketed_floor_plan_url}
            busy={busy === "plan"}
            onPick={(f) => handleUpload(f, "plan", (url) => ({ marketed_floor_plan_url: url }))}
            onClear={() => persist({ marketed_floor_plan_url: null })}
          />
          <p className="mt-1 text-[9px] leading-snug text-neutral-400">
            The finished plan with room names. Falls back to the assessor sketch with color labels
            if this is empty.
          </p>
        </div>
      </div>

      {/* Finishes */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
          Interior finishes
        </h3>
        <button
          onClick={detectFinishes}
          disabled={detecting || !gallery.length}
          className="rounded px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-30"
          style={{ backgroundColor: GREEN }}
          title={
            gallery.length
              ? "Cut swatches out of the gallery photos"
              : "Add gallery photos first"
          }
        >
          {detecting ? "Finding…" : "Cut from gallery"}
        </button>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {FINISH_SLOTS.map((slot) => {
          const existing = finishFor(slot.key);
          return (
            <Slot
              key={slot.key}
              label={slot.label}
              spec={slot.spec}
              url={existing?.image_url}
              busy={busy === `finish-${slot.key}`}
              onPick={(f) =>
                handleUpload(f, `finish-${slot.key}`, (url) => ({
                  finishes: [
                    ...finishes.filter((x) => x.key !== slot.key),
                    { key: slot.key, label: slot.label, spec: slot.spec || null, image_url: url },
                  ].sort(
                    (a, b) =>
                      FINISH_SLOTS.findIndex((s) => s.key === a.key) -
                      FINISH_SLOTS.findIndex((s) => s.key === b.key)
                  ),
                }))
              }
              onClear={() => persist({ finishes: finishes.filter((x) => x.key !== slot.key) })}
            />
          );
        })}
      </div>

      {/* Gallery */}
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
        Gallery — {gallery.length} photo{gallery.length === 1 ? "" : "s"}
      </h3>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {gallery.map((url, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded border border-neutral-300">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => persist({ gallery: gallery.filter((_, j) => j !== i) })}
              className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] text-white opacity-0 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        <label className="flex aspect-square cursor-pointer items-center justify-center rounded border border-dashed border-neutral-300 text-[18px] text-neutral-400 hover:border-neutral-500">
          {busy === "gallery" ? "…" : "+"}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length || !d.id) return;
              setBusy("gallery");
              try {
                const urls = [];
                for (const f of files) urls.push(await uploadTo(d.id, f, "gallery"));
                await persist({ gallery: [...gallery, ...urls] });
              } catch (err) {
                setMsg({ ok: false, text: err.message });
              } finally {
                setBusy(null);
              }
            }}
            className="hidden"
          />
        </label>
      </div>

      <p className="mt-2 text-[9px] leading-snug text-neutral-400">
        These go in a public bucket so buyer links render without a login. If the photos are of a
        comparable property rather than this one, the flyer already carries a line saying the
        interior photography is representative of Green Light Buying Machine finish standards.
      </p>
    </section>
  );
}

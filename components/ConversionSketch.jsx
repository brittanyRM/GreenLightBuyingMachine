"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { uploadSketch, saveRooms, supabase, updateDeal, apiFetch, apiJson} from "../lib/queries";
import { usd } from "../lib/proforma";
import { generateLayout, capacityEstimate } from "../lib/layout";
import { roomName, roomColor } from "../lib/rooms";

// ============================================================
// Conversion Sketch — draw the new layout on the county
// assessor sketch. Writes deal_rooms; the pro forma, flyer,
// and buyer email all read from what's drawn here.
// ============================================================

const GREEN = "#00A651";

const TYPES = {
  shared: { label: "Bedroom — shared", fill: "rgba(31,41,55,0.55)", stroke: "#1F2937" },
  ensuite: { label: "Bedroom — ensuite", fill: "rgba(0,166,81,0.45)", stroke: GREEN },
  bath: { label: "Bathroom", fill: "rgba(37,99,235,0.35)", stroke: "#2563EB" },
  // One drag, two rooms — a bedroom with its bathroom already carved
  // out of a corner and paired. Drag the bath to reposition it.
  ensuite_pair: {
    label: "Ensuite (bed + bath)",
    fill: "rgba(0,166,81,0.45)",
    stroke: GREEN,
  },
  bath_ensuite: {
    label: "Bathroom — ensuite",
    fill: "rgba(0,166,81,0.30)",
    stroke: GREEN,
    savesAs: "bath",
  },
  common: { label: "Common", fill: "rgba(120,113,108,0.28)", stroke: "#78716C" },
  kitchen: { label: "Kitchen", fill: "rgba(217,119,6,0.28)", stroke: "#D97706" },
  laundry: { label: "Laundry", fill: "rgba(8,145,178,0.28)", stroke: "#0891B2" },
  garage: { label: "Garage", fill: "rgba(120,113,108,0.18)", stroke: "#A8A29E" },
};

// Rooms that earn rent. Everything else is drawn and labelled but
// never counted or priced.
const BEDROOM_TYPES = ["shared", "ensuite"];

const uid = () => Math.random().toString(36).slice(2, 9);

// A room that lost a coordinate — from a suggestion, a bad row, a
// half-finished drag — used to throw on .toFixed and take the whole
// tab down. Fall back to the default instead.
const pct = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? +n.toFixed(2) : fallback;
};

export default function ConversionSketch({
  deal,
  initialRooms = [],
  market = null,
  onSaved,
  onSketchFile,
}) {
  const [image, setImage] = useState(deal?.floor_plan_url || null);
  const [rooms, setRooms] = useState(() =>
    initialRooms.map((r) => ({
      id: r.id || uid(),
      // A saved bath with a pairing comes back as an ensuite bath.
      type: r.room_type === "bath" && r.serves_label ? "bath_ensuite" : r.room_type,
      servesLabel: r.serves_label || null,

      number: r.room_type === "bath" && r.room_number > 100 ? r.room_number - 100 : r.room_number,
      label: r.label,
      bathLabel: r.bath_label || "",
      rateOverride: r.weekly_rate,
      note: r.premium_note || "",
      x: r.plan_x ?? 44,
      y: r.plan_y ?? 45,
      w: r.plan_w ?? 12,
      h: r.plan_h ?? 10,
    }))
  );
  const [drawType, setDrawType] = useState("shared");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sketchFile, setSketchFile] = useState(null);
  const [areas, setAreas] = useState(() => deal?.building_areas || []);
  const [settingBuilding, setSettingBuilding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const [beforeBeds, setBeforeBeds] = useState(3);
  const [beforeBaths, setBeforeBaths] = useState(2);

  const target = {
    beds: deal?.target_bedrooms,
    baths: deal?.target_bathrooms,
    ensuites: deal?.target_ensuites,
  };
  const [sharedRate, setSharedRate] = useState(market?.shared_weekly || 195);
  const [ensuiteRate, setEnsuiteRate] = useState(market?.private_weekly || 291);

  const stageRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (market) {
      setSharedRate(market.shared_weekly);
      setEnsuiteRate(market.private_weekly);
    }
  }, [market]);

  // React error boundaries only catch throws during render. Anything
  // that fails in an event handler, an image callback, or a promise
  // lands here instead — invisible on a deployed build. Surface it.
  useEffect(() => {
    const onError = (e) =>
      setMsg({ ok: false, text: `Uncaught: ${e.message || e.error?.message || e}` });
    const onRejection = (e) =>
      setMsg({
        ok: false,
        text: `Unhandled: ${e.reason?.message || String(e.reason)}`,
      });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const counts = useMemo(() => {
    const shared = rooms.filter((r) => r.type === "shared");
    const ensuite = rooms.filter((r) => r.type === "ensuite");
    const baths = rooms.filter((r) => r.type === "bath" || r.type === "bath_ensuite");
    const weekly =
      shared.reduce((s, r) => s + (r.rateOverride ?? sharedRate), 0) +
      ensuite.reduce((s, r) => s + (r.rateOverride ?? ensuiteRate), 0);
    return {
      beds: shared.length + ensuite.length,
      shared: shared.length,
      ensuite: ensuite.length,
      // Ensuite baths are drawn as their own rooms now, so counting the
      // ensuite bedrooms as well double-counts them — that's how a 9/4
      // was displaying as a 9/6.
      baths: baths.length,
      weekly,
    };
  }, [rooms, sharedRate, ensuiteRate]);

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // The canvas is an <img>. A PDF loads as a broken image with no
    // intrinsic height, the stage collapses to nothing, and every
    // percentage drawn against it is computed from a zero-width box.
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      setMsg({
        ok: false,
        text: "That's a PDF. Export the sketch page as PNG or JPG first — the canvas needs a real image to measure against.",
      });
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMsg({ ok: false, text: `${file.type || "That file"} isn't an image.` });
      e.target.value = "";
      return;
    }

    setSketchFile(file);
    onSketchFile?.(file);

    // Show it straight away from the local file. Storage is for
    // persistence, not for being able to work — a failed upload should
    // never leave an empty canvas.
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);

    if (!deal?.id) return;

    // Then persist, retrying once. A dropped connection on the first
    // attempt is common and usually succeeds on the second.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = await uploadSketch(deal.id, file);
        setImage(url);
        setMsg({ ok: true, text: "Sketch saved." });
        return;
      } catch (err) {
        if (attempt === 1) {
          setMsg({
            ok: false,
            text: `Sketch is loaded and you can draw on it, but saving to storage failed: ${err.message}. Draw the layout, then re-select the file to retry.`,
          });
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  }

  // Move or resize every room together. Coordinates are percentages of
  // the sketch image, so anything that changes the image's aspect —
  // re-uploading, a different scan, a stored file replacing a local
  // preview — shifts the whole layout as a block. This puts it back.
  function nudgeAll(dx = 0, dy = 0) {
    setRooms((rs) =>
      rs.map((r) => ({
        ...r,
        x: Math.max(0, Math.min(100 - r.w, r.x + dx)),
        y: Math.max(0, Math.min(100 - r.h, r.y + dy)),
      }))
    );
    setDirty(true);
  }

  // Re-read the plan and renumber from where the rooms are now. Numbers
  // were fixed at the moment each room was drawn, so anything moved
  // afterwards kept a number that no longer matched its position.
  function resequence() {
    setRooms((rs) => renumbered(rs));
    setDirty(true);
  }

  function scaleAll(factor) {
    setRooms((rs) => {
      if (!rs.length) return rs;
      const minX = Math.min(...rs.map((r) => r.x));
      const minY = Math.min(...rs.map((r) => r.y));
      return rs.map((r) => ({
        ...r,
        x: minX + (r.x - minX) * factor,
        y: minY + (r.y - minY) * factor,
        w: r.w * factor,
        h: r.h * factor,
      }));
    });
    setDirty(true);
  }

  async function clearSketch() {
    const hasRooms = rooms.length > 0;
    const warning = hasRooms
      ? `Clear the sketch and the ${rooms.length} rooms drawn on it?`
      : "Clear the sketch?";
    if (!window.confirm(warning)) return;

    setImage(null);
    setSketchFile(null);
    onSketchFile?.(null);
    setRooms([]);
    setAreas([]);
    setSuggestion(null);
    setSelected(null);
    setDirty(false);

    if (deal?.id) {
      try {
        // The path is the record now — clearing only the URL would
        // leave the deal pointing at a sketch that's meant to be gone.
        await updateDeal(deal.id, { floor_plan_url: null, floor_plan_path: null });
        // Rooms were tied to the old sketch's coordinates, so they go too
        if (hasRooms) await saveRooms(deal.id, []);
        onSaved?.([]);
        setMsg({ ok: true, text: "Cleared. Upload a new sketch." });
      } catch (e) {
        setMsg({ ok: false, text: `Cleared on screen, but saving failed: ${e.message}` });
      }
    }
  }

  function pointPct(e) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  const nestedInRef = useRef(null);

  function onPointerDown(e) {
    if (!image) return;
    // A start over an existing room is normally a selection — unless
    // we're tracing a bathroom inside a bedroom, which the room's own
    // handler has already flagged.
    if (e.target.dataset.room && !nestedInRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointPct(e);
    startRef.current = p;
    setSelected(null);
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e) {
    if (!startRef.current) return;
    const p = pointPct(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function onPointerUp() {
    const dr = draft;
    startRef.current = null;
    const nestedIn = nestedInRef.current;
    nestedInRef.current = null;
    setDraft(null);
    if (!dr || dr.w < 2 || dr.h < 2) return;

    if (settingBuilding) {
      // Stay in area mode so several wings can be boxed in a row
      setAreas((a) => [...a, dr]);
      // The wings are the building's outline and they save with the
      // layout — without this the Save button stayed disabled and the
      // footprint could never be persisted.
      setDirty(true);
      setMsg({
        ok: true,
        text: "Wing added. Box the rest of the building, then press Save Layout to keep the footprint.",
      });
      return;
    }
    // The pair tool makes both rooms in one go.
    if (drawType === "ensuite_pair") {
      const bedNum = rooms.filter((r) => r.type === "shared" || r.type === "ensuite").length + 1;
      const bathNum = rooms.filter((r) => r.type === "bath" || r.type === "bath_ensuite").length + 1;
      const bedLabel = roomName(bedNum);

      // The bath takes the bottom-right corner — a third of the width,
      // 40% of the height, which is about right for an ensuite and
      // easy to drag somewhere better.
      const bw = Math.max(2, dr.w * 0.34);
      const bh = Math.max(2, dr.h * 0.4);

      const bed = {
        id: uid(),
        type: "ensuite",
        number: bedNum,
        label: bedLabel,
        bathLabel: `Ensuite ${bedNum}`,
        servesLabel: null,
        rateOverride: null,
        note: "",
        ...dr,
      };

      const bath = {
        id: uid(),
        type: "bath_ensuite",
        number: bathNum,
        label: `Bath ${bathNum}`,
        bathLabel: "",
        servesLabel: bedLabel,
        rateOverride: null,
        note: "",
        x: dr.x + dr.w - bw,
        y: dr.y + dr.h - bh,
        w: bw,
        h: bh,
      };

      setRooms((r) => renumbered([...r, bed, bath]));
      setSelected(bath.id);
      setDirty(true);
      setMsg({
        ok: true,
        text: `${bedLabel} added with Bath ${bathNum} as its ensuite. Drag the bath if it sits in the wrong corner.`,
      });
      return;
    }

    const isBed = drawType === "shared" || drawType === "ensuite";
    const isBath = drawType === "bath" || drawType === "bath_ensuite";
    const bedNum = rooms.filter((r) => r.type === "shared" || r.type === "ensuite").length + 1;
    const bathNum = rooms.filter((r) => r.type === "bath" || r.type === "bath_ensuite").length + 1;

    // An ensuite bath is guessed onto the nearest ensuite bedroom that
    // doesn't have one yet — the usual case, and a starting point you
    // can change. It's a default, never an assumption left unstated.
    let serves = null;

    // Which bedroom a bath belongs to is decided by overlap, not by
    // where the drag happened to start. An ensuite is usually carved
    // out of the bedroom's footprint, so the box overlaps rather than
    // sits neatly inside — and it may be drawn from either direction.
    if (isBath) {
      const bathArea = Math.max(1e-6, dr.w * dr.h);
      let best = null;

      for (const r of rooms) {
        if (r.type !== "shared" && r.type !== "ensuite") continue;
        const ox = Math.max(0, Math.min(dr.x + dr.w, r.x + r.w) - Math.max(dr.x, r.x));
        const oy = Math.max(0, Math.min(dr.y + dr.h, r.y + r.h) - Math.max(dr.y, r.y));
        const share = (ox * oy) / bathArea;
        if (share > 0.12 && (!best || share > best.share)) best = { label: r.label, share };
      }

      if (best) serves = best.label;
      else if (nestedIn) serves = nestedIn;
    }

    if (!serves && drawType === "bath_ensuite") {
      const taken = new Set(rooms.map((r) => r.servesLabel).filter(Boolean));
      // falls through to the nearest-unpaired guess below
      const candidates = rooms.filter(
        (r) => r.type === "ensuite" && !taken.has(r.label)
      );
      if (candidates.length) {
        const cx = dr.x + dr.w / 2;
        const cy = dr.y + dr.h / 2;
        candidates.sort((a, b) => {
          const d = (r) => (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2;
          return d(a) - d(b);
        });
        serves = candidates[0].label;
      }
    }

    const room = {
      id: uid(),
      type: serves && isBath ? "bath_ensuite" : drawType,
      number: isBed ? bedNum : isBath ? bathNum : null,
      label: isBed
        ? roomName(bedNum)
        : isBath
        ? `Bath ${bathNum}`
        : TYPES[drawType]?.label || "Common",
      bathLabel: drawType === "ensuite" ? `Ensuite ${bedNum}` : "",
      servesLabel: serves,
      rateOverride: null,
      note: "",
      ...dr,
    };
    setRooms((r) => renumbered([...r, room]));
    setSelected(room.id);
    setDirty(true);
  }

  const update = (id, patch) => {
    setRooms((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, ...patch } : r));
      // A type change moves a room between the bedroom and bath
      // sequences, so both have to be rebuilt. A rename must not
      // trigger it, or the name you just typed gets overwritten.
      return "type" in patch ? renumbered(next) : next;
    });
    setDirty(true);
  };
  const remove = (id) => {
    // Deleting Bedroom 3 of nine shouldn't leave a gap in the numbers.
    setRooms((rs) => renumbered(rs.filter((r) => r.id !== id)));
    setSelected(null);
    setDirty(true);
  };

  // Positional order: rows grouped by vertical overlap, each read
  // left to right. Returns a renumbered list rather than setting state,
  // so it can run on every change as well as from the button.
  function renumbered(list) {
    const byTop = [...list].sort((a, b) => a.y - b.y);
    const rows = [];

    for (const r of byTop) {
      const row = rows.find((group) =>
        group.some((g) => {
          const overlap = Math.min(g.y + g.h, r.y + r.h) - Math.max(g.y, r.y);
          return overlap > Math.min(g.h, r.h) * 0.4;
        })
      );
      if (row) row.push(r);
      else rows.push([r]);
    }

    const ordered = rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x));

    // Hand-renamed rooms keep their names, so those names are taken
    // before numbering starts. Without this the counter could generate
    // "Bedroom 4" for one room while another already carried it by
    // hand — two rooms, one label, and a rate applied twice.
    const taken = new Set(
      ordered.filter((r) => r.customLabel && r.label).map((r) => r.label)
    );

    const nextFree = (make, from) => {
      let n = from;
      while (taken.has(make(n))) n += 1;
      taken.add(make(n));
      return n;
    };

    let bed = 0;
    let bath = 0;
    const renamed = new Map();

    const next = ordered.map((r) => {
      if (r.type === "shared" || r.type === "ensuite") {
        let label;
        if (r.customLabel) {
          label = r.label;
          bed += 1;
        } else {
          bed = nextFree(roomName, bed + 1);
          label = roomName(bed);
        }
        renamed.set(r.label, label);
        return {
          ...r,
          number: bed,
          label,
          bathLabel: r.type === "ensuite" ? `${label} Ensuite` : "",
        };
      }
      if (r.type === "bath" || r.type === "bath_ensuite") {
        let label;
        if (r.customLabel) {
          label = r.label;
          bath += 1;
        } else {
          bath = nextFree((n) => `Bath ${n}`, bath + 1);
          label = `Bath ${bath}`;
        }
        return { ...r, number: bath, label };
      }
      return r;
    });

    // Pairings point at a bedroom by label, so a rename has to follow.
    return next.map((r) =>
      r.servesLabel && renamed.has(r.servesLabel)
        ? { ...r, servesLabel: renamed.get(r.servesLabel) }
        : r
    );
  }

  function renumber() {
    setRooms((rs) => renumbered(rs));
    setDirty(true);
    setMsg({ ok: true, text: "Renumbered top to bottom, left to right." });
  }



  async function suggestLayout() {
    if (!target.beds) {
      setMsg({ ok: false, text: "Set a target bedroom count on the Record tab first." });
      return;
    }

    // Assessor sketches are drawn to scale, so the areas boxed on screen
    // are already proportional to real square footage. Subdividing them
    // directly beats asking a model where the building is.
    if (areas.length) {
      const totalSqft =
        (deal?.living_area_sqft || 0) + (deal?.added_sqft || 0) || null;
      const pixelTotal = areas.reduce((s, a) => s + a.w * a.h, 0);

      const blocks = areas.map((a, i) => {
        const share = (a.w * a.h) / Math.max(1e-6, pixelTotal);
        const sqft = totalSqft ? totalSqft * share : 0;
        // Square-ish blocks; the exact feet split only drives warnings
        const side = Math.sqrt(Math.max(1, sqft));
        return {
          label: `Area ${i + 1}`,
          kind: "living",
          x: a.x,
          y: a.y,
          w: a.w,
          h: a.h,
          feet_w: side * (a.w >= a.h ? Math.sqrt(a.w / a.h) : 1),
          feet_h: side * (a.h > a.w ? Math.sqrt(a.h / a.w) : 1),
        };
      });

      // This branch had no error handling — anything it threw vanished
      // and the button appeared to do nothing.
      let result;
      try {
        result = generateLayout({
          blocks,
          target: { bedrooms: target.beds, bathrooms: target.baths, ensuites: target.ensuites },
          options: { trustBlocks: true },
        });
      } catch (e) {
        setMsg({ ok: false, text: `Couldn't build a layout: ${e.message}` });
        return;
      }

      if (!result.rooms.length) {
        setMsg({ ok: false, text: result.warnings[0] || "Couldn't build a layout." });
        return;
      }

      if (!totalSqft) {
        setMsg({
          ok: true,
          text: "Laid out from the areas you drew. Add the living area on the Record tab and the room sizes will be real square feet rather than proportions.",
        });
      }

      setSuggestion({ ...result, totalSqft });
      return;
    }

    // No areas drawn — fall back to reading the sketch
    if (!sketchFile) {
      setMsg({
        ok: false,
        text: "Draw the building areas, or re-select the sketch file so it can be read.",
      });
      return;
    }

    setSuggesting(true);
    setMsg(null);
    try {
      const path = `sketch/${deal.id}/${Date.now()}-${sketchFile.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("deal-documents")
        .upload(path, sketchFile, { upsert: true, contentType: sketchFile.type });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const res = await apiFetch("/api/read-footprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await apiJson(res);

      const result = generateLayout({
        blocks: data.blocks || [],
        target: { bedrooms: target.beds, bathrooms: target.baths, ensuites: target.ensuites },
      });

      if (!result.rooms.length) throw new Error(result.warnings[0] || "Couldn't build a layout.");
      setSuggestion({ ...result, totalSqft: data.total_living_sqft });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSuggesting(false);
    }
  }

  function acceptSuggestion() {
    let bed = 0;
    let bath = 0;
    const next = suggestion.rooms.map((r) => {
      const isBed = r.type === "shared" || r.type === "ensuite";
      if (isBed) bed += 1;
      if (r.type === "bath" || r.type === "bath_ensuite") bath += 1;
      return {
        id: uid(),
        type: r.type,
        number: isBed ? bed : r.type === "bath" || r.type === "bath_ensuite" ? bath : null,
        label: r.label,
        bathLabel: r.type === "ensuite" ? `Ensuite ${bed}` : "",
        rateOverride: null,
        note: r.est_sqft ? `~${r.est_sqft} sq ft` : "",
        x: r.x, y: r.y, w: r.w, h: r.h,
      };
    });
    setRooms(next);
    setSuggestion(null);
    setDirty(true);
    setMsg({ ok: true, text: "Drafted. Drag anything that doesn't fit the real floor plan." });
  }

  // room_number is unique per deal, but bedrooms and baths each count
  // from 1. Offset the baths so Bath 1 doesn't collide with Orange-1.
  const dealRooms = rooms
    .filter((r) => r.type !== "common")
    .map((r, i) => ({
      room_number:
        r.type === "bath" || r.type === "bath_ensuite"
          ? 100 + (r.number || 0)
          : r.type === "shared" || r.type === "ensuite"
          ? r.number || 0
          : // Service rooms — kitchen, laundry, garage, common — get
            // their own band so they never collide with a bedroom or
            // bath number, and never save as null.
            200 + i,
      label: r.label,
      // Drawn as "bath_ensuite" for the tool; stored as a bath so the
      // count is unaffected. The pairing is what distinguishes it.
      room_type: r.type === "bath_ensuite" ? "bath" : r.type,
      serves_label: r.servesLabel || null,
      bath_label: r.type === "ensuite" ? r.bathLabel : null,
      weekly_rate: r.rateOverride,
      premium_note: r.note || null,
      plan_x: pct(r.x, 44),
      plan_y: pct(r.y, 45),
      plan_w: pct(r.w, 12),
      plan_h: pct(r.h, 10),
    }));

  async function handleSave() {
    if (!deal?.id) {
      setMsg({ ok: false, text: "Save the deal record first." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveRooms(deal.id, dealRooms);

      // The boxed wings are the building's outline. They were local
      // state, so the footprint was lost on reload and the plan fell
      // back to a rectangle around the rooms.
      await updateDeal(deal.id, {
        building_areas: areas.length ? areas : null,
        // The drawing is the configuration. Typing a target and then
        // drawing something else left two numbers disagreeing, and
        // every document downstream had to pick one.
        bedrooms: counts.beds,
        bathrooms: counts.baths,
        ensuite_count: counts.ensuite,
        target_bedrooms: counts.beds,
        target_bathrooms: counts.baths,
      });
      setDirty(false);
      setMsg({
        ok: true,
        text:
          `Saved ${counts.beds} bedrooms, ${counts.baths} baths` +
          (areas.length
            ? ` and a ${areas.length}-wing footprint.`
            : ". No building wings boxed — the outline will be inferred from the rooms."),
      });
      onSaved?.(dealRooms);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const sel = rooms.find((r) => r.id === selected);

  return (
    <div className="p-3 font-sans sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 bg-neutral-950 px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GREEN }}>
              Conversion Sketch
            </div>
            <h1 className="text-lg font-bold text-white">
              {deal?.address_line || "Untitled deal"}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-white">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Existing</div>
              <div className="flex items-center gap-1">
                <input type="number" value={beforeBeds} onChange={(e) => setBeforeBeds(+e.target.value || 0)} className="w-8 bg-transparent text-right text-2xl font-bold tabular-nums outline-none" />
                <span className="text-2xl font-bold text-neutral-600">/</span>
                <input type="number" value={beforeBaths} onChange={(e) => setBeforeBaths(+e.target.value || 0)} className="w-8 bg-transparent text-2xl font-bold tabular-nums outline-none" />
              </div>
            </div>
            <div className="text-3xl font-light text-neutral-700">→</div>
            <div>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: GREEN }}>Drawn</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: GREEN }}>
                {counts.beds} / {counts.baths}
              </div>
              {target.beds && (
                <div className="text-[10px] text-neutral-500">
                  target {target.beds}/{target.baths}
                </div>
              )}
            </div>
          </div>
        </div>

        {target.beds &&
          (counts.beds !== target.beds ||
            (target.baths && counts.baths !== Number(target.baths))) && (
            <div className="mb-3 rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              This deal was set up as a {target.beds}/{target.baths}; you've drawn
              a {counts.beds}/{counts.baths}. Saving the layout makes{" "}
              {counts.beds}/{counts.baths} the deal — the pro forma, flyer and
              render all follow the drawing.
            </div>
          )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 bg-white p-2 shadow-sm">
              {Object.entries(TYPES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setDrawType(key)}
                  className={`rounded px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    drawType === key ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                  style={drawType === key ? { backgroundColor: t.stroke } : {}}
                >
                  {t.label}
                </button>
              ))}
              <div className="ml-auto flex gap-1.5">
                {areas.length > 0 && (
                  <button
                    onClick={() => {
                      setAreas([]);
                      setDirty(true);
                    }}
                    className="rounded px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100"
                  >
                    Clear areas
                  </button>
                )}
                <button
                  onClick={renumber}
                  title="Renumber every room from its position on the plan — top to bottom, left to right"
                  className="rounded px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100"
                >
                  Renumber
                </button>
                <button
                  onClick={() => {
                    setSettingBuilding((v) => !v);
                    setMsg(
                      settingBuilding
                        ? null
                        : {
                            ok: true,
                            text: "Box each wing of the building. Draw as many as you need.",
                          }
                    );
                  }}
                  className={`rounded px-2.5 py-1.5 text-[11px] font-semibold ${
                    settingBuilding ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                  style={settingBuilding ? { backgroundColor: "#B45309" } : {}}
                >
                  {settingBuilding
                    ? `Done — ${areas.length} area${areas.length === 1 ? "" : "s"}`
                    : areas.length
                    ? `Areas (${areas.length})`
                    : "Draw building areas"}
                </button>
                <button
                  onClick={suggestLayout}
                  disabled={suggesting || (!areas.length && !sketchFile)}
                  title={
                    areas.length
                      ? `Subdivide the ${areas.length} area${areas.length > 1 ? "s" : ""} you've drawn`
                      : !sketchFile
                      ? "Draw the building areas, or re-select the sketch file, to enable"
                      : "Draft a layout by reading the footprint"
                  }
                  className="rounded px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-30"
                  style={{ backgroundColor: GREEN }}
                >
                  {suggesting ? "Reading…" : "Suggest layout"}
                </button>
                <label className="cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100">
                  Replace sketch
                  <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                </label>
                <button
                  onClick={clearSketch}
                  className="rounded px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                  title="Remove the sketch and everything drawn on it"
                >
                  Clear sketch
                </button>
              </div>
            </div>

            {image && rooms.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 bg-white p-2 shadow-sm">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500">
                  Fit to sketch
                </span>
                {[
                  ["←", -1, 0],
                  ["→", 1, 0],
                  ["↑", 0, -1],
                  ["↓", 0, 1],
                ].map(([sym, dx, dy]) => (
                  <button
                    key={sym}
                    onClick={() => nudgeAll(dx, dy)}
                    className="h-7 w-7 rounded bg-neutral-100 text-[13px] font-bold text-neutral-700 hover:bg-neutral-200"
                  >
                    {sym}
                  </button>
                ))}
                <span className="mx-1 text-neutral-300">|</span>
                <button
                  onClick={() => scaleAll(0.97)}
                  className="rounded bg-neutral-100 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-200"
                >
                  Smaller
                </button>
                <button
                  onClick={() => scaleAll(1.03)}
                  className="rounded bg-neutral-100 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-200"
                >
                  Bigger
                </button>
                <span className="ml-1 text-[10px] text-neutral-400">
                  Moves every room together
                </span>
              </div>
            )}

            {!image ? (
              <label className="flex h-96 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-neutral-300 bg-white text-center hover:border-neutral-400">
                <div className="text-4xl text-neutral-300">⌂</div>
                <div className="mt-2 text-sm font-semibold text-neutral-700">
                  Drop the county assessor sketch
                </div>
                <div className="mt-1 max-w-xs text-xs text-neutral-500">
                  Then draw the new bedroom layout on top of it.
                </div>
                <span className="mt-4 rounded px-4 py-2 text-xs font-bold text-white" style={{ backgroundColor: GREEN }}>
                  Choose file
                </span>
                <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
              </label>
            ) : (
              <div
                ref={stageRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="relative touch-none select-none bg-white shadow-sm"
                style={{ cursor: "crosshair" }}
              >
                <img src={image} alt="Assessor sketch" className="pointer-events-none block w-full" />
                {rooms.map((r) => {
                  const t = TYPES[r.type];
                  const isSel = r.id === selected;
                  return (
                    <div
                      key={r.id}
                      data-room="1"
                      onPointerDown={(e) => {
                        const bath = drawType === "bath" || drawType === "bath_ensuite";
                        const bedroom = r.type === "shared" || r.type === "ensuite";

                        // Let the drag through so the bath can be traced
                        // inside the bedroom, and remember which bedroom
                        // it started in so the pairing is automatic.
                        if (bath && bedroom) {
                          nestedInRef.current = r.label;
                          return;
                        }

                        e.stopPropagation();
                        setSelected(r.id);
                      }}
                      className="absolute flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`,
                        // A bath traced inside a bedroom sits on top of
                        // it; without this it renders behind the parent
                        // fill and looks like nothing happened.
                        zIndex: r.type === "bath" || r.type === "bath_ensuite" ? 2 : 1,
                        backgroundColor: t.fill,
                        border: `${isSel ? 3 : 1.5}px solid ${t.stroke}`,
                        cursor: "pointer",
                      }}
                    >
                      <span data-room="1" className="pointer-events-none px-1 text-center text-[10px] font-bold leading-tight text-white drop-shadow">
                        {r.type === "ensuite" ? `${r.label} ✦` : r.label}
                      </span>
                    </div>
                  );
                })}
                {areas.map((a, i) => (
                  <div
                    key={`area-${i}`}
                    className="pointer-events-none absolute border-2 border-dashed"
                    style={{
                      left: `${a.x}%`,
                      top: `${a.y}%`,
                      width: `${a.w}%`,
                      height: `${a.h}%`,
                      borderColor: "#B45309",
                    }}
                  >
                    <span className="absolute left-0.5 top-0.5 text-[9px] font-bold text-amber-700">
                      {i + 1}
                    </span>
                  </div>
                ))}

                {draft && (
                  <div
                    className="absolute border-2 border-dashed"
                    style={{
                      left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%`,
                      borderColor: TYPES[drawType].stroke, backgroundColor: TYPES[drawType].fill,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-neutral-950 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                Gross scheduled rent
              </div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: GREEN }}>
                {usd((counts.weekly * 52) / 12)}
                <span className="text-sm font-normal text-neutral-500">/mo</span>
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-400">
                {usd(counts.weekly)}/wk · {usd(counts.weekly * 52)}/yr
              </div>
              <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                {[
                  ["shared", counts.shared, sharedRate, setSharedRate, "#A3A3A3"],
                  ["ensuite", counts.ensuite, ensuiteRate, setEnsuiteRate, GREEN],
                ].map(([key, count, rate, setter, color]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color }}>{count}× {key} @</span>
                    <div className="flex items-center rounded border border-neutral-700 bg-neutral-900 px-1.5">
                      <span className="text-xs text-neutral-500">$</span>
                      <input type="number" value={rate} onChange={(e) => setter(+e.target.value || 0)} className="w-12 bg-transparent py-1 text-right text-xs text-white outline-none" />
                      <span className="text-[10px] text-neutral-500">/wk</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="mt-3 w-full rounded py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-30"
                style={{ backgroundColor: GREEN }}
              >
                {saving ? "Saving…" : dirty ? "Save layout" : "Saved"}
              </button>
              {msg && (
                <div className={`mt-2 text-[10px] ${msg.ok ? "text-neutral-400" : "text-red-400"}`}>
                  {msg.text}
                </div>
              )}
            </div>

            {areas.length === 0 && image && (
              <div className="rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
                Box each wing of the building, then press Suggest layout. The sketch is drawn to
                scale, so the areas you draw are already proportional to real square footage —
                no reading required, and the rooms land exactly where you put them.
              </div>
            )}

            {suggestion && (
              <div className="bg-white p-4 shadow-sm ring-2" style={{ ringColor: GREEN }}>
                <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em]">
                  Draft layout
                </h2>
                <div className="mb-1 text-[12px] font-bold">
                  {suggestion.counts?.bedrooms ?? "?"} bedrooms ·{" "}
                  {suggestion.counts?.bathrooms ?? "?"} bathrooms
                  {target.beds && (
                    <span
                      className={
                        suggestion.counts?.bedrooms === target.beds &&
                        suggestion.counts?.bathrooms === Number(target.baths)
                          ? "ml-2 font-normal text-neutral-500"
                          : "ml-2 font-bold text-amber-700"
                      }
                    >
                      {suggestion.counts?.bedrooms === target.beds &&
                      suggestion.counts?.bathrooms === Number(target.baths)
                        ? "matches spec"
                        : `spec is ${target.beds}/${target.baths}`}
                    </span>
                  )}
                </div>

                {suggestion.stats && (
                  <p className="text-[11px] text-neutral-600">
                    {suggestion.stats.totalSqft.toLocaleString()} sq ft ·{" "}
                    {suggestion.stats.avgBedroomSqft} sq ft average bedroom ·{" "}
                    {suggestion.stats.commonSqft} sq ft common
                  </p>
                )}

                {suggestion.warnings.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-l-2 border-amber-500 pl-2">
                    {suggestion.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-800">{w}</li>
                    ))}
                  </ul>
                )}

                <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                  Room <em>sizes</em> are proportional to the real square footage. Their{" "}
                  <em>positions</em> come from the sketch reader estimating pixels, which it does
                  roughly — expect to drag rooms onto the right walls.
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={acceptSuggestion}
                    className="rounded px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    Use it
                  </button>
                  <button
                    onClick={() => setSuggestion(null)}
                    className="rounded border border-neutral-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-600"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {sel ? (
              <div className="bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]">{sel.label}</h2>
                  <button onClick={() => remove(sel.id)} className="text-[11px] font-semibold text-red-700 hover:underline">
                    Delete
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(TYPES).map(([key, t]) => (
                      <button
                        key={key}
                        onClick={() => update(sel.id, { type: key })}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${sel.type === key ? "text-white" : "bg-neutral-100 text-neutral-600"}`}
                        style={sel.type === key ? { backgroundColor: t.stroke } : {}}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <input value={sel.label} onChange={(e) => update(sel.id, { label: e.target.value, customLabel: true })} placeholder="Label" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900" />
                  {(sel.type === "shared" || sel.type === "ensuite") && (
                    <>
                      <input
                        type="number"
                        value={sel.rateOverride ?? ""}
                        onChange={(e) => update(sel.id, { rateOverride: e.target.value === "" ? null : +e.target.value })}
                        placeholder={`Rate override (default $${sel.type === "ensuite" ? ensuiteRate : sharedRate}/wk)`}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900"
                      />
                      <input value={sel.note} onChange={(e) => update(sel.id, { note: e.target.value })} placeholder="Note — corner room, private entry…" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-900" />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white p-4 text-[11px] leading-relaxed text-neutral-500 shadow-sm">
                Pick a room type, then drag a box on the sketch. Tap a room to rename it, change
                its type, or set a premium rate.
                {" "}
                For an ensuite, trace the bedroom first, then pick a bathroom
                type and trace the bath inside it — it pairs to that bedroom
                automatically. Use "Opens from" in the layout list to change
                which bedroom a bath belongs to.
              </div>
            )}

            {rooms.length > 0 && (
              <div className="bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]">
                  Layout — {rooms.length} spaces
                </h2>
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {rooms.map((r) => (
                    <div key={`wrap-${r.id}`}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] ${r.id === selected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{
                          backgroundColor:
                            r.type === "shared" || r.type === "ensuite"
                              ? roomColor(r.number)
                              : TYPES[r.type].stroke,
                        }}
                      />
                      <span className="flex-1 truncate text-neutral-800">
                        {r.label}
                        {r.servesLabel && (
                          <span className="ml-1 text-[10px] text-neutral-500">
                            → {r.servesLabel}
                          </span>
                        )}
                      </span>
                      {(r.type === "shared" || r.type === "ensuite") && (
                        <span className="tabular-nums text-neutral-500">
                          ${r.rateOverride ?? (r.type === "ensuite" ? ensuiteRate : sharedRate)}
                        </span>
                      )}
                    </button>

                    {r.id === selected &&
                      (r.type === "bath" || r.type === "bath_ensuite") && (
                        <div className="mb-1 ml-5">
                          <button
                            onClick={() => {
                              setRooms((list) => {
                                const bath = list.find((x) => x.id === r.id);
                                if (!bath) return list;

                                // Already ensuite → back to common.
                                if (bath.servesLabel) {
                                  return list.map((x) =>
                                    x.id === r.id
                                      ? { ...x, servesLabel: null, type: "bath" }
                                      : x
                                  );
                                }

                                // Otherwise take the bedroom it overlaps
                                // most; failing that, the nearest one.
                                const beds = list.filter(
                                  (b) => b.type === "shared" || b.type === "ensuite"
                                );
                                if (!beds.length) return list;

                                const area = Math.max(1e-6, bath.w * bath.h);
                                let best = null;
                                for (const b of beds) {
                                  const ox = Math.max(0, Math.min(bath.x + bath.w, b.x + b.w) - Math.max(bath.x, b.x));
                                  const oy = Math.max(0, Math.min(bath.y + bath.h, b.y + b.h) - Math.max(bath.y, b.y));
                                  const share = (ox * oy) / area;
                                  if (!best || share > best.share) best = { b, share };
                                }
                                if (!best || best.share === 0) {
                                  const cx = bath.x + bath.w / 2;
                                  const cy = bath.y + bath.h / 2;
                                  const d = (b) => (b.x + b.w / 2 - cx) ** 2 + (b.y + b.h / 2 - cy) ** 2;
                                  best = { b: [...beds].sort((a, c) => d(a) - d(c))[0] };
                                }

                                return list.map((x) =>
                                  x.id === r.id
                                    ? { ...x, servesLabel: best.b.label, type: "bath_ensuite" }
                                    : x
                                );
                              });
                              setDirty(true);
                            }}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.servesLabel
                                ? "text-white"
                                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                            }`}
                            style={r.servesLabel ? { backgroundColor: GREEN } : {}}
                          >
                            {r.servesLabel ? "Ensuite ✓" : "Make ensuite"}
                          </button>
                        </div>
                      )}

                    {r.id === selected &&
                      (r.type === "bath" || r.type === "bath_ensuite") &&
                      r.servesLabel && (
                        <div className="mb-1 ml-5 flex items-center gap-1.5">
                          <span className="text-[10px] text-neutral-500">Opens from</span>
                          <select
                            value={r.servesLabel || ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setRooms((list) =>
                                list.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        servesLabel: v,
                                        // The pairing is what makes it an
                                        // ensuite, so the type follows it.
                                        type: v ? "bath_ensuite" : "bath",
                                      }
                                    : x
                                )
                              );
                              setDirty(true);
                            }}
                            className="rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
                          >
                            <option value="">the hallway (common)</option>
                            {rooms
                              .filter((b) => b.type === "shared" || b.type === "ensuite")
                              .map((b) => (
                                <option key={b.id} value={b.label}>
                                  {b.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { supabase, updateDeal, apiFetch, apiJson} from "../lib/queries";
import { composePlan, CANVAS } from "../lib/planLayout";
import { roomName } from "../lib/rooms";
import { roomRate } from "../lib/proforma";
import { APP_VERSION, APP_BUILT } from "../lib/version";

// ============================================================
// Renders the drawn layout as a warm furnished plan — wood floors,
// thick walls, beds with nightstands, a kitchen island, plants.
//
// Palette and furniture styling follow the printed flyer rather
// than a CAD drawing, because the audience is a buyer deciding
// whether to wire money, not a contractor framing walls.
// ============================================================

const W = CANVAS.W;
const H = CANVAS.H;

const WALL = "#141414";
const FLOOR_WOOD = "#E3D3B8";
const FLOOR_TILE = "#DFDDD6";
const FLOOR_STONE = "#E6E3DC";
const FLOOR_COMMON = "#D9C6A6";
const FURN = "#FFFFFF";
const FURN_LINE = "#4A4238";
const TEXTILE = "#C9B08A";
const PLANT = "#6E8B4E";
const GREEN = "#00A651";

// ---------- architectural details ----------

// Door swing: the quarter-circle arc that makes a drawing read as a
// floor plan rather than a diagram.
function Door({ x, y, w, h, side = "bottom", size = 26 }) {
  const d = Math.min(size, Math.min(w, h) * 0.45);
  let hx, hy, path;

  if (side === "bottom") {
    hx = x + w * 0.32;
    hy = y + h;
    path = `M ${hx} ${hy} L ${hx + d} ${hy} A ${d} ${d} 0 0 0 ${hx} ${hy - d}`;
  } else if (side === "top") {
    hx = x + w * 0.32;
    hy = y;
    path = `M ${hx} ${hy} L ${hx + d} ${hy} A ${d} ${d} 0 0 1 ${hx} ${hy + d}`;
  } else if (side === "left") {
    hx = x;
    hy = y + h * 0.32;
    path = `M ${hx} ${hy} L ${hx} ${hy + d} A ${d} ${d} 0 0 1 ${hx + d} ${hy}`;
  } else {
    hx = x + w;
    hy = y + h * 0.32;
    path = `M ${hx} ${hy} L ${hx} ${hy + d} A ${d} ${d} 0 0 0 ${hx - d} ${hy}`;
  }

  return (
    <g>
      {/* clear the wall where the opening is */}
      <line
        x1={side === "left" || side === "right" ? hx : hx}
        y1={side === "left" || side === "right" ? hy : hy}
        x2={side === "left" || side === "right" ? hx : hx + d}
        y2={side === "left" || side === "right" ? hy + d : hy}
        stroke="#FFFFFF"
        strokeWidth="6"
      />
      <path d={path} fill="none" stroke={FURN_LINE} strokeWidth="1.2" />
    </g>
  );
}

// Window: a white break in the wall with a thin line through it
function Window({ x, y, w, h, side = "top" }) {
  const len = Math.min(side === "top" || side === "bottom" ? w * 0.42 : h * 0.42, 70);
  const cx = x + w / 2;
  const cy = y + h / 2;

  const geom =
    side === "top"
      ? { x1: cx - len / 2, y1: y, x2: cx + len / 2, y2: y }
      : side === "bottom"
      ? { x1: cx - len / 2, y1: y + h, x2: cx + len / 2, y2: y + h }
      : side === "left"
      ? { x1: x, y1: cy - len / 2, x2: x, y2: cy + len / 2 }
      : { x1: x + w, y1: cy - len / 2, x2: x + w, y2: cy + len / 2 };

  return (
    <g>
      <line {...geom} stroke="#FFFFFF" strokeWidth="6" />
      <line {...geom} stroke={WALL} strokeWidth="1.4" />
    </g>
  );
}

function Desk({ x, y, w, h }) {
  const dw = Math.min(w * 0.3, 52);
  const dh = Math.min(h * 0.13, 26);
  const dx = x + w - dw - 10;
  const dy = y + h - dh - 26;
  return (
    <g stroke={FURN_LINE} strokeWidth="1.1">
      <rect x={dx} y={dy} width={dw} height={dh} rx="2" fill="#B08A5E" />
      <circle cx={dx + dw / 2} cy={dy + dh + 9} r="6" fill={FURN} />
    </g>
  );
}

function Closet({ x, y, w, h }) {
  const vertical = h >= w;
  // Small and out of the way — a closet that fills the wall reads as a
  // second room and swallows the label.
  const cw = vertical ? w * 0.52 : w * 0.13;
  const ch = vertical ? h * 0.1 : h * 0.55;
  const cx = vertical ? x + 8 : x + w - cw - 6;
  const cy = y + 8;

  return (
    <g>
      <rect x={cx} y={cy} width={cw} height={ch} fill="#EFE7D8" stroke={WALL} strokeWidth="1.6" />
      <line
        x1={cx + 3}
        y1={vertical ? cy + ch / 2 : cy + 3}
        x2={vertical ? cx + cw - 3 : cx + 3}
        y2={vertical ? cy + ch / 2 : cy + ch - 3}
        stroke={FURN_LINE}
        strokeWidth="0.9"
      />
      {cw > 46 && ch > 14 && (
        <text
          x={cx + cw / 2}
          y={cy + ch / 2 + 3}
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="700"
          fontFamily="Arial, Helvetica, sans-serif"
          fill="#6B6157"
        >
          CLOSET
        </text>
      )}
    </g>
  );
}

// ---------- furniture ----------

function Plant({ x, y, r = 9 }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={PLANT} opacity="0.75" />
      <circle cx={x - r * 0.4} cy={y - r * 0.3} r={r * 0.5} fill={PLANT} opacity="0.55" />
      <circle cx={x + r * 0.42} cy={y + r * 0.15} r={r * 0.45} fill={PLANT} opacity="0.6" />
    </g>
  );
}

function Bed({ x, y, w, h }) {
  const vertical = h >= w;
  // Beds read as furniture only when they occupy the room properly —
  // roughly two thirds of the short wall, like a real plan.
  const bw = vertical ? w * 0.62 : w * 0.5;
  const bh = vertical ? h * 0.5 : h * 0.62;
  const bx = x + (w - bw) / 2;
  const by = y + (h - bh) / 2 - 6;

  const headThick = vertical ? bh * 0.16 : bw * 0.16;

  return (
    <g stroke={FURN_LINE} strokeWidth="1.1">
      {/* mattress */}
      <rect x={bx} y={by} width={bw} height={bh} rx="3" fill={FURN} />
      {/* blanket across the foot */}
      <rect
        x={vertical ? bx : bx + bw * 0.42}
        y={vertical ? by + bh * 0.42 : by}
        width={vertical ? bw : bw * 0.58}
        height={vertical ? bh * 0.58 : bh}
        rx="2"
        fill={TEXTILE}
        opacity="0.85"
      />
      {/* headboard */}
      <rect
        x={vertical ? bx - 2 : bx - 2}
        y={by - 2}
        width={vertical ? bw + 4 : headThick}
        height={vertical ? headThick : bh + 4}
        rx="2"
        fill="#8A7458"
      />
      {/* pillows */}
      {vertical ? (
        <>
          <rect x={bx + 4} y={by + headThick + 2} width={bw / 2 - 7} height={bh * 0.16} rx="2" fill="#F5F0E6" />
          <rect x={bx + bw / 2 + 3} y={by + headThick + 2} width={bw / 2 - 7} height={bh * 0.16} rx="2" fill="#F5F0E6" />
        </>
      ) : (
        <>
          <rect x={bx + headThick + 2} y={by + 4} width={bw * 0.16} height={bh / 2 - 7} rx="2" fill="#F5F0E6" />
          <rect x={bx + headThick + 2} y={by + bh / 2 + 3} width={bw * 0.16} height={bh / 2 - 7} rx="2" fill="#F5F0E6" />
        </>
      )}
      {/* nightstand */}
      <rect
        x={vertical ? bx + bw + 3 : bx + 2}
        y={vertical ? by + 2 : by + bh + 3}
        width={12}
        height={12}
        rx="1.5"
        fill={FURN}
      />
    </g>
  );
}

function Bath({ x, y, w, h }) {
  const s = Math.min(w, h);
  return (
    <g stroke={FURN_LINE} strokeWidth="1" fill={FURN}>
      {/* vanity */}
      <rect x={x + 5} y={y + 5} width={Math.max(16, w * 0.38)} height={Math.max(9, s * 0.16)} rx="2" />
      <circle cx={x + 5 + Math.max(16, w * 0.38) / 2} cy={y + 5 + Math.max(9, s * 0.16) / 2} r="2.6" fill="#EFEFEF" />
      {/* toilet */}
      <ellipse cx={x + w - 12} cy={y + 13} rx="5.5" ry="7" />
      {/* tub or shower pan */}
      <rect
        x={x + 5}
        y={y + h - Math.max(16, s * 0.36) - 5}
        width={w - 10}
        height={Math.max(16, s * 0.36)}
        rx="4"
      />
      <line
        x1={x + 5}
        y1={y + h - Math.max(16, s * 0.36) - 5}
        x2={x + w - 5}
        y2={y + h - 5}
        strokeWidth="0.7"
        opacity="0.35"
      />
    </g>
  );
}

function Kitchen({ x, y, w, h }) {
  const COUNTER = "#C9C6BE";
  const EDGE = "#8C8880";
  const d = Math.min(34, h * 0.26); // counter depth

  return (
    <g stroke={EDGE} strokeWidth="1.2">
      {/* Counter along the top, and down the left as an L */}
      <rect x={x + 6} y={y + 6} width={w - 12} height={d} fill={COUNTER} />
      <rect x={x + 6} y={y + 6} width={d} height={h - 12} fill={COUNTER} />

      {/* Two refrigerators, side by side */}
      <rect x={x + 10} y={y + 10} width={d - 8} height={d - 8} fill="#FFFFFF" />
      <rect x={x + 10 + d - 6} y={y + 10} width={d - 8} height={d - 8} fill="#FFFFFF" />
      <line
        x1={x + 10 + (d - 8) / 2}
        y1={y + 10}
        x2={x + 10 + (d - 8) / 2}
        y2={y + 10 + d - 8}
      />
      <line
        x1={x + 10 + d - 6 + (d - 8) / 2}
        y1={y + 10}
        x2={x + 10 + d - 6 + (d - 8) / 2}
        y2={y + 10 + d - 8}
      />

      {/* Range with a built-in microwave above it */}
      <rect x={x + w * 0.52} y={y + 8} width={40} height={d - 4} fill="#F2F0EC" />
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={x + w * 0.52 + 11 + c * 18}
            cy={y + 14 + r * 14}
            r="5"
            fill="#CFCBC2"
          />
        ))
      )}
      <rect
        x={x + w * 0.52}
        y={y + 6}
        width={40}
        height={7}
        fill="#DCD8D2"
      />

      {/* Island with sink and seating */}
      <rect
        x={x + w * 0.34}
        y={y + h * 0.48}
        width={w * 0.5}
        height={Math.max(26, h * 0.2)}
        rx="2"
        fill={COUNTER}
      />
      <rect
        x={x + w * 0.42}
        y={y + h * 0.52}
        width={34}
        height={Math.max(14, h * 0.1)}
        rx="2"
        fill="#EFEDE9"
      />
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={i}
          cx={x + w * 0.4 + i * (w * 0.11)}
          cy={y + h * 0.48 + Math.max(26, h * 0.2) + 12}
          r="7"
          fill="#8E9C7C"
        />
      ))}

      {/* Dishwasher, beside the sink run */}
      <rect x={x + 8} y={y + h * 0.55} width={d - 8} height={30} fill="#F2F0EC" />
    </g>
  );
}

function Garage({ x, y, w, h }) {
  // Kept plain — it reads as unconverted floor area, which is what it
  // is until the rehab turns it into bedrooms.
  return (
    <g stroke="#B9B5AD" strokeWidth="1.2" fill="none">
      <line x1={x + 10} y1={y + h * 0.5} x2={x + w - 10} y2={y + h * 0.5} strokeDasharray="8 8" />
    </g>
  );
}

function Common({ x, y, w, h }) {
  const cx = x + w / 2;
  const islandW = Math.min(w * 0.44, 150);
  const islandH = Math.min(h * 0.12, 32);
  const kitchenH = Math.min(h * 0.1, 26);

  return (
    <g stroke={FURN_LINE} strokeWidth="1.1">
      {/* kitchen run with cabinet divisions */}
      <rect x={x + 8} y={y + 7} width={w - 16} height={kitchenH} rx="2" fill={FURN} />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <line
          key={t}
          x1={x + 8 + (w - 16) * t}
          y1={y + 7}
          x2={x + 8 + (w - 16) * t}
          y2={y + 7 + kitchenH}
          strokeWidth="0.7"
          opacity="0.5"
        />
      ))}
      {/* sink and range on the run */}
      <rect x={x + w * 0.3} y={y + 11} width={26} height={kitchenH - 8} rx="2" fill="#EDE7DC" />
      <rect x={x + w * 0.62} y={y + 11} width={30} height={kitchenH - 8} rx="2" fill="#E4DED2" />

      {/* island with stools */}
      <rect x={cx - islandW / 2} y={y + h * 0.22} width={islandW} height={islandH} rx="3" fill={FURN} />
      {[0.22, 0.5, 0.78].map((t) => (
        <circle key={t} cx={cx - islandW / 2 + islandW * t} cy={y + h * 0.22 + islandH + 9} r="5.5" fill={FURN} />
      ))}

      {/* dining table, six chairs */}
      <ellipse cx={cx} cy={y + h * 0.5} rx={Math.min(w * 0.17, 52)} ry={Math.min(h * 0.085, 26)} fill="#B08A5E" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 3) * i;
        return (
          <rect
            key={i}
            x={cx + Math.cos(a) * Math.min(w * 0.21, 66) - 6}
            y={y + h * 0.5 + Math.sin(a) * Math.min(h * 0.125, 38) - 6}
            width="12"
            height="12"
            rx="2"
            fill={FURN}
          />
        );
      })}

      {/* living: rug, sectional, coffee table, console */}
      <rect
        x={cx - w * 0.24}
        y={y + h * 0.68}
        width={w * 0.48}
        height={h * 0.25}
        rx="3"
        fill={TEXTILE}
        opacity="0.45"
        stroke="none"
      />
      <rect x={cx - w * 0.21} y={y + h * 0.71} width={w * 0.3} height={h * 0.075} rx="5" fill={FURN} />
      <rect x={cx - w * 0.21} y={y + h * 0.71} width={h * 0.06} height={h * 0.19} rx="5" fill={FURN} />
      <rect x={cx - w * 0.03} y={y + h * 0.83} width={w * 0.13} height={h * 0.055} rx="3" fill="#B08A5E" />
      <rect x={cx + w * 0.16} y={y + h * 0.73} width={w * 0.05} height={h * 0.16} rx="2" fill="#8A7458" />

      {/* plants */}
      <Plant x={x + w - 20} y={y + h * 0.42} r={9} />
      <Plant x={x + 20} y={y + h * 0.62} r={8} />
      <Plant x={cx + w * 0.3} y={y + h - 22} r={7} />
    </g>
  );
}

// ---------- component ----------

export default function FloorPlanRender({
  deal,
  rooms = [],
  market = null,
  sketchFile = null,
  defaults = {},
  onSaved,
}) {
  const svgRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [mode, setMode] = useState(deal?.marketed_floor_plan_url ? "pretty" : "drawn");
  const [pretty, setPretty] = useState(null);
  const [prettifying, setPrettifying] = useState(false);
  const [rendered, setRendered] = useState(deal?.marketed_floor_plan_url || null);

  // Which image is currently the saved one. A render only counts as
  // saved once it's been written to the deal — anything newer is a
  // candidate until you press the button.
  const [savedUrl, setSavedUrl] = useState(deal?.marketed_floor_plan_url || null);

  // What this page shows and what prints — the plan with the panel
  // composited on. `rendered` stays bare; that's what the flyer uses.
  const [renderedPanelled, setRenderedPanelled] = useState(null);

  // True only while the SVG is being serialised for the model.
  const [capturing, setCapturing] = useState(false);

  const [sketchData, setSketchData] = useState(null);
  const [sketchRatio, setSketchRatio] = useState(null);

  useEffect(() => {
    const url = deal?.floor_plan_url;
    if (!url) {
      setSketchData(null);
      setSketchRatio(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        const data = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = data;
        });
        if (cancelled) return;
        setSketchData(data);
        setSketchRatio(img.naturalWidth / img.naturalHeight);
      } catch {
        // The plan still draws without it, just without the backdrop.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deal?.floor_plan_url]);

  const isSaved = Boolean(rendered && savedUrl && rendered === savedUrl);
  const [rendering, setRendering] = useState(false);
  const [notes, setNotes] = useState(deal?.render_notes || "");

  // Gross scheduled rent, from the actual rooms.
  //
  // Both panels used to price every room at the market rate for its
  // type, which throws away any weekly_rate set on a room — the corner
  // room with the private entry was quoted as a plain shared. roomRate
  // is what the pro forma uses, so the flyer now agrees with it.
  const grossWeekly = useMemo(
    () =>
      (rooms || [])
        .filter((r) => r.room_type === "shared" || r.room_type === "ensuite")
        .reduce((sum, r) => sum + roomRate(r, market, {}, deal), 0),
    [rooms, market]
  );

  // The deal loads after this mounts on a cold navigation, so pick up
  // the saved plan when it arrives rather than only at first render.
  useEffect(() => {
    const url = deal?.marketed_floor_plan_url;
    if (!url) return;
    setSavedUrl(url);
    setRendered((cur) => cur ?? url);
    // Stored bare, so the panel is rebuilt on load. Cross-origin
    // storage would taint the canvas, so a failure just falls back to
    // the bare plan rather than breaking the page.
    // Only plans saved bare get a panel. Anything saved before the
    // panel moved off the model already has one drawn into the image,
    // and stamping a second one produces the double panel.
    if (url.includes("plan-bare-")) {
      stampPanel(url).then(setRenderedPanelled).catch(() => {});
    } else {
      setRenderedPanelled(null);
    }
  }, [deal?.marketed_floor_plan_url, grossWeekly]);


  // Editable on this tab so a different mix can be tried without
  // going back to the Record tab and saving.
  const [spec, setSpec] = useState(null);

  // The counts the plan is drawn to. Seeded from the deal's target so
  // it matches the pro forma, editable here to try a different mix
  // without saving over the record.
  const drawnBeds = rooms.filter(
    (r) => r.room_type === "shared" || r.room_type === "ensuite"
  );

  const activeSpec = spec || {
    bedrooms: deal?.target_bedrooms || drawnBeds.length || 0,
    baths: Number(deal?.target_bathrooms) || 0,
    ensuites:
      deal?.target_ensuites ??
      drawnBeds.filter((r) => r.room_type === "ensuite").length,
  };

  const setSpecField = (key) => (value) =>
    setSpec({ ...activeSpec, [key]: Math.max(0, Number(value) || 0) });

  // Version one: exactly what was drawn on the sketch. Wall positions
  // and room sizes are real, so this is the one to check the layout
  // against.
  const drawn = useMemo(() => {
    const placed = rooms.filter((r) => r.plan_x != null && r.plan_w != null);
    if (!placed.length) return null;

    const pad = 26;
    const left = pad + CANVAS.sidebar;

    // The area the sketch fills, letterboxed to its own aspect ratio so
    // the rooms sit exactly where they were traced.
    const availW = W - left - pad;
    const availH = H - pad * 2 - 24;
    const ratio = sketchRatio || availW / availH;

    const imgW = Math.min(availW, availH * ratio);
    const imgH = imgW / ratio;
    const imgX = left + (availW - imgW) / 2;
    const imgY = pad + (availH - imgH) / 2;

    const sx = imgW / 100;
    const sy = imgH / 100;
    const minX = 0;
    const minY = 0;

    const boxes = placed.map((r) => ({
      kind:
        r.room_type === "bath"
          ? "bath"
          : r.room_type === "kitchen"
          ? "kitchen"
          : r.room_type === "laundry"
          ? "laundry"
          : r.room_type === "garage"
          ? "garage"
          : r.room_type === "common"
          ? "common"
          : "bed",
      label: r.label,
      // Baths are stored at 100+ so their numbers can't collide with
      // bedrooms. That offset is storage detail, not something to show.
      index:
        r.room_type === "bath" && r.room_number > 100
          ? r.room_number - 100
          : r.room_number,
      ensuite: r.room_type === "ensuite",
      x: imgX + (+r.plan_x - minX) * sx,
      y: imgY + (+r.plan_y - minY) * sy,
      w: +r.plan_w * sx,
      h: +r.plan_h * sy,
    }));

    const touches = (a, side) =>
      boxes.some((b) => {
        if (b === a) return false;
        const vO = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 8;
        const hO = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 8;
        if (side === "left") return vO && Math.abs(b.x + b.w - a.x) < 10;
        if (side === "right") return vO && Math.abs(b.x - (a.x + a.w)) < 10;
        if (side === "top") return hO && Math.abs(b.y + b.h - a.y) < 10;
        return hO && Math.abs(b.y - (a.y + a.h)) < 10;
      });

    const withOpenings = boxes.map((r) => {
      const sides = ["top", "right", "bottom", "left"];
      const interior = sides.filter((sd) => touches(r, sd));
      return {
        ...r,
        // Every room gets a door. Falling back to "bottom" put one on
        // an exterior wall when no interior wall was found; prefer any
        // wall that faces another room, and only then a default.
        door:
          r.kind === "common" || r.kind === "garage"
            ? null
            : interior[0] || interior[1] || "bottom",
        windows: sides.filter((sd) => !interior.includes(sd)).slice(0, 2),
      };
    });

    const common = withOpenings.find((r) => r.kind === "common");
    return {
      rooms: withOpenings,
      core: common || null,
      sketchBox: { x: imgX, y: imgY, w: imgW, h: imgH },
    };
  }, [rooms, sketchRatio]);

  // Version two: a designed layout for the same room count — bedrooms
  // around a central core, the way these houses actually get built.
  const composed = useMemo(() => {
    const beds = rooms.filter(
      (r) => r.room_type === "shared" || r.room_type === "ensuite"
    );
    const ensuites = Number.isFinite(Number(deal?.target_ensuites))
      ? Number(deal.target_ensuites)
      : rooms.filter((r) => r.room_type === "ensuite").length;
    // Ensuite baths are stored as bath rooms — counting them again double-counts
    const bathCount = rooms.filter((r) => r.room_type === "bath").length;
    // Record first here too, so the composed plan matches what every
    // document says the house is.
    const bedrooms = deal?.target_bedrooms || beds.length || 0;
    if (!bedrooms) return null;

    const plan = composePlan({
      bedrooms,
      baths: Number(deal?.target_bathrooms) || bathCount || 2,
      ensuites,
    });

    plan.rooms.forEach((r) => {
      if (r.kind !== "bed") return;
      const src = beds[r.index - 1];
      r.label = src?.label || roomName(r.index);
      r.roomNumber = src?.room_number || r.index;
      r.ensuite = src ? src.room_type === "ensuite" : r.index <= ensuites;
    });

    return plan;
  }, [rooms, deal]);

  const laid = mode === "pretty" ? composed || drawn : drawn || composed;

  // The SVG on screen, rasterised — this is what gets restyled.
  async function svgToPng(scale = 1.6, plainPlan = false) {
    if (plainPlan) {
      setCapturing(true);
      // Let the panel unmount before the SVG is read.
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))
      );
    }

    try {
      return await rasterise(scale);
    } finally {
      if (plainPlan) setCapturing(false);
    }
  }

  async function rasterise(scale) {
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
    );
    let img;
    try {
      img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("The plan image couldn't be rasterised."));
        i.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }

  // The image model can't draw a logo — it produces a garbled leaf and a
  // misspelled wordmark every time. The prompt leaves the corner clear
  // and the real file goes on here. /glbm-logo.png is served from the
  // app itself, so the canvas isn't cross-origin tainted.
  // The rendered image is the plan alone. The panel is drawn here, so
  // the spelling is right, the rent matches the pro forma, and the
  // logo is the real file rather than something generated.
  //
  // The bare plan is what gets saved and what the flyer uses — the
  // flyer already states the address, the counts and the rent, so
  // repeating them beside the plan is duplication. The panel version
  // is for this page, for printing, and for downloading.
  // Safari's fetch() rejects data URLs with "The string did not match
  // the expected pattern". Decode them by hand instead.
  function dataUrlToBlob(dataUrl) {
    const [head, b64] = String(dataUrl).split(",");
    const mime = head.match(/data:([^;]+)/)?.[1] || "image/png";
    const bytes = atob(b64 || "");
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Shrink an image blob to fit within maxPx on its long edge.
  async function shrink(blob, maxPx = 1400) {
    try {
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      URL.revokeObjectURL(url);

      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale >= 1) return blob;

      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);

      const out = await new Promise((r) => c.toBlob(r, "image/png", 0.92));
      return out && out.size < blob.size ? out : blob;
    } catch {
      return blob;
    }
  }

  async function stampPanel(dataUrl) {
    try {
      const load = (src) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = src;
        });

      const load2 = (src) =>
        new Promise((res, rej) => {
          const i = new Image();
          if (!src.startsWith("data:")) i.crossOrigin = "anonymous";
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = src;
        });

      const plan = await load2(dataUrl);
      let logo = null;
      try {
        logo = await load("/glbm-logo.png");
      } catch {
        logo = null;
      }

      // Models leave a wide white margin around the drawing, so the
      // plan arrived small on a mostly empty sheet. Find the drawing's
      // real bounds and crop to them before laying out the page.
      const trim = (() => {
        try {
          const t = document.createElement("canvas");
          t.width = plan.width;
          t.height = plan.height;
          const tc = t.getContext("2d", { willReadFrequently: true });
          tc.drawImage(plan, 0, 0);
          const px = tc.getImageData(0, 0, t.width, t.height).data;

          let x0 = t.width;
          let y0 = t.height;
          let x1 = 0;
          let y1 = 0;
          const step = 2;

          for (let y = 0; y < t.height; y += step) {
            for (let x = 0; x < t.width; x += step) {
              const i = (y * t.width + x) * 4;
              // Anything meaningfully off-white is the drawing.
              if (px[i] < 246 || px[i + 1] < 246 || px[i + 2] < 246) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }

          const pad = Math.round(Math.min(plan.width, plan.height) * 0.015);
          x0 = Math.max(0, x0 - pad);
          y0 = Math.max(0, y0 - pad);
          x1 = Math.min(t.width, x1 + pad);
          y1 = Math.min(t.height, y1 + pad);

          const w = x1 - x0;
          const h = y1 - y0;
          return w > plan.width * 0.2 && h > plan.height * 0.2
            ? { x: x0, y: y0, w, h }
            : { x: 0, y: 0, w: plan.width, h: plan.height };
        } catch {
          return { x: 0, y: 0, w: plan.width, h: plan.height };
        }
      })();

      // A narrower panel, and the plan scaled to fill the height it's
      // given. The old fixed 30% column left the drawing floating in
      // white on both sides.
      const SHEET_H = Math.max(trim.h, 900);
      const panelW = Math.round(SHEET_H * 0.34);
      const planW = Math.round((trim.w / trim.h) * SHEET_H);

      const c = document.createElement("canvas");
      c.width = panelW + planW;
      c.height = SHEET_H;
      const ctx = c.getContext("2d");

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(
        plan,
        trim.x,
        trim.y,
        trim.w,
        trim.h,
        panelW,
        0,
        planW,
        SHEET_H
      );

      const pad = Math.round(panelW * 0.1);
      const S = panelW / 360;
      // Guard against a very tall sheet pushing the text off the bottom.
      const maxTextY = c.height * 0.82;
      const F = "Arial, Helvetica, sans-serif";
      let y = Math.round(c.height * 0.12);

      ctx.fillStyle = GREEN;
      ctx.font = `900 ${Math.round(30 * S)}px ${F}`;
      const words = (deal?.address_line || "PadSplit").toUpperCase().split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > panelW - pad * 2 && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      if (line) lines.push(line);
      for (const l of lines) {
        ctx.fillText(l, pad, y);
        y += Math.round(34 * S);
      }

      y += Math.round(22 * S);
      ctx.fillStyle = "#1A1A1A";
      ctx.font = `${Math.round(21 * S)}px ${F}`;
      const beds = rooms.filter(
        (r) => r.room_type === "shared" || r.room_type === "ensuite"
      ).length;
      const baths = rooms.filter((r) => r.room_type === "bath").length;
      const sqft = deal?.finished_sqft || deal?.post_reno_sqft || deal?.living_area_sqft;

      for (const t of [
        `${beds} BEDROOMS`,
        `${baths} BATHROOMS`,
        sqft ? `${Number(sqft).toLocaleString()} SQFT` : null,
      ].filter(Boolean)) {
        ctx.fillText(t, pad, y);
        y += Math.round(28 * S);
      }

      y += Math.round(16 * S);
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = Math.max(2, Math.round(3 * S));
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + Math.round(150 * S), y);
      ctx.stroke();
      y += Math.round(40 * S);

      const money = (n) =>
        Number(n).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        });

      for (const [label, value] of [
        ["ESTIMATED GROSS RENT:", `${money((grossWeekly * 52) / 12)} / MONTH`],
        ["YEARLY ESTIMATE:", `${money(grossWeekly * 52)} / YEAR`],
      ]) {
        ctx.fillStyle = "#1A1A1A";
        ctx.font = `bold ${Math.round(15 * S)}px ${F}`;
        ctx.fillText(label, pad, y);
        y += Math.round(28 * S);

        ctx.fillStyle = GREEN;
        ctx.font = `900 ${Math.round(26 * S)}px ${F}`;
        ctx.fillText(value, pad, y);
        y += Math.round(46 * S);
      }

      ctx.fillStyle = "#8A8A8A";
      ctx.font = `${Math.round(12 * S)}px ${F}`;
      const disclaimerY = Math.min(y, maxTextY);
      ctx.fillText("This rendering is a representation.", pad, disclaimerY);
      ctx.fillText("Actual layout may vary.", pad, disclaimerY + Math.round(17 * S));

      if (logo) {
        // Constrained on both axes. Fitting the panel's full text width
        // made it enormous — it swallowed the rent figures and the
        // disclaimer. It sits under the text, so its height is what
        // has to be bounded.
        const maxW = (panelW - pad * 2) * 0.62;
        const maxH = c.height * 0.11;

        let lw = maxW;
        let lh = lw * (logo.height / logo.width);
        if (lh > maxH) {
          lh = maxH;
          lw = lh * (logo.width / logo.height);
        }

        // Below the disclaimer, never overlapping it.
        const top = Math.max(y + 30 * S, c.height - lh - pad);
        ctx.drawImage(logo, pad, top, lw, lh);
      }

      return c.toDataURL("image/png");
    } catch {
      return dataUrl;
    }
  }

  // Everything the render needs before it starts. Checked up front so
  // a missing input is a message, not a flicker.
  const hasSketch = Boolean(sketchFile || deal?.floor_plan_url);

  const [diag, setDiag] = useState(null);

  async function checkSetup() {
    setDiag({ running: true, steps: [] });
    const steps = [];
    // First line, always — so a stale deployment is obvious before
    // anyone reads the rest of the results.
    steps.push({
      name: "App build",
      ok: true,
      detail: `v${APP_VERSION} (${APP_BUILT}) — if this isn't the version you just pushed, the deploy hasn't landed`,
    });
    const add = (name, ok, detail) => {
      steps.push({ name, ok, detail });
      setDiag({ running: true, steps: [...steps] });
    };

    try {
      add("Deal has a sketch", Boolean(deal?.floor_plan_url), deal?.floor_plan_url ? "present" : "missing");

      let blob = null;
      if (deal?.floor_plan_url) {
        try {
          const res = await fetch(deal.floor_plan_url);
          blob = res.ok ? await res.blob() : null;
          add(
            "Sketch downloads in the browser",
            Boolean(blob && blob.size),
            blob ? `${(blob.size / 1024).toFixed(0)} KB, ${blob.type || "unknown type"}` : `HTTP ${res.status}`
          );
        } catch (e) {
          add("Sketch downloads in the browser", false, e.message);
        }
      }

      let sketchPath = null;
      if (blob?.size) {
        try {
          sketchPath = `sketch/${deal.id}/${Date.now()}-probe.png`;
          const { error } = await supabase.storage
            .from("deal-documents")
            .upload(sketchPath, blob, { upsert: true, contentType: blob.type || "image/png" });
          if (error) throw new Error(error.message);
          add("Sketch uploads to storage", true, sketchPath);
        } catch (e) {
          sketchPath = null;
          add("Sketch uploads to storage", false, e.message);
        }
      }

      try {
        const dataUrl = await svgToPng(1);
        add("Drawn plan rasterises", dataUrl.length > 1000, `${Math.round(dataUrl.length / 1024)} KB`);
      } catch (e) {
        add("Drawn plan rasterises", false, `${e.message} — optional, the render works without it`);
      }

      try {
        const res = await apiFetch("/api/render-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ probe: true, sketchPath }),
        });
        const json = await apiJson(res);

        const c = json.checks || {};
        add("Signed in / API reachable", true, "");
        add("GOOGLE_AI_API_KEY set on the server", c.GOOGLE_AI_API_KEY, c.GOOGLE_AI_API_KEY ? "" : "this is the one that draws the plan");
        add("ANTHROPIC_API_KEY set on the server", c.ANTHROPIC_API_KEY, c.ANTHROPIC_API_KEY ? "" : "only used to count rooms afterwards");
        if (sketchPath) {
          add("Server can read the sketch", c.sketchReadable === true, c.sketchError || "");
        }
        add(
          `Anthropic key works (model ${c.anthropicModel})`,
          c.anthropicLive === true,
          c.anthropicError || "used by document reading, footprint reading and room counting"
        );
        add(
          "Google key works",
          c.googleLive === true,
          c.googleError || "used to draw the plan"
        );
        if (c.anthropicModels) {
          const has = c.anthropicModels.includes(c.anthropicModel);
          add(
            `Model "${c.anthropicModel}" exists on this key`,
            has,
            has ? "" : `available: ${c.anthropicModels.slice(0, 8).join(", ")}`
          );
        }
        if (c.googleImageModels) {
          const usable = (c.configuredGeminiModels || []).filter((m) =>
            c.googleImageModels.includes(m)
          );
          add(
            "Configured image models exist on this key",
            usable.length > 0,
            usable.length
              ? `usable: ${usable.join(", ")}`
              : `none of ${(c.configuredGeminiModels || []).join(", ")} — available: ${c.googleImageModels.slice(0, 8).join(", ")}`
          );
        }
        add(
          "Time budget",
          true,
          `${c.budgetSeconds}s allowed (function configured for ${c.maxDurationConfigured}s — Vercel Hobby caps at 60s regardless)`
        );
      } catch (e) {
        add("Signed in / API reachable", false, e.message);
      }
    } finally {
      setDiag((d) => ({ ...(d || {}), running: false }));
    }
  }

  async function renderPretty() {
    if (!hasSketch) {
      setMsg({
        ok: false,
        text: "There's no assessor sketch on this deal. Upload one on the Sketch tab — the renderer needs it for the building outline, and can't draw without it.",
      });
      return;
    }

    // Capturing the drawn plan needs the SVG on screen, and it isn't
    // when the rendered image is showing. Switch back, let it paint,
    // and remember where to return to — if the render then fails, the
    // view was being left on the drawn plan with no new image, which
    // looks exactly like the button did nothing.
    const returnTo = mode;
    if (mode !== "drawn") {
      setMode("drawn");
      // 60ms was a guess. Wait for two paints, so the SVG is mounted
      // and laid out before it's serialised — a capture taken too
      // early is empty, and an empty capture means the render
      // improvises instead of tracing.
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))
      );
    }

    if (deal?.id && (deal.render_notes || "") !== notes) {
      updateDeal(deal.id, { render_notes: notes.trim() || null }).catch(() => {});
    }

    const beds = rooms.filter(
      (r) => r.room_type === "shared" || r.room_type === "ensuite"
    );
    // What's drawn is the truth.
    //
    // The render used to take its counts from the target on the Record
    // tab, so a layout had to match that number before it would draw,
    // and changing your mind on the sketch meant editing the target as
    // well. Draw what the house is; the render follows.
    const drawnBaths = rooms.filter((r) => r.room_type === "bath").length;
    const drawnEns = rooms.filter((r) => r.room_type === "ensuite").length;

    // The record decides what gets drawn.
    //
    // This used to prefer the sketch, so a half-traced plan rendered a
    // half-sized house and the drawing disagreed with every document
    // that quoted it. The sketch says where the rooms are; the record
    // says how many there are. It only fills in where the record is
    // silent.
    const targetBeds = activeSpec.bedrooms || beds.length;
    const targetBaths = activeSpec.baths || drawnBaths;
    const targetEns = Number.isFinite(activeSpec.ensuites)
      ? activeSpec.ensuites
      : drawnEns;

    if (!targetBeds || !targetBaths) {
      setMsg({
        ok: false,
        text: "Nothing to draw yet — lay out the rooms on the Sketch tab first.",
      });
      return;
    }

    setRendering(true);
    setMsg(null);
    let step = "starting";
    try {
      step = "reading the assessor sketch";
      // The assessor sketch, either from this session or already stored
      let sketchPath = null;

      if (sketchFile) {
        sketchPath = `sketch/${deal.id}/${Date.now()}-${sketchFile.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage
          .from("deal-documents")
          .upload(sketchPath, sketchFile, { upsert: true, contentType: sketchFile.type });
        if (error) throw new Error(`Couldn't upload the sketch: ${error.message}`);
      } else if (deal?.floor_plan_url) {
        // floor_plan_url is sometimes a data URL — the sketch is held
        // as base64 in the browser before it reaches storage, and that
        // can be what got saved. Safari's fetch() rejects a data URL
        // with "The string did not match the expected pattern", which
        // is where that error was coming from. Decode it directly.
        let blob;
        const url = deal.floor_plan_url;

        if (url.startsWith("data:")) {
          const [head, b64] = url.split(",");
          const mime = head.match(/data:([^;]+)/)?.[1] || "image/png";
          const bytes = atob(b64 || "");
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          blob = new Blob([arr], { type: mime });
        } else {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
          } catch (e) {
            throw new Error(
              `Couldn't read the stored sketch (${e.message}). Re-upload it on the Sketch tab.`
            );
          }
        }

        if (!blob || blob.size === 0) {
          throw new Error(
            "The stored sketch is empty. Re-upload it on the Sketch tab."
          );
        }

        sketchPath = `sketch/${deal.id}/${Date.now()}-stored.png`;
        const small = await shrink(blob);
        const { error } = await supabase.storage
          .from("deal-documents")
          .upload(sketchPath, small, { upsert: true, contentType: small.type || "image/png" });
        if (error) throw new Error(`Couldn't store the sketch: ${error.message}`);
      } else {
        throw new Error(
          "No assessor sketch on this deal — upload one on the Sketch tab, then try again."
        );
      }

      // The drawn plan is the geometry that was just approved. Sending
      // the assessor sketch alone left the model to invent a layout
      // from a footprint; sending the plan gives it something to trace.
      step = "capturing the drawn plan";
      let planPath = null;
      let planProblem = null;

      // Without this image the model has only a footprint and a room
      // count, so it designs its own house. Losing it silently is the
      // difference between tracing your layout and inventing one, so
      // the failure is recorded rather than swallowed.
      // One retry with a longer wait. The common failure is capturing
      // before the switch to the drawn view has painted, and a second
      // attempt a moment later succeeds.
      for (let attempt = 0; attempt < 2 && !planPath; attempt++) {
        if (attempt) {
          setMode("drawn");
          await new Promise((r) => setTimeout(r, 400));
        }
      try {
        if (!svgRef.current) {
          planProblem = "the drawn plan wasn't on screen to capture";
        } else {
          // 1.0 is plenty for tracing; 1.6 was doubling the bytes
          // for detail the model doesn't use.
          const dataUrl = await svgToPng(1.0, true);
          const planBlob = await shrink(dataUrlToBlob(dataUrl), 1200);
          if (!planBlob || planBlob.size < 1000) {
            planProblem = "the captured plan came out empty";
          } else {
            planPath = `sketch/${deal.id}/${Date.now()}-drawn-plan.png`;
            const { error: planErr } = await supabase.storage
              .from("deal-documents")
              .upload(planPath, planBlob, { upsert: true, contentType: "image/png" });
            if (planErr) {
              planPath = null;
              planProblem = `the plan couldn't be uploaded — ${planErr.message}`;
            }
          }
        }
      } catch (e) {
        planPath = null;
        planProblem = e.message;
      }
      }

      // Rendering without the layout produces a different house. That's
      // worse than not rendering — it burns a request and returns a
      // plan that contradicts the sketch.
      if (!planPath) {
        throw new Error(
          `Can't render without your layout — ${planProblem}. ` +
            `Switch to "As drawn", check the plan is visible, and try again.`
        );
      }

      step = "drawing the plan";
      const res = await apiFetch("/api/render-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sketchPath,
          planPath,
          notes: notes.trim() || null,
          styleRefUrl: defaults.plan_style_ref?.url || null,
          bedrooms: targetBeds,
          baths: Number(targetBaths),
          ensuites: targetEns,
          sqft: deal?.finished_sqft || deal?.post_reno_sqft || deal?.living_area_sqft,
          labels: beds.map((r) => r.label).filter(Boolean),
          address: deal?.address_line,
          dealId: deal?.id,
          // The drawn rooms carry the ensuite pairings and the named
          // service rooms; without them the model guesses both.
          rooms: rooms.map((r) => ({
            label: r.label,
            room_type: r.room_type,
            serves_label: r.serves_label || null,
          })),
          // The panel on the rendered sheet has to agree with the panel
          // on the drawn one. Same rates, same arithmetic, one source.
          grossMonthly: Math.round((grossWeekly * 52) / 12),
          grossYearly: Math.round(grossWeekly * 52),
        }),
      });
      const json = await apiJson(res);

      step = "adding the panel";

      // The render now arrives as a link to stored image; the inline
      // base64 is only a fallback for when storage is unavailable.
      if (json.tooLarge) {
        throw new Error(
          "The render came back too large to return and couldn't be stored. Check the deal-photos bucket exists and its policies are in place (migration 006)."
        );
      }
      const bare = json.imageUrl
        ? json.imageUrl
        : json.image
        ? `data:image/png;base64,${json.image}`
        : null;
      if (!bare) throw new Error("The server returned no image.");
      setRendered(bare);
      setRenderedPanelled(await stampPanel(bare));
      setMode("pretty");

      if (planProblem) {
        setMsg({
          ok: false,
          text: `Rendered WITHOUT your layout — ${planProblem}. The model designed its own arrangement, so the rooms won't match the sketch. Switch to As drawn and try again.`,
        });
      }

      if (json.exhausted) {
        setMsg({
          ok: false,
          text: "Drawn, but the corrections didn't fully converge — this is the closest attempt. Check the room counts before using it.",
        });
      }

      let c = json.check;

      if (c?.deferred) {
        setMsg({ ok: true, text: "Rendered. Counting the rooms…" });
        try {
          const vres = await apiFetch("/api/render-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              verifyOnly: true,
              verifyUrl: json.imageUrl || null,
              verifyImage: json.imageUrl ? null : json.image || null,
              bedrooms: targetBeds,
              baths: targetBaths,
              ensuites: targetEns,
              labels: beds.map((r) => r.label).filter(Boolean),
            }),
          });
          const vjson = await apiJson(vres);
          c = vjson.check;
        } catch (e) {
          c = { unchecked: true, reason: `the follow-up count failed — ${e.message}` };
        }
      }
      // Unchecked has no `ok` and no `problems` — test it first or the
      // next branch reads .problems off it and throws.
      if (c?.unchecked || !c) {
        setMsg({
          ok: false,
          text: `Rendered, but the room count was NOT checked${
            c?.reason ? ` — ${c.reason}` : ""
          }. Nothing verified this drawing, so count the bedrooms and bathrooms yourself before it goes to a buyer.`,
        });
      } else if (!c.ok) {
        setMsg({
          ok: false,
          text: `The render doesn't match the deal — ${c.problems.join("; ")}. Press Draw it again, or use the drawing instead.`,
        });
      } else if (!planProblem) {
        setMsg({
          ok: true,
          text: `Rendered from your layout and checked — ${c.seen.bedrooms} bedrooms, ${c.seen.bathrooms} bathrooms, labels intact.`,
        });
      }
    } catch (e) {
      // Put the view back where it was, so a failure doesn't silently
      // look like a no-op.
      if (returnTo === "pretty" && rendered) setMode("pretty");

      // The full error, in the console, always. The banner is a
      // summary; this is what gets pasted into a bug report.
      console.error(`[render-plan] failed while ${step}`, e);

      e.message = `Failed while ${step}: ${e.message}`;
      setMsg({
        ok: false,
        text: /API key|isn't set/i.test(e.message)
          ? "GOOGLE_AI_API_KEY isn't reaching the app — check it's set in Vercel and redeploy."
          : /billing|quota|PERMISSION/i.test(e.message)
          ? `Google rejected it: ${e.message}. Image models need billing enabled on the Cloud project.`
          : /rate limit|RESOURCE_EXHAUSTED|quota/i.test(e.message)
          ? `${e.message}`
          : /aborted due to timeout|TimeoutError/i.test(e.message)
          ? "The render ran past the time limit. Image generation can take a couple of minutes; if this deployment is on Vercel's Hobby plan, functions are capped at 60s and it won't fit. Pro allows 300s — then set RENDER_BUDGET_MS=280."
          : e.message,
      });
    } finally {
      setRendering(false);
    }
  }

  async function makePretty() {
    const beds = rooms.filter(
      (r) => r.room_type === "shared" || r.room_type === "ensuite"
    );
    const targetBeds = deal?.target_bedrooms || beds.length;
    const targetBaths = deal?.target_bathrooms || null;
    const targetEns =
      deal?.target_ensuites ?? beds.filter((r) => r.room_type === "ensuite").length;

    if (!targetBeds || !targetBaths) {
      setMsg({
        ok: false,
        text: "Set target bedrooms and bathrooms on the Record tab first — those are the spec.",
      });
      return;
    }

    setPrettifying(true);
    setMsg(null);
    try {
      // Upload the sketch so the route can read it
      let sketchPath = null;

      if (sketchFile) {
        sketchPath = `sketch/${deal.id}/${Date.now()}-${sketchFile.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage
          .from("deal-documents")
          .upload(sketchPath, sketchFile, {
            upsert: true,
            contentType: sketchFile.type,
          });
        if (error) throw new Error(`Couldn't upload the sketch: ${error.message}`);
      } else if (deal?.floor_plan_url) {
        // floor_plan_url is sometimes a data URL — the sketch is held
        // as base64 in the browser before it reaches storage, and that
        // can be what got saved. Safari's fetch() rejects a data URL
        // with "The string did not match the expected pattern", which
        // is where that error was coming from. Decode it directly.
        let blob;
        const url = deal.floor_plan_url;

        if (url.startsWith("data:")) {
          const [head, b64] = url.split(",");
          const mime = head.match(/data:([^;]+)/)?.[1] || "image/png";
          const bytes = atob(b64 || "");
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          blob = new Blob([arr], { type: mime });
        } else {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blob = await res.blob();
          } catch (e) {
            throw new Error(
              `Couldn't read the stored sketch (${e.message}). Re-upload it on the Sketch tab.`
            );
          }
        }

        if (!blob || blob.size === 0) {
          throw new Error(
            "The stored sketch is empty. Re-upload it on the Sketch tab."
          );
        }

        sketchPath = `sketch/${deal.id}/${Date.now()}-stored.png`;
        const small = await shrink(blob);
        const { error } = await supabase.storage
          .from("deal-documents")
          .upload(sketchPath, small, { upsert: true, contentType: small.type || "image/png" });
        if (error) throw new Error(`Couldn't store the sketch: ${error.message}`);
      } else {
        throw new Error(
          "No assessor sketch on this deal — upload one on the Sketch tab, then try again."
        );
      }

      const res = await apiFetch("/api/design-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sketchPath,
          bedrooms: targetBeds,
          baths: Number(targetBaths),
          ensuites: targetEns,
          sqft: deal?.finished_sqft || deal?.post_reno_sqft || deal?.living_area_sqft,
          labels: beds.map((r) => r.label).filter(Boolean),
        }),
      });
      const json = await apiJson(res);

      // Onto the canvas
      const boxes = json.rooms.map((r) => ({
        kind:
          r.type === "bedroom"
            ? "bed"
            : r.type === "ensuite_bath" || r.type === "bath"
            ? "bath"
            : r.type === "kitchen" || r.type === "dining" || r.type === "common"
            ? "common"
            : r.type,
        label: r.label,
        ensuite: r.type === "ensuite_bath",
        ensuiteOf: r.ensuite_of || null,
        index:
          beds.findIndex((b) => b.label === r.label) >= 0
            ? beds.findIndex((b) => b.label === r.label) + 1
            : undefined,
        x: 30 + (r.x / 100) * (W - 60 - 300) + 300,
        y: 30 + (r.y / 100) * (H - 86),
        w: (r.w / 100) * (W - 60 - 300),
        h: (r.h / 100) * (H - 86),
      }));

      // Mark which bedrooms have an ensuite so the label reads right
      boxes.forEach((b) => {
        if (b.kind !== "bed") return;
        b.ensuite = boxes.some((x) => x.ensuiteOf === b.label);
      });

      const touches = (a, side) =>
        boxes.some((b) => {
          if (b === a) return false;
          const v = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 8;
          const hz = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 8;
          if (side === "left") return v && Math.abs(b.x + b.w - a.x) < 14;
          if (side === "right") return v && Math.abs(b.x - (a.x + a.w)) < 14;
          if (side === "top") return hz && Math.abs(b.y + b.h - a.y) < 14;
          return hz && Math.abs(b.y - (a.y + a.h)) < 14;
        });

      boxes.forEach((r) => {
        const sides = ["top", "right", "bottom", "left"];
        const interior = sides.filter((sd) => touches(r, sd));
        r.door = ["hall", "common"].includes(r.kind) ? null : interior[0] || "bottom";
        r.windows = sides.filter((sd) => !interior.includes(sd)).slice(0, 2);
      });

      setPretty({
        rooms: boxes,
        core: boxes.find((b) => b.kind === "common") || null,
      });
      setMode("pretty");

      setMsg(
        json.valid
          ? {
              ok: true,
              text: `Designed from the sketch — ${json.counts.bedrooms} bedrooms, ${json.counts.bathrooms} bathrooms, exactly to spec.`,
            }
          : {
              ok: false,
              text: `Off spec: ${json.problems.join("; ")}. Press Draw it again.`,
            }
      );
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setPrettifying(false);
    }
  }

  async function saveAsPlan() {
    if (!deal?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "pretty" && rendered) {
        const blob = rendered.startsWith("data:")
          ? dataUrlToBlob(rendered)
          : await (await fetch(rendered)).blob();
        const path = `${deal.id}/plan/plan-bare-${Date.now()}.png`;
        const { error } = await supabase.storage
          .from("deal-photos")
          .upload(path, blob, { upsert: true, contentType: "image/png" });
        if (error) throw error;
        const { data } = supabase.storage.from("deal-photos").getPublicUrl(path);
        await updateDeal(deal.id, { marketed_floor_plan_url: data.publicUrl });

        // The parent holds the deal record. Without this the write
        // lands in the database and the Flyer tab keeps showing the
        // copy it loaded on mount — which reads as "it didn't save."
        await onSaved?.();

        setSavedUrl(data.publicUrl);
        setRendered(data.publicUrl);
        setMsg({ ok: true, text: "Floor plan saved. It stays on this deal and on the flyer." });
        setBusy(false);
        return;
      }
      // The drawn plan is a working document — it prints and downloads,
      // but it never becomes the flyer image. The flyer carries the
      // rendered plan only.
      if (!svgRef.current) throw new Error("Nothing to save.");
      // Reuse the same rasteriser as the render path — one encode
      // routine, one place for it to go wrong.
      const dataUrl = await svgToPng(2);
      const blob = dataUrlToBlob(dataUrl);
      if (!blob || blob.size === 0) {
        throw new Error("The plan came back empty — try switching tabs and back.");
      }

      // Downloaded, not published. The flyer takes the rendered plan.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(deal.address_line || "plan").replace(/[^\w]+/g, "-").toLowerCase()}-drawn-plan.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari reads the blob after the click returns; revoking
      // immediately cancels the download.
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setMsg({
        ok: true,
        text: "Drawn plan downloaded. The flyer uses the rendered plan — switch to Make it pretty and save that.",
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const savedButNoGeometry =
    rooms.length > 0 && !rooms.some((r) => r.plan_w != null);

  if (savedButNoGeometry) {
    return (
      <div className="rounded border-l-4 border-amber-500 bg-amber-50 p-5 text-[13px] leading-relaxed text-amber-900">
        <strong>The saved layout has no room shapes.</strong> Your rooms are stored, but their
        width and height columns are empty — run{" "}
        <code className="rounded bg-amber-100 px-1">008_room_geometry.sql</code> in the Supabase
        SQL editor, then re-save the layout on the Sketch tab.
      </div>
    );
  }

  if (!laid || !laid.rooms?.length) {
    return (
      <div className="rounded border border-dashed border-neutral-300 p-8 text-center text-[12px] text-neutral-500">
        Draw and save a layout on the Sketch tab, or set a target bedroom count on the Record
        tab — either gives this something to render.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded border border-neutral-300 bg-white">
        {mode === "pretty" && rendered && (
          <img
            src={renderedPanelled || rendered}
            alt="Rendered floor plan"
            className="block w-full"
          />
        )}
        <svg
          ref={svgRef}
          style={mode === "pretty" && rendered ? { display: "none" } : undefined} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="block w-full">
          <defs>
            <pattern id="planks" width="30" height="30" patternUnits="userSpaceOnUse">
              <rect width="30" height="30" fill={FLOOR_WOOD} />
              <line x1="0" y1="0" x2="30" y2="0" stroke="#D3C0A0" strokeWidth="0.9" />
            </pattern>
            <pattern id="core" width="34" height="34" patternUnits="userSpaceOnUse">
              <rect width="34" height="34" fill={FLOOR_COMMON} />
              <line x1="0" y1="0" x2="34" y2="0" stroke="#CBB693" strokeWidth="0.9" />
            </pattern>
          </defs>

          <rect width={W} height={H} fill="#FFFFFF" />

          {/* The assessor sketch, behind the rooms that were traced on
              it. Embedded as data rather than linked — a serialised SVG
              can't fetch external images, so a linked one would be
              missing from every export and print. */}
          {mode === "drawn" && sketchData && laid.sketchBox && (
            <image
              href={sketchData}
              xlinkHref={sketchData}
              x={laid.sketchBox.x}
              y={laid.sketchBox.y}
              width={laid.sketchBox.w}
              height={laid.sketchBox.h}
              opacity="0.5"
              preserveAspectRatio="none"
            />
          )}

          {/* Stats panel, as on the printed sheet. Omitted from the
              capture sent to the model: it copies whatever it is shown,
              and a panel in the source produced a duplicate panel in
              the render. */}
          {!capturing && (() => {
            const beds = laid.rooms.filter((r) => r.kind === "bed");
            const bathN = laid.rooms.filter((r) => r.kind === "bath").length;
            const ens = beds.filter((r) => r.ensuite).length;
            const sqft = deal?.finished_sqft || deal?.post_reno_sqft || deal?.living_area_sqft;

            const weekly = grossWeekly;
            const monthly = (weekly * 52) / 12;
            const usdFmt = (n) =>
              n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

            const cx = 26 + 300 / 2;
            return (
              <g fontFamily="Arial, Helvetica, sans-serif">
                {(() => {
                  const raw = (deal?.address_line || "PadSplit").toUpperCase();
                  // Break long addresses rather than running under the plan
                  const words = raw.split(" ");
                  const lines = [];
                  let line = "";
                  for (const w of words) {
                    if ((line + " " + w).trim().length > 16) {
                      lines.push(line.trim());
                      line = w;
                    } else {
                      line = `${line} ${w}`;
                    }
                  }
                  if (line.trim()) lines.push(line.trim());

                  const size = lines.length > 2 ? 20 : lines.length > 1 ? 24 : 28;
                  return lines.slice(0, 3).map((l, i) => (
                    <text
                      key={i}
                      x={cx}
                      y={190 + i * (size + 6)}
                      textAnchor="middle"
                      fontSize={size}
                      fontWeight="800"
                      fill="#1F3A24"
                      letterSpacing="0.4"
                    >
                      {l}
                    </text>
                  ));
                })()}

                <text x={cx} y={268} textAnchor="middle" fontSize="17" fontWeight="600" fill="#2B2B2B">
                  {beds.length} BEDROOMS
                </text>
                <text x={cx} y={296} textAnchor="middle" fontSize="17" fontWeight="600" fill="#2B2B2B">
                  {bathN + ens} BATHROOMS
                </text>
                {sqft && (
                  <text x={cx} y={324} textAnchor="middle" fontSize="17" fontWeight="600" fill="#2B2B2B">
                    {sqft.toLocaleString()} SQFT
                  </text>
                )}

                <line x1={cx - 70} y1={354} x2={cx + 70} y2={354} stroke="#1F3A24" strokeWidth="3" />

                <text x={cx} y={382} textAnchor="middle" fontSize="15" fontWeight="700" fill="#2B2B2B">
                  ESTIMATED GROSS RENT:
                </text>
                <text x={cx} y={418} textAnchor="middle" fontSize="26" fontWeight="800" fill={GREEN}>
                  {usdFmt(monthly)} / MONTH
                </text>

                <text x={cx} y={468} textAnchor="middle" fontSize="15" fontWeight="700" fill="#2B2B2B">
                  YEARLY ESTIMATE:
                </text>
                <text x={cx} y={504} textAnchor="middle" fontSize="26" fontWeight="800" fill={GREEN}>
                  {usdFmt(weekly * 52)} / YEAR
                </text>

                <text x={cx} y={566} textAnchor="middle" fontSize="11" fill="#8A8A8A">
                  This rendering is a representation.
                </text>
                <text x={cx} y={584} textAnchor="middle" fontSize="11" fill="#8A8A8A">
                  Actual layout may vary.
                </text>

                <text x={cx} y={628} textAnchor="middle" fontSize="13" fontWeight="800" fill={GREEN} letterSpacing="1">
                  GREEN LIGHT BUYING MACHINE
                </text>
              </g>
            );
          })()}

          {laid.rooms.map((r, i) => {
            const fill =
              r.kind === "hall"
                ? FLOOR_WOOD
                : r.kind === "bath" || r.kind === "laundry"
                ? FLOOR_TILE
                : r.kind === "kitchen"
                ? FLOOR_STONE
                : r.kind === "garage"
                ? "#EFEDE8"
                : r.kind === "common"
                ? "url(#core)"
                : "url(#planks)";

            return (
              <g key={`${r.kind}-${i}`}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} />
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill="none"
                  stroke={WALL}
                  strokeWidth="4"
                />

                {r.kind === "bed" && (
                  <>
                    <Closet x={r.x} y={r.y} w={r.w} h={r.h} />
                    <Bed
                      x={r.x}
                      y={r.y}
                      w={r.w}
                      h={r.ensuiteBath ? r.h - r.ensuiteBath.h : r.h}
                    />
                    {!r.ensuiteBath && <Desk x={r.x} y={r.y} w={r.w} h={r.h} />}
                  </>
                )}
                {r.kind === "bath" && <Bath x={r.x} y={r.y} w={r.w} h={r.h} />}
                {r.kind === "laundry" && (
                  <g stroke={FURN_LINE} strokeWidth="1.1">
                    {/* Two stacked washer/dryer sets, side by side. */}
                    {[0, 1].map((i) => {
                      const bw = Math.min(46, (r.w - 30) / 2);
                      const bx = r.x + 10 + i * (bw + 8);
                      return (
                        <g key={i}>
                          <rect x={bx} y={r.y + 14} width={bw} height={30} rx="2" fill="#FFFFFF" />
                          <rect x={bx} y={r.y + 46} width={bw} height={30} rx="2" fill="#FFFFFF" />
                          <circle cx={bx + bw / 2} cy={r.y + 29} r="9" fill="#E4E0D8" />
                          <circle cx={bx + bw / 2} cy={r.y + 61} r="9" fill="#E4E0D8" />
                          <text
                            x={bx + bw / 2}
                            y={r.y + 92}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="700"
                            fill="#6B6B6B"
                            stroke="none"
                          >
                            W/D
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}
                {r.kind === "common" && <Common x={r.x} y={r.y} w={r.w} h={r.h} />}
                {r.kind === "kitchen" && <Kitchen x={r.x} y={r.y} w={r.w} h={r.h} />}
                {r.kind === "garage" && <Garage x={r.x} y={r.y} w={r.w} h={r.h} />}

                {r.door && (
                  <Door
                    x={r.x}
                    y={r.y}
                    w={r.w}
                    h={r.h}
                    side={r.door}
                    size={Math.min(30, Math.min(r.w, r.h) * 0.42)}
                  />
                )}
                {r.windows?.map((side) => (
                  <Window key={side} x={r.x} y={r.y} w={r.w} h={r.h} side={side} />
                ))}

                {r.kind === "bed" && (
                  <>
                    <text
                      x={r.x + r.w / 2}
                      y={r.y + r.h - (r.ensuite ? 24 : 13)}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="700"
                      fontFamily="Arial, Helvetica, sans-serif"
                      fill="#1F1F1F"
                    >
                      {r.label}
                    </text>
                    {r.ensuite && (
                      <text
                        x={r.x + r.w / 2}
                        y={r.y + r.h - 9}
                        textAnchor="middle"
                        fontSize="8.5"
                        fontWeight="700"
                        fontFamily="Arial, Helvetica, sans-serif"
                        fill={GREEN}
                      >
                        ENSUITE
                      </text>
                    )}
                  </>
                )}

                {r.kind === "bath" && (
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fill="#1F1F1F"
                  >
                    {r.ensuiteOf ? r.label : `Bath ${r.index}`}
                  </text>
                )}

                {r.kind === "laundry" && (
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h - 10}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fill="#1F1F1F"
                  >
                    Laundry
                  </text>
                )}
              </g>
            );
          })}


          {/* The building's own edge, drawn once and heavier than the
              partitions, with windows set into it. Rooms carry a
              lighter outline so interior walls read as interior. */}
          {(() => {
            const rs = laid.rooms;
            if (!rs.length) return null;

            // The boxed wings are the building. Where they exist, the
            // outline comes from them — a house with an unroomed notch,
            // an L, or a wing still to be laid out has an outline the
            // rooms can't describe.
            // The footprint is the rooms plus anything boxed by hand —
            // not one or the other. Boxing only the unroomed part of
            // the building (a common area, an L notch) previously
            // replaced the whole outline with just that box, and the
            // rest of the house lost its wall.
            const box = laid.sketchBox;
            const boxed =
              box && (deal?.building_areas || []).length
                ? deal.building_areas.map((a) => ({
                    x: box.x + (a.x * box.w) / 100,
                    y: box.y + (a.y * box.h) / 100,
                    w: (a.w * box.w) / 100,
                    h: (a.h * box.h) / 100,
                  }))
                : [];

            const footprint = [...rs, ...boxed];

            // A wall segment is exterior when nothing sits beyond it.
            const outside = (r, side) => {
              const t = 3;
              const probe =
                side === "top"
                  ? { x: r.x + r.w / 2, y: r.y - t }
                  : side === "bottom"
                  ? { x: r.x + r.w / 2, y: r.y + r.h + t }
                  : side === "left"
                  ? { x: r.x - t, y: r.y + r.h / 2 }
                  : { x: r.x + r.w + t, y: r.y + r.h / 2 };
              return !footprint.some(
                (o) =>
                  o !== r &&
                  probe.x > o.x &&
                  probe.x < o.x + o.w &&
                  probe.y > o.y &&
                  probe.y < o.y + o.h
              );
            };

            const windows = [];
            rs.forEach((r, ri) => {
              if (r.kind !== "bed" && r.kind !== "common") return;
              ["top", "bottom", "left", "right"].forEach((side) => {
                if (!outside(r, side)) return;
                const horiz = side === "top" || side === "bottom";
                const len = Math.min(horiz ? r.w * 0.45 : r.h * 0.45, 90);
                if (len < 24) return;
                const cx = r.x + r.w / 2;
                const cy = r.y + r.h / 2;
                windows.push({
                  key: `${ri}-${side}`,
                  x: horiz ? cx - len / 2 : side === "left" ? r.x - 2 : r.x + r.w - 2,
                  y: horiz ? (side === "top" ? r.y - 2 : r.y + r.h - 2) : cy - len / 2,
                  w: horiz ? len : 4,
                  h: horiz ? 4 : len,
                });
              });
            });

            // The outline is the union of the rooms' outer edges, drawn
            // segment by segment — not a box around them. A bounding
            // rectangle squares off an L-shaped house and invents wall
            // where the building has none.
            const edges = [];
            footprint.forEach((r, ri) => {
              ["top", "bottom", "left", "right"].forEach((side) => {
                if (!outside(r, side)) return;
                edges.push({
                  key: `e${ri}-${side}`,
                  x1: side === "right" ? r.x + r.w : r.x,
                  y1: side === "bottom" ? r.y + r.h : r.y,
                  x2: side === "left" ? r.x : r.x + r.w,
                  y2: side === "top" ? r.y : r.y + r.h,
                });
              });
            });

            return (
              <g>
                {edges.map((e) => (
                  <line
                    key={e.key}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                    stroke={WALL}
                    strokeWidth="10"
                    strokeLinecap="square"
                  />
                ))}
                {windows.map((w) => (
                  <rect
                    key={w.key}
                    x={w.x}
                    y={w.y}
                    width={w.w}
                    height={w.h}
                    fill="#BBD4E8"
                    stroke="#7FA6C4"
                    strokeWidth="1"
                  />
                ))}
              </g>
            );
          })()}

          {/* Core labels sit over the furniture, like the printed plan */}
          {laid?.core && (
          <>
          <text
            x={laid.core.x + laid.core.w / 2}
            y={laid.core.y + laid.core.h * 0.17}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="#1F1F1F"
            opacity={mode === "pretty" ? 1 : 0}
          >
            Kitchen
          </text>
          <text
            x={laid.core.x + laid.core.w / 2}
            y={laid.core.y + laid.core.h * 0.62}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="#1F1F1F"
            opacity={mode === "pretty" ? 1 : 0}
          >
            Dining Area
          </text>
          <text
            x={laid.core.x + laid.core.w / 2}
            y={laid.core.y + laid.core.h - 14}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            fill="#1F1F1F"
          >
            {mode === "pretty" ? "Common Area" : "Common / Kitchen"}
          </text>
          </>
          )}

        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
          Draw as
        </span>

        {[
          ["bedrooms", "Bedrooms"],
          ["baths", "Total baths"],
          ["ensuites", "Ensuites"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-600">{label}</span>
            <input
              type="number"
              min="0"
              value={activeSpec[key]}
              onChange={(e) => setSpecField(key)(e.target.value)}
              className="w-14 rounded border border-neutral-300 px-1.5 py-1 text-center text-[13px] font-semibold outline-none focus:border-neutral-900"
            />
          </label>
        ))}

        {activeSpec.ensuites > activeSpec.bedrooms && (
          <span className="text-[11px] font-semibold text-red-700">
            More ensuites than bedrooms
          </span>
        )}
        {/* Baths is the common count; each ensuite adds its own, so
            6 ensuites against 1 common bath is a 7-bath house — which
            is what the plan draws. The old rule treated ensuites as a
            subset and flagged every co-living conversion. */}
        {activeSpec.baths + activeSpec.ensuites > 0 && (
          <span className="text-[11px] text-neutral-500">
            {activeSpec.baths} bath{activeSpec.baths === 1 ? "" : "s"} total
            {activeSpec.ensuites > 0
              ? ` — ${Math.max(0, activeSpec.baths - activeSpec.ensuites)} common + ${activeSpec.ensuites} ensuite`
              : ""}
          </span>
        )}

        {spec && (
          <button
            onClick={() => setSpec(null)}
            className="ml-auto text-[11px] text-neutral-500 underline underline-offset-2"
          >
            Reset to {deal?.target_bedrooms}/{deal?.target_bathrooms}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setMode("drawn")}
            title="Your rooms exactly where you placed them on the sketch"
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold ${
              mode === "drawn"
                ? "text-white"
                : "bg-white text-neutral-600 ring-1 ring-neutral-300"
            }`}
            style={mode === "drawn" ? { backgroundColor: "#1F2937" } : {}}
          >
            As drawn
          </button>

          <button
            onClick={() =>
              // Already showing a render? Draw a new one. Switching to a
              // tab you're on does nothing, which reads as stuck.
              mode === "pretty" || !rendered ? renderPretty() : setMode("pretty")
            }
            disabled={rendering || !hasSketch}
            title={
              hasSketch
                ? "Reads the assessor sketch and draws a finished plan in your reference style"
                : "No assessor sketch on this deal — upload one on the Sketch tab first"
            }
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
              mode === "pretty"
                ? "text-white"
                : "bg-white text-neutral-600 ring-1 ring-neutral-300"
            }`}
            style={mode === "pretty" ? { backgroundColor: GREEN } : {}}
          >
            {rendering
              ? "Drawing…"
              : !hasSketch
              ? "Needs a sketch"
              : mode === "pretty" && rendered
              ? "Draw it again"
              : "Make it pretty"}
          </button>

          <button
            onClick={checkSetup}
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100"
          >
            Check setup
          </button>

          {mode === "pretty" && rendered && (
            <button
              onClick={saveAsPlan}
              disabled={busy || rendering || isSaved}
              title={
                isSaved
                  ? "This render is already saved to the deal"
                  : "Keep this render — it reloads with the deal instead of being redrawn"
              }
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold disabled:opacity-50 ${
                isSaved ? "bg-white text-neutral-500 ring-1 ring-neutral-300" : "text-white"
              }`}
              style={isSaved ? {} : { backgroundColor: GREEN }}
            >
              {busy ? "Saving…" : isSaved ? "Saved ✓" : "Save this render"}
            </button>
          )}
        </div>

        {diag && (
          <div className="w-full rounded border border-neutral-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                Render setup {diag.running ? "— checking…" : "— result"}
              </span>
              <button
                onClick={() => setDiag(null)}
                className="text-[11px] text-neutral-400 hover:text-neutral-700"
              >
                Close
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {diag.steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug">
                  <span className={st.ok ? "text-green-700" : "text-red-700"}>
                    {st.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-neutral-800">
                    {st.name}
                    {st.detail && (
                      <span className="ml-1.5 font-mono text-[11px] text-neutral-500">
                        {st.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!diag.running && (
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(
                    diag.steps
                      .map((st) => `${st.ok ? "PASS" : "FAIL"} ${st.name}${st.detail ? ` — ${st.detail}` : ""}`)
                      .join("\n")
                  )
                }
                className="mt-2 rounded border border-neutral-300 px-2 py-1 text-[10px] font-semibold text-neutral-700"
              >
                Copy result
              </button>
            )}
          </div>
        )}

        {msg && !msg.ok && (
          <div className="w-full rounded border-l-4 border-red-600 bg-red-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-red-900">
              The render didn't finish
            </div>
            <p className="mt-1 font-mono text-[11px] leading-snug text-red-900">
              {msg.text}
            </p>
            <button
              onClick={() => navigator.clipboard?.writeText(msg.text)}
              className="mt-2 rounded border border-red-300 px-2 py-1 text-[10px] font-semibold text-red-800"
            >
              Copy error
            </button>
          </div>
        )}

        <div className="w-full">
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
            Render notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything the drawing can't say. e.g. Keep the kitchen where it is. The carport wall on the street side stays. Bedroom 9 has no window — draw a skylight."
            className="mt-1 w-full resize-y rounded border border-neutral-300 p-2 text-[12px] leading-snug outline-none focus:border-neutral-500"
          />
          <div className="mt-1 text-[10px] text-neutral-400">
            Added to the prompt below the room counts, and saved with this deal.
          </div>
        </div>

        <button
          onClick={saveAsPlan}
          disabled={busy || (mode === "pretty" && rendered && isSaved)}
          className="rounded px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40"
          style={{ backgroundColor: mode === "pretty" && rendered ? GREEN : "#1F2937" }}
        >
          {busy
            ? "Working…"
            : mode !== "pretty" || !rendered
            ? "Download drawn plan"
            : isSaved
            ? "Saved ✓"
            : "Save floor plan"}
        </button>

        {!msg && mode === "pretty" && rendered && (
          <span className="text-[11px] text-neutral-500">
            {isSaved
              ? "This is the saved floor plan for this deal."
              : "Not saved yet — this render is lost if you reload."}
          </span>
        )}

        {msg && (
          <span className={`text-[11px] ${msg.ok ? "text-neutral-600" : "text-red-700"}`}>
            {msg.text}
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-neutral-500">
        <strong>As drawn</strong> follows the sketch exactly — real wall positions and room sizes,
        so use it to check the layout. <strong>Make it pretty</strong> sends the assessor sketch to
        be redrawn as a finished plan, in the style of the reference you set in Settings → Flyer
        defaults. Either can go on the flyer; once the rehab is done and you have a Cubicasa scan,
        upload that instead.
      </p>

    </div>
  );
}

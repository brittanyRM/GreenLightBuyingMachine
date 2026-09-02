// ============================================================
// Marketing floor plan composer.
//
// The flyer plan isn't a tracing of the assessor footprint — it's a
// designed layout: bedrooms ringing a central kitchen and living
// core, baths clustered on a plumbing wall, laundry off the common.
//
// So this composes a plausible plan from the room counts rather
// than stretching whatever boxes were drawn on the sketch. It's
// captioned as a representation, which is exactly what it is.
// ============================================================

export const CANVAS = { W: 1480, H: 760, pad: 26, sidebar: 300 };

// Tuning knobs for how the plan is laid out. Adjust here rather than
// hunting through the drawing code.
export const PLAN_PARAMS = {
  bedroomDepth: 205,     // depth of the left and right bedroom columns
  bottomRowDepth: 185,   // depth of the bottom row
  bathClusterMaxW: 190,
  bathClusterMaxH: 240,
  laundryW: 138,
  laundryH: 120,
  wallWeight: 6,         // exterior and partition wall thickness
  bedFill: 0.62,         // bed as a share of the room's short wall
  closetFill: 0.52,      // closet as a share of the wall it sits on
  furnishCommon: true,   // sectional, coffee table, console, plants
  showPatio: true,
};

export function composePlan({ bedrooms = 9, baths = 4, ensuites = 2, params = {} }) {
  const P = { ...PLAN_PARAMS, ...params };
  const { W, H, pad, sidebar } = CANVAS;
  const L = pad + sidebar;
  const T = pad;
  const R = W - pad;
  const B = H - pad;

  const rooms = [];
  const n = Math.max(1, bedrooms);

  // Split the bedroom count across three bands. Left and right get the
  // deeper rooms; the bottom row carries the remainder.
  const nLeft = Math.ceil(n / 3);
  const nRight = Math.ceil((n - nLeft) / 2);
  const nBottom = n - nLeft - nRight;

  const colW = P.bedroomDepth;
  const rowH = nBottom > 0 ? P.bottomRowDepth : 0;

  // Central core
  const coreX = L + colW;
  const coreY = T;
  const coreW = R - colW - coreX;
  const coreH = B - rowH - coreY;

  let bed = 0;
  const next = () => ++bed;

  // ---- left column, top to bottom ----
  const leftH = (B - rowH - T) / Math.max(1, nLeft);
  for (let i = 0; i < nLeft; i++) {
    rooms.push({
      kind: "bed",
      index: next(),
      x: L,
      y: T + i * leftH,
      w: colW,
      h: leftH,
      door: "right",
      windows: ["left"],
    });
  }

  // ---- right column ----
  const rightH = (B - rowH - T) / Math.max(1, nRight);
  for (let i = 0; i < nRight; i++) {
    rooms.push({
      kind: "bed",
      index: next(),
      x: R - colW,
      y: T + i * rightH,
      w: colW,
      h: rightH,
      door: "left",
      windows: ["right"],
    });
  }

  // ---- bottom row ----
  if (nBottom > 0) {
    const bw = (R - L) / nBottom;
    for (let i = 0; i < nBottom; i++) {
      rooms.push({
        kind: "bed",
        index: next(),
        x: L + i * bw,
        y: B - rowH,
        w: bw,
        h: rowH,
        door: "top",
        windows: ["bottom"],
      });
    }
  }

  // ---- bath cluster on a shared plumbing wall, left of the core ----
  const standalone = Math.max(0, baths - ensuites);
  if (standalone > 0) {
    const clusterW = Math.min(P.bathClusterMaxW, coreW * 0.3);
    const clusterH = Math.min(P.bathClusterMaxH, coreH * 0.44);
    const perRow = standalone > 2 ? 2 : standalone;
    const rowsN = Math.ceil(standalone / perRow);

    for (let i = 0; i < standalone; i++) {
      const rIdx = Math.floor(i / perRow);
      const cIdx = i % perRow;
      rooms.push({
        kind: "bath",
        index: i + 1,
        x: coreX + cIdx * (clusterW / perRow),
        y: coreY + 6 + rIdx * (clusterH / rowsN),
        w: clusterW / perRow,
        h: clusterH / rowsN,
        door: "right",
      });
    }
  }

  // ---- laundry tucked beside the core ----
  rooms.push({
    kind: "laundry",
    x: R - colW - P.laundryW,
    y: coreY + coreH - P.laundryH,
    w: P.laundryW,
    h: P.laundryH,
    door: "left",
  });

  // ---- the core itself, first so it paints beneath the rooms inside it ----
  rooms.unshift({
    kind: "common",
    x: coreX,
    y: coreY,
    w: coreW,
    h: coreH,
    ensuites,
  });

  // Mark which bedrooms are ensuite — the lowest numbers, matching how
  // the room colors run.
  rooms.forEach((r) => {
    if (r.kind === "bed") r.ensuite = r.index <= ensuites;
  });

  // Carve each ensuite bath out of its bedroom. Without this the plan
  // shows fewer bathrooms than the flyer claims, and a buyer counting
  // rooms on the page finds the discrepancy before you do.
  const ensuiteRooms = rooms.filter((r) => r.kind === "bed" && r.ensuite);
  ensuiteRooms.forEach((bedRoom, i) => {
    const onLeft = bedRoom.x < coreX;
    const bw = Math.min(bedRoom.w * 0.42, 92);
    const bh = Math.min(bedRoom.h * 0.34, 86);

    // Against the interior wall, so plumbing runs with the core
    const bx = onLeft ? bedRoom.x + bedRoom.w - bw : bedRoom.x;
    const by = bedRoom.y + bedRoom.h - bh;

    rooms.push({
      kind: "bath",
      ensuiteOf: bedRoom.index,
      label: `Ensuite ${i + 1}`,
      x: bx,
      y: by,
      w: bw,
      h: bh,
      door: onLeft ? "left" : "right",
      windows: [],
    });

    bedRoom.ensuiteBath = { x: bx, y: by, w: bw, h: bh };
  });

  const bedCount = rooms.filter((r) => r.kind === "bed").length;
  const bathCount = rooms.filter((r) => r.kind === "bath").length;

  return {
    rooms,
    core: { x: coreX, y: coreY, w: coreW, h: coreH },
    params: P,
    counts: { bedrooms: bedCount, bathrooms: bathCount },
    // Composed from the counts, so a mismatch here is a bug, not a guess
    valid: bedCount === bedrooms && bathCount === baths,
  };
}

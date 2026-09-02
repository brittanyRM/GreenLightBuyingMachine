// ============================================================
// Layout generator.
//
// Claude reads the sketch and tells us where the blocks are and
// how big they are in feet. This file does the geometry — how to
// carve them into bedrooms and baths.
//
// Splitting rectangles in code rather than asking a model to
// place them means rooms tile cleanly: no overlaps, no gaps, no
// bedroom hanging off the side of the house.
// ============================================================

import { roomName } from "./rooms";

export const LAYOUT_DEFAULTS = {
  minBedroomSqft: 80,      // PadSplit's floor for a rentable room
  targetBedroomSqft: 120,  // what a good room actually runs
  bathSqft: 40,
  ensuiteBathSqft: 35,     // carved out of its bedroom
  commonShare: 0.28,       // kitchen, living, laundry, circulation
};

// Real square footage of a rect. Once a block has been cut, feet_w and
// feet_h still describe the ORIGINAL block — so a remainder that is 72%
// of a wing reported the whole wing's area and pulled bedrooms toward
// it. `_sqft` is carried through every cut instead.
function sqftOf(r) {
  if (Number.isFinite(r?._sqft)) return r._sqft;
  return (r?.feet_w || 0) * (r?.feet_h || 0);
}

// Split a rect into `n` pieces, always cutting the longer side so
// rooms stay squarish instead of degenerating into corridors.
function subdivide(rect, n) {
  if (n <= 1) return [rect];

  const left = Math.floor(n / 2);
  const right = n - left;
  const ratio = left / n;

  const total = sqftOf(rect);
  const aSqft = total * ratio;
  const bSqft = total - aSqft;

  if (rect.w >= rect.h) {
    const cut = rect.w * ratio;
    return [
      ...subdivide({ ...rect, w: cut, _sqft: aSqft }, left),
      ...subdivide({ ...rect, x: rect.x + cut, w: rect.w - cut, _sqft: bSqft }, right),
    ];
  }
  const cut = rect.h * ratio;
  return [
    ...subdivide({ ...rect, h: cut, _sqft: aSqft }, left),
    ...subdivide({ ...rect, y: rect.y + cut, h: rect.h - cut, _sqft: bSqft }, right),
  ];
}

// Carve a strip off one edge — used to reserve common area.
function sliceOff(rect, share, edge = "auto") {
  const side = edge === "auto" ? (rect.w >= rect.h ? "left" : "top") : edge;
  const total = sqftOf(rect);
  const cutSqft = total * share;
  const restSqft = total - cutSqft;

  if (side === "left") {
    const cut = rect.w * share;
    return [
      { ...rect, w: cut, _sqft: cutSqft },
      { ...rect, x: rect.x + cut, w: rect.w - cut, _sqft: restSqft },
    ];
  }
  const cut = rect.h * share;
  return [
    { ...rect, h: cut, _sqft: cutSqft },
    { ...rect, y: rect.y + cut, h: rect.h - cut, _sqft: restSqft },
  ];
}

// ---------- block validation ----------
//
// The vision pass reads dimension labels well and estimates pixel
// positions badly. Blocks come back overlapping each other or
// hanging off the image. Subdividing a bad block just spreads the
// error across nine rooms, so cull first.

function area(r) {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function clampToImage(r) {
  const x = Math.max(0, Math.min(100, r.x));
  const y = Math.max(0, Math.min(100, r.y));
  return {
    ...r,
    x,
    y,
    w: Math.max(0, Math.min(100 - x, r.w)),
    h: Math.max(0, Math.min(100 - y, r.h)),
  };
}

export function sanitizeBlocks(blocks = []) {
  const warnings = [];

  const clamped = blocks
    .map(clampToImage)
    .filter((b) => b.w > 1 && b.h > 1);

  if (clamped.length < blocks.length) {
    warnings.push("Some blocks fell outside the image and were dropped.");
  }

  // Keep the largest block, then accept smaller ones only where they
  // don't substantially sit on top of something already accepted.
  const sorted = [...clamped].sort((a, b) => area(b) - area(a));
  const kept = [];
  let dropped = 0;

  for (const b of sorted) {
    const worstOverlap = kept.reduce(
      (max, k) => Math.max(max, overlapArea(b, k) / Math.max(1e-6, area(b))),
      0
    );
    if (worstOverlap > 0.35) {
      dropped += 1;
      continue;
    }
    kept.push(b);
  }

  if (dropped > 0) {
    warnings.push(
      `${dropped} overlapping block${dropped > 1 ? "s were" : " was"} dropped — the sketch reader placed ${dropped > 1 ? "them" : "it"} on top of another room.`
    );
  }

  return { blocks: kept, warnings };
}

// ============================================================
// generateLayout
//
//   blocks  — from the vision pass. Percent coords on the image
//             plus real dimensions in feet:
//             { label, x, y, w, h, feet_w, feet_h, kind }
//   target  — { bedrooms, bathrooms, ensuites }
// ============================================================
export function generateLayout({ blocks = [], target = {}, options = {} }) {
  const opt = { ...LAYOUT_DEFAULTS, ...options };

  // Hand-drawn areas are deliberate — never cull them. Culling only
  // applies to blocks guessed by the sketch reader.
  const cleaned = options.trustBlocks
    ? { blocks, warnings: [] }
    : sanitizeBlocks(blocks);
  blocks = cleaned.blocks;
  const bedrooms = Number(target.bedrooms) || 0;
  const baths = Number(target.bathrooms) || 0;
  const ensuites = Math.min(Number(target.ensuites) || 0, bedrooms);

  // Covered patios stay outside. Everything else is fair game — the
  // additions are usually where the square footage came from, and the
  // carport or garage is normally the conversion target, not a
  // leftover. Nothing inside the outline gets abandoned.
  const usable = blocks.filter((b) => b.kind !== "patio");

  if (!usable.length || bedrooms === 0) {
    return { rooms: [], warnings: ["Need a footprint and a target bedroom count."] };
  }

  const sqft = sqftOf;
  const totalSqft = usable.reduce((s, b) => s + sqft(b), 0);
  const warnings = [...cleaned.warnings];

  // Reserve common area out of the largest block — kitchen and living
  // belong in the main body of the house, not carved off a bedroom wing.
  const sorted = [...usable].sort((a, b) => sqft(b) - sqft(a));
  const [commonRect, remainderOfLargest] = sliceOff(sorted[0], opt.commonShare);

  const bedroomRects = [remainderOfLargest, ...sorted.slice(1)];
  const bedroomArea = totalSqft * (1 - opt.commonShare);

  // Standalone baths — ensuite baths live inside their bedroom
  const standaloneBaths = Math.max(0, baths - ensuites);

  // Distribute bedrooms across blocks by area.
  //
  // Rounding each block independently and then patching the drift by
  // repeatedly incrementing the single largest block piled every
  // leftover bedroom into one wing while other wings stayed empty.
  // Largest-remainder spreads them the way the areas actually imply.
  const areas = bedroomRects.map((r) => sqft(r) || r.w * r.h);
  const areaTotal = areas.reduce((s, a) => s + a, 0) || 1;

  // A block can't hold more bedrooms than it has floor for.
  const caps = bedroomRects.map((r, i) => {
    const s = sqft(r);
    return s ? Math.max(0, Math.floor(s / opt.minBedroomSqft)) : bedrooms;
  });

  const quotas = areas.map((a) => (a / areaTotal) * bedrooms);
  let allocated = quotas.map((q, i) => Math.min(Math.floor(q), caps[i]));

  const byRemainder = quotas
    .map((q, i) => ({ i, rem: q - Math.floor(q) }))
    .sort((a, b) => b.rem - a.rem);

  let remaining = bedrooms - allocated.reduce((s, n) => s + n, 0);

  while (remaining > 0) {
    let placed = false;
    for (const { i } of byRemainder) {
      if (allocated[i] < caps[i]) {
        allocated[i] += 1;
        remaining -= 1;
        placed = true;
        if (remaining === 0) break;
      }
    }
    if (!placed) {
      // Every block is at capacity and the target still isn't met.
      // Draw them anyway and say so — an undersized room the buyer
      // can see beats a plan that quietly drew seven of nine.
      const biggest = areas.indexOf(Math.max(...areas));
      allocated[biggest] += remaining;
      warnings.push(
        `The footprint is short for ${bedrooms} bedrooms at ${opt.minBedroomSqft} sq ft each — the last ${remaining} ${remaining > 1 ? "are" : "is"} undersized.`
      );
      remaining = 0;
    }
  }
  while (remaining < 0) {
    const idx = allocated.indexOf(Math.max(...allocated));
    if (idx < 0) break;
    allocated[idx] -= 1;
    remaining += 1;
  }

  const rooms = [];
  let bedNum = 0;
  let bathNum = 0;

  // Baths come out of the common area, not out of the bedroom wings.
  // Sizing them as a fraction of a wing produced slivers you couldn't
  // see, which is how a 9/4 ended up drawing as a 9/2.
  let commonArea = commonRect;

  if (standaloneBaths > 0) {
    // A quarter of the common area, split evenly — always visible,
    // always exactly the number the spec asks for.
    const [bathStrip, rest] = sliceOff(commonRect, 0.26);
    commonArea = rest;

    subdivide(bathStrip, standaloneBaths).forEach((r) => {
      bathNum += 1;
      rooms.push({
        type: "bath",
        label: `Bath ${bathNum}`,
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        w: +r.w.toFixed(2),
        h: +r.h.toFixed(2),
      });
    });
  }

  rooms.push({
    type: "common",
    label: "Common / kitchen",
    x: +commonArea.x.toFixed(2),
    y: +commonArea.y.toFixed(2),
    w: +commonArea.w.toFixed(2),
    h: +commonArea.h.toFixed(2),
  });

  bedroomRects.forEach((rect, i) => {
    const count = allocated[i];

    // A block too small to round up to a bedroom used to be dropped
    // silently, leaving a hole in the middle of the footprint. It's
    // still floor area — make it common space so the plan covers the
    // whole building.
    if (count < 1) {
      if (rect.w > 1 && rect.h > 1) {
        rooms.push({
          type: "common",
          label: rect.label ? `Common — ${rect.label}` : "Common",
          x: +rect.x.toFixed(2),
          y: +rect.y.toFixed(2),
          w: +rect.w.toFixed(2),
          h: +rect.h.toFixed(2),
        });
      }
      return;
    }

    const bedArea = rect;
    const blockSqft = sqft(rect) || 0;
    const perRoomSqft = blockSqft ? (blockSqft * 0.8) / count : null;

    subdivide(bedArea, count).forEach((r) => {
      bedNum += 1;
      const isEnsuite = bedNum <= ensuites;
      const thisSqft = sqftOf(r) ? Math.round(sqftOf(r) * 0.8) : null;
      rooms.push({
        type: isEnsuite ? "ensuite" : "shared",
        label: roomName(bedNum),
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        w: +r.w.toFixed(2),
        h: +r.h.toFixed(2),
        est_sqft: thisSqft ?? (perRoomSqft ? Math.round(perRoomSqft) : null),
      });

      if (perRoomSqft && perRoomSqft < opt.minBedroomSqft) {
        warnings.push(
          `${roomName(bedNum)} works out to roughly ${Math.round(perRoomSqft)} sq ft — under the ${opt.minBedroomSqft} sq ft floor.`
        );
      }
    });
  });

  // Each ensuite bedroom gets its bath drawn, so counting rooms on the
  // plan gives the same number the flyer claims.
  const ensuiteBeds = rooms.filter((r) => r.type === "ensuite");
  ensuiteBeds.forEach((bd) => {
    const bw = Math.min(bd.w * 0.4, 14);
    const bh = Math.min(bd.h * 0.34, 12);
    rooms.push({
      type: "bath",
      // Was splitting the colour off "Orange-1". Numbered labels have
      // nothing to split, and naming the bedroom reads better anyway.
      label: `${bd.label} Ensuite`,
      ensuiteOf: bd.label,
      x: +(bd.x + bd.w - bw).toFixed(2),
      y: +(bd.y + bd.h - bh).toFixed(2),
      w: +bw.toFixed(2),
      h: +bh.toFixed(2),
    });
  });

  // Hard clamp. Whatever the allocation produced, the plan cannot leave
  // this function with more bathrooms than the spec asks for.
  const bathRooms = rooms.filter((r) => r.type === "bath");
  if (bathRooms.length > baths) {
    // Drop standalone baths first — an ensuite belongs to its bedroom
    const extra = bathRooms.length - baths;
    const droppable = bathRooms.filter((r) => !r.ensuiteOf).slice(-extra);
    const stillOver = extra - droppable.length;
    const alsoDrop = stillOver > 0 ? bathRooms.filter((r) => r.ensuiteOf).slice(-stillOver) : [];

    [...droppable, ...alsoDrop].forEach((r) => {
      const i = rooms.indexOf(r);
      if (i >= 0) rooms.splice(i, 1);
    });

    // Renumber what's left so labels stay sequential
    let n = 0;
    rooms.forEach((r) => {
      if (r.type === "bath" && !r.ensuiteOf) {
        n += 1;
        r.label = `Bath ${n}`;
      }
    });
  }

  // Nothing may sit outside the building. The blocks define the
  // footprint; a room that escaped one gets pulled back to the union
  // of them rather than hanging off the side of the sketch.
  const bounds = usable.reduce(
    (b, r) => ({
      x0: Math.min(b.x0, r.x),
      y0: Math.min(b.y0, r.y),
      x1: Math.max(b.x1, r.x + r.w),
      y1: Math.max(b.y1, r.y + r.h),
    }),
    { x0: 100, y0: 100, x1: 0, y1: 0 }
  );

  rooms.forEach((r) => {
    const x = Math.max(bounds.x0, Math.min(bounds.x1, r.x));
    const y = Math.max(bounds.y0, Math.min(bounds.y1, r.y));
    r.x = +x.toFixed(2);
    r.y = +y.toFixed(2);
    r.w = +Math.max(0, Math.min(bounds.x1 - x, r.w)).toFixed(2);
    r.h = +Math.max(0, Math.min(bounds.y1 - y, r.h)).toFixed(2);
  });

  const bedTotal = rooms.filter((r) => r.type === "shared" || r.type === "ensuite").length;
  const bathTotal = rooms.filter((r) => r.type === "bath").length;
  if (bedTotal !== bedrooms) {
    warnings.push(`Drew ${bedTotal} bedrooms, spec is ${bedrooms}.`);
  }
  if (bathTotal !== baths) {
    warnings.push(`Drew ${bathTotal} bathrooms, spec is ${baths}.`);
  }

  // Sanity check against the whole house
  const avgSqft = bedroomArea / bedrooms;
  if (avgSqft < opt.minBedroomSqft) {
    warnings.unshift(
      `${bedrooms} bedrooms across ${Math.round(totalSqft)} sq ft averages ${Math.round(avgSqft)} sq ft each. That's tight — consider ${Math.floor(bedroomArea / opt.targetBedroomSqft)} bedrooms.`
    );
  }

  return {
    rooms,
    counts: {
      bedrooms: rooms.filter((r) => r.type === "shared" || r.type === "ensuite").length,
      bathrooms: rooms.filter((r) => r.type === "bath").length,
    },
    warnings: [...new Set(warnings)],
    stats: {
      totalSqft: Math.round(totalSqft),
      bedroomArea: Math.round(bedroomArea),
      avgBedroomSqft: Math.round(avgSqft),
      commonSqft: Math.round(totalSqft * opt.commonShare),
    },
  };
}

// How many bedrooms the footprint actually supports at a given quality.
export function capacityEstimate(totalSqft, opt = LAYOUT_DEFAULTS) {
  const usable = totalSqft * (1 - opt.commonShare);
  return {
    max: Math.floor(usable / opt.minBedroomSqft),
    comfortable: Math.floor(usable / opt.targetBedroomSqft),
  };
}

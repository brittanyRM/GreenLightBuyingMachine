// ============================================================
// Room naming.
//
// Rooms are numbered — Bedroom 1 through Bedroom N — because that
// is what a buyer, a lender and a contractor all expect to read.
//
// The colors below are kept: they still fill the drawn plan and
// give each room a consistent swatch, and older deals were labelled
// with them. They are no longer part of the name.
// ============================================================

export const ROOM_COLORS = [
  { name: "Orange", hex: "#E8833A" },
  { name: "Yellow", hex: "#E5B93C" },
  { name: "Green", hex: "#4A9E5C" },
  { name: "Blue", hex: "#3E7FBF" },
  { name: "Indigo", hex: "#4B4FA8" },
  { name: "Violet", hex: "#8A5AAE" },
  { name: "Gold", hex: "#C9A227" },
  { name: "Silver", hex: "#9AA3AB" },
  { name: "Bronze", hex: "#A87142" },
  { name: "Brass", hex: "#B8945F" },
  { name: "Copper", hex: "#B06A42" },
  { name: "Pearl", hex: "#D9D3C7" },
];

export function roomName(index) {
  return `Bedroom ${index}`;
}

// The old name, kept so historic labels can still be recognised.
export function legacyRoomName(index) {
  const c = ROOM_COLORS[(index - 1) % ROOM_COLORS.length];
  const cycle = Math.floor((index - 1) / ROOM_COLORS.length);
  return cycle === 0 ? `${c.name}-${index}` : `${c.name}${cycle + 1}-${index}`;
}

export function roomColor(index) {
  return ROOM_COLORS[(index - 1) % ROOM_COLORS.length].hex;
}

// "Violet-6" → 6, "Bedroom 6" → 6. Both forms exist in saved deals.
export function roomNumberFromLabel(label = "") {
  const s = String(label);
  const m = s.match(/-(\d+)$/) || s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

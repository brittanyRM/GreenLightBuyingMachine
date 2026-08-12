// ============================================================
// The floor plan render prompt.
//
// Kept in one file, away from the route, because this is the thing
// that actually gets tuned. The route handles images, providers and
// retries; this handles what the drawing should look like.
//
// The house-to-house parts are interpolated. Everything else is the
// Green Light Buying Machine product standard and stays fixed —
// that consistency is the point.
// ============================================================

const usd = (n) =>
  Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function buildRenderPrompt({
  rooms = [],
  bedrooms,
  baths,
  ensuites = 0,
  sqft = null,
  address = null,
  notes = null,
  hasPlan = false,
  hasStyleRef = false,
}) {
  const shared = bedrooms - ensuites;
  const commonBaths = baths - ensuites;
  const title = (address || "PadSplit").toUpperCase();

  // Spell out the exact room list. "Exactly 4 bathrooms, 2 of them
  // ensuite" reads as 4 common plus 2 master to an image model, and it
  // drew five. An enumerated list can't be arithmetic'd wrong.
  // One line per bedroom. A two-line label was being drawn as two
  // rooms — "Ensuite Bedroom 5" appeared beside a separate
  // "Bedroom 5" on the same sheet.
  const bedList = Array.from(
    { length: bedrooms },
    (_, i) => `"Bedroom ${i + 1}"`
  ).join(", ");

  const bathList = [
    ...Array.from({ length: commonBaths }, (_, i) => `"Bath ${i + 1}"`),
    ...Array.from({ length: ensuites }, (_, i) => `"Ensuite Bath ${i + 1}"`),
  ].join(", ");

  // Restyling an existing drawing and designing a new one are
  // different tasks. Asked to "draw a floor plan" the model generates
  // a plausible one; asked to repaint a specific drawing it stays much
  // closer to what it was given.
  if (hasPlan) {
    const notesBlock = notes
      ? "\n## Notes from the person underwriting this property\n\n" +
        notes
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => `- ${l}`)
          .join("\n") +
        "\n"
      : "";

    return `# Repaint this floor plan

You are given a finished floor plan, drawn to scale. Your job is to redraw it as a polished marketing illustration. You are not designing anything — the design is done.

## The rule that matters most

Copy the layout exactly.

- Every room stays in the same place, at the same size, with the same neighbours.
- Every wall stays where it is. Do not straighten, merge, split or move one.
- Do not add a room. Do not remove a room. Do not renumber anything.
- Keep every label exactly as printed, in the same room it is printed in. Each label appears once and only once — two rooms both reading "Bath 1" is an error.
- The building's outline stays identical — same shape, same proportions, same notches and setbacks.
- The footprint is very unlikely to be a rectangle. These are 1960s houses with additions, converted carports and rear extensions, so the outline steps in and out. Trace the silhouette you were given edge for edge. Squaring it off into a neat rectangle invents floor area that does not exist and is the single most common way this goes wrong.

If a room looks oddly placed or a wall looks awkward, leave it. It is a real building and the layout has been agreed with the buyer. Your only job is to make it look good.

## What to add

Take the plain drawing and finish it:

- Light warm oak plank flooring in bedrooms and living space; pale grey tile in bathrooms and laundry; light stone in the kitchen.
- Furnish each bedroom: queen bed with two nightstands, a desk and chair, a reach-in closet, a small plant. Repeat the same furniture set in every bedroom.
- Bathrooms: shower, toilet, vanity.
- Kitchen: counter run with two full-height refrigerators side by side, a range with a built-in microwave above, a dishwasher beside the sink, an island with seating.
- Laundry: two stacked washer-and-dryer sets side by side, each labelled W/D.
- Common area: cream sofa and loveseat, coffee table, rug, dining table with eight green chairs, potted plants. No television.
- Walls as solid black outlines, thicker on the exterior than inside. Door swings as quarter-circle arcs. Windows as pale blue bars in the exterior walls.

## Door clearance is a hard requirement

Every bedroom door must be shown in its fully open 90 degree position. Design and furnish each bedroom assuming the door is open. No bed, desk, dresser, closet or other furniture may overlap the door swing or prevent the door from opening fully. Maintain a clear path from the bedroom doorway to the bed and the closet. Do not place furniture based only on the closed-door position.

Each bedroom must have a realistic entry door with a visible door swing. Before finalising the layout, test every bedroom with its door fully open. The door must open without hitting the bed, desk, dresser, closet or another door. Beds and desks must remain usable while the bedroom door is fully open.

A door opens onto the common area or a hallway, never into cabinetry or an appliance.

How to draw a door, exactly:
- A gap in the wall the width of the door.
- The leaf drawn as a thin rectangle standing at 90 degrees to the wall, hinged at one edge of the gap.
- A thin quarter-circle arc from the free end of the leaf back to the closed position, showing the sweep.
That is the whole convention. A flat slab lying across the opening, a rectangle drawn inside the room, or a gap with no leaf and no arc all read as a mistake.

Kitchen counters stop short of any doorway. The run of cabinets must not sit where a door swings — the laundry and the rooms beside the kitchen need their doors to open into clear floor, so end the counter before the opening rather than running it past.

## Nothing else on the sheet

No marketing panel, no address, no rent figures, no bedroom or bathroom counts, no logo, no compass, no scale bar, no dimensions. The plan alone on white — the details are added outside the image, and a panel drawn here appears twice on the finished sheet.

Never write "Carport", "Garage", "Parking", "Storage" or "Master" anywhere.
${notesBlock}

## Before you finish

Two things decide whether this sheet is usable:

1. The outline. Does your building have the same shape as the drawing — the same arms, notches and setbacks? If you have squared it into a rectangle, redraw it.
2. The rooms. Same number, same places, same labels.

Put the drawing you were given beside your version. Same number of rooms, same positions, same labels? If any room has moved, gained a neighbour or changed size, correct it. There must be ${bedrooms} rooms with a bed and ${baths} rooms with a toilet — the same ones, in the same places, as the drawing.

Return the floor plan image.`;
  }

  return `# Green Light Buying Machine PadSplit Floor Plan

You are creating a professional architectural marketing floor plan for Green Light Buying Machine. The output must match the visual style, furniture placement, rendering quality, proportions, and common-area design of the reference floor plan${
    hasStyleRef ? " provided" : " described below"
  }. The reference is the design standard — treat it as a template, not as inspiration.

## What each image is

${
  hasPlan
    ? `- **The zoning plan** — the approved room layout, drawn to scale on the assessor sketch. Bedroom, bathroom and common positions are decided. Reproduce this arrangement room for room.\n`
    : ""
}- **The assessor sketch** — the county drawing. It fixes the exterior walls, the overall footprint, the patio location, the carport location, and the room zones. Do not alter any of them.
${hasStyleRef ? "- **The style reference** — look only. Never take layout from it.\n" : ""}
Only the interior is yours to design.

## The conversion

This is a PadSplit. Every bedroom is rented separately, with a shared kitchen, common area and laundry.

- The carport, the garage and any enclosed addition become conditioned living space and are drawn as bedrooms. Their footprint and position stay exactly where the sketch puts them — it is the use that changes, not the outline.
- The words "Carport", "Garage", "Parking" and "Storage" must not appear anywhere on the sheet, and no part of the plan may be drawn as an open vehicle bay. That floor area is bedrooms now — converting it is the point of the deal, and a sheet showing a garage tells a buyer the opposite.
- A covered patio stays a covered patio. It is outdoor space, it is not in the square footage, and no bedroom is drawn on it.
- Every bedroom sits inside the exterior walls, has a door to a hallway or the common area, a window, and a closet. No bedroom opens through another bedroom.
- Door clearance is a hard requirement. Draw every bedroom door in its fully open 90 degree position and furnish the room around it. No bed, desk, dresser or closet may overlap the swing, and the path from the doorway to the bed and closet stays clear. A door may not hit another door. Move the door along the wall or hinge it the other way rather than drawing it into a cabinet.
- Use every square foot. No blank areas, no unlabelled voids, no gaps between rooms.

## Counts — these are not negotiable

The plan contains these rooms with a bed, and no others — ${bedrooms} in total:

${bedList}

Every bedroom label is a single line — the word Bedroom and its number, nothing else. Which bedrooms are ensuite is shown by the bathrooms, not by the bedroom names.

Use the word "Ensuite". Never write "Master" anywhere on the sheet — these are separately rented rooms in a co-living house, not primary suites, and the style reference is wrong on this point.

${(() => {
  const pairs = rooms
    .filter((r) => r.room_type === "bath" && r.serves_label)
    .map((r) => `- ${r.label} opens only from ${r.serves_label}. It has no door to the hallway.`);
  return pairs.length
    ? `Ensuite pairings — these are decided, not for you to infer from position:\n\n${pairs.join("\n")}\n\n`
    : "";
})()}${(() => {
  const service = rooms.filter((r) =>
    ["kitchen", "laundry", "garage", "common"].includes(r.room_type)
  );
  return service.length
    ? `Named service rooms, drawn and labelled where the plan puts them:\n\n${service
        .map((r) => `- ${r.label}`)
        .join("\n")}\n\n`
    : "";
})()}The plan contains these rooms with a toilet, and no others — ${baths} in total:

${bathList}

- ${baths} is the complete bathroom count. The ${ensuites} ensuite bath${ensuites === 1 ? "" : "s"} ${ensuites === 1 ? "is" : "are"} included in it, not added to it. Drawing ${commonBaths} common baths plus ${ensuites} ensuite baths gives ${baths} — that is the whole set. A ${baths + 1}th bathroom is wrong.
- Every room label appears exactly once. Two rooms both labelled "Bath 1" is an error.
- Every enclosed room on the sheet carries a label. An unnamed room with a toilet in it is still a bathroom and still counts — there must be no unlabelled rooms anywhere.
- No leftover floor. Every part of the interior belongs to a labelled room, a hallway, or the common area. A large blank area with no furniture and no name means the plan is unfinished — give the space to the rooms around it.
- Do NOT print room dimensions. Written measurements have to agree with the assessor sketch and they never do — an earlier render labelled a bedroom 14' x 6'. Room names only.

## Common areas are the brand

The shared spaces should look like they came from the same architectural plan regardless of the house. A viewer should recognise every Green Light Buying Machine rendering as part of one product line.

**Kitchen** — the visual centrepiece. U-shaped or L-shaped peninsula as space allows, quartz over grey stone counters, white cabinetry, peninsula seating with four stools, open sightlines into dining. Two full-height refrigerators drawn side by side as a matching pair — nine members need both — plus a range with a built-in microwave above it and a dishwasher beside the sink.

**Dining** — one large rectangular wood table, eight matching green chairs, centred, open to the kitchen, same spacing and wood finish as the reference.

**Living** — cream sofa, matching loveseat, rectangular coffee table, area rug, a console table against the wall, potted plants, open circulation around the furniture. Keep the arrangement almost identical to the reference. No television and no media wall — members rent rooms and the shared space stays sparse.

**Laundry** — a separate room with two stacked washer-and-dryer sets side by side, each stack labelled W/D. Counter, storage, neutral tile. Nine members share it; one machine is wrong.

**Patio** — outdoor dining table, modern chairs, plants, clean simple styling.

**Bedrooms** — repeated, not individually designed. Each one: queen bed, two matching nightstands, desk, office chair, closet, small plant, identical bedding and furniture style throughout.

**Bathrooms** — shower, toilet, vanity, same fixtures and materials as the reference. Ensuite baths attach to their bedroom and open only from it.

**Closets** — simple reach-in, same style as the reference, labelled.

## Materials and palette

Light natural oak plank flooring. Grey tile in bathrooms and laundry. Grey stone countertops. White background. Forest green accents. Warm beige furniture. Black wall outlines. Soft shadows. Modern, warm, minimal, neutral — no bright colours.

## Rendering style

Perfectly top-down orthographic view. Professional homebuilder marketing rendering. Photorealistic furniture, realistic shadows, crisp black wall outlines, white background, a subtle drop shadow beneath the house, warm natural lighting. A premium builder brochure.

Not a blueprint. Not a CAD drawing. Not isometric. It should read as a luxury real estate marketing floor plan.

Label every room in bold black sans-serif, centred inside the room.

## No text panel

Draw the floor plan and nothing else. No marketing panel, no address block, no rent figures, no logo, no compass rose, no scale bar, no title.

The plan sits on a plain white background with a little breathing room around it. The property details are added afterwards, outside the image — a panel drawn here would be duplicated and would carry the spelling mistakes that come with generated text.

## Before you finish

Ask of every shared space: would this look like it belongs in the same brochure as the reference? If not, redraw it until it does. Only the footprint, bedroom layout, bathrooms and hallway routing change from house to house.

Then count the rooms with a toilet in them. There must be ${baths}: ${bathList}. If there is a ${
    baths + 1
  }th, delete it and give the space to the room beside it.

Then count the rooms with a bed in them. There must be ${bedrooms}: ${bedList}.

Read every label back. No label appears twice.

Return the floor plan image.`;
}

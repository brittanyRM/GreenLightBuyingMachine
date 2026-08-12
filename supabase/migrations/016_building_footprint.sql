-- The building's footprint, as boxed on the sketch.
--
-- The exterior outline was inferred from the rooms, which only works
-- where rooms exist. A house with an L, a notch, a rear extension or
-- an area not yet filled with rooms came out square — and the render
-- copied the square.
--
-- "Draw building areas" already captures the wings. This keeps them.

alter table deals
  add column if not exists building_areas jsonb;

comment on column deals.building_areas is
  'Array of {x,y,w,h} in percent of the sketch image — the building wings, boxed by hand. Used as the exterior outline.';

-- Free-text direction for the floor plan renderer, kept per deal.
--
-- Every house has something the prompt can't know in advance — a wall
-- that has to stay, a bedroom that can't take a window, the fact that
-- the carport is only half convertible. Typing it once per deal beats
-- editing the route.

alter table deals
  add column if not exists render_notes text;

comment on column deals.render_notes is
  'Operator instructions appended to the floor plan render prompt. Highest priority after the room counts.';

-- Store the full room rectangle, not just its center.
--
-- plan_x/plan_y alone lose the shape: a 32-foot bedroom and a
-- closet reload as identical boxes. The flyer only needs a point
-- to hang a label on, but the sketch editor needs the rectangle.

alter table deal_rooms
  add column if not exists plan_w numeric(5,2),
  add column if not exists plan_h numeric(5,2);

comment on column deal_rooms.plan_x is 'Left edge, percent of sketch width';
comment on column deal_rooms.plan_y is 'Top edge, percent of sketch height';
comment on column deal_rooms.plan_w is 'Width, percent of sketch width';
comment on column deal_rooms.plan_h is 'Height, percent of sketch height';

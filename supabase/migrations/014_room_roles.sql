-- Room roles, and which bedroom a bathroom serves.
--
-- Two gaps showed up on a marked-up assessor sketch:
--
-- 1. The vocabulary was shared | ensuite | bath | common. A sketch
--    that labels a kitchen, a laundry and an attached garage had
--    nowhere to put them, so they were drawn as "common" or left off.
--
-- 2. An ensuite was inferred from geometry — a bath drawn inside a
--    bedroom. Real plans put the ensuite next to its bedroom, sharing
--    a wall and a door, and there is no way to tell from position
--    alone which of two adjacent baths belongs to which bedroom.
--    So the link is recorded rather than guessed.

alter table deal_rooms
  add column if not exists serves_label text;

comment on column deal_rooms.serves_label is
  'For a bathroom: the label of the bedroom it opens from. Null means a common bathroom.';

comment on column deal_rooms.room_type is
  'shared | ensuite | bath | common | kitchen | laundry | garage';

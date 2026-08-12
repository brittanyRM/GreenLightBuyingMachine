-- Rename colour-coded rooms to plain numbers.
--
-- "Orange-1" becomes "Bedroom 1", "Violet-6" becomes "Bedroom 6".
-- The trailing number in the old label is the room number, so the
-- rename is exact rather than a re-sequencing.
--
-- Colours are still used to fill the drawn plan; they are just no
-- longer part of the name.

-- Preview first:
--   select label, 'Bedroom ' || substring(label from '-(\d+)$') as new_label
--     from deal_rooms
--    where room_type in ('shared','ensuite') and label ~ '-\d+$';

update deal_rooms
   set label = 'Bedroom ' || substring(label from '-(\d+)$')
 where room_type in ('shared', 'ensuite')
   and label ~ '-\d+$';

-- Bathrooms point at the bedroom they open from, so those references
-- have to move with the rename or the ensuite pairings break.
update deal_rooms
   set serves_label = 'Bedroom ' || substring(serves_label from '-(\d+)$')
 where serves_label is not null
   and serves_label ~ '-\d+$';

-- Anything left on the old scheme after this needs looking at by hand.
do $$
declare
  remaining int;
begin
  select count(*) into remaining
    from deal_rooms
   where room_type in ('shared','ensuite') and label ~ '-\d+$';

  if remaining > 0 then
    raise notice '% room(s) still carry a colour label — rename those by hand.', remaining;
  end if;
end $$;

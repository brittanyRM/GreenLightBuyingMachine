-- Per-room operating cost, replacing the four flat utility lines.
--
-- WiFi, cleaners, water, sewer, trash and power were four fixed
-- monthly figures totalling $1,115 regardless of room count — the
-- same bill for a 5 bed as for a 9. All of it scales with occupants,
-- so it is charged per room per month.

insert into org_assumptions (key, value, label, unit, notes)
values ('opex_per_room', 110, 'WiFi, cleaners, W/S/T, utilities', 'currency', 'per room per month')
on conflict (key) do update
  set value = excluded.value,
      label = excluded.label,
      unit  = excluded.unit,
      notes = excluded.notes;

-- The old keys are no longer read. Left in place rather than deleted
-- so any saved deal-level override still resolves instead of erroring.
update org_assumptions
   set notes = 'superseded by opex_per_room'
 where key in ('util_power', 'util_wst', 'util_wifi', 'util_cleaning');

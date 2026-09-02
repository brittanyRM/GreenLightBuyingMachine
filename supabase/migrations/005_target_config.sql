-- Target configuration — the conversion you're underwriting to,
-- recorded at intake before the layout is drawn.
--
-- `bedrooms` stays the source of truth from the sketch. These are
-- the plan; the sketch is the fact. The deal page flags a gap.

alter table deals
  add column if not exists target_bedrooms int,
  add column if not exists target_bathrooms numeric(3,1),
  add column if not exists target_ensuites int;

comment on column deals.target_bedrooms is
  'Planned bedroom count after conversion. deals.bedrooms is what was actually drawn.';

-- Bedrooms and bathrooms were declared NOT NULL, but bedrooms is
-- written by the sketch, not the intake form — so a new deal has no
-- value for it yet. Default to 0 and let the layout fill it in.
alter table deals alter column bedrooms drop not null;
alter table deals alter column bedrooms set default 0;
alter table deals alter column bathrooms drop not null;

update deals set bedrooms = 0 where bedrooms is null;

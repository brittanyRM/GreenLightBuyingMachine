-- Flyer assets: interior finishes, photo gallery, and the marketed
-- floor plan (the rendered one, not the assessor sketch).

alter table deals
  add column if not exists finishes jsonb default '[]'::jsonb,
  add column if not exists marketed_floor_plan_url text,
  add column if not exists total_sqft_measured numeric(8,1);

comment on column deals.finishes is
  'Array of {label, image_url, spec} — flooring, shower walls, paint, cabinets.';
comment on column deals.marketed_floor_plan_url is
  'Rendered floor plan for the flyer. deals.floor_plan_url is the assessor sketch.';

-- Standard GLBM finish schedule. Image URLs get filled per deal.
create table if not exists finish_library (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  spec text,
  image_url text,
  sort_order int not null default 0,
  is_default boolean not null default true
);

alter table finish_library enable row level security;
drop policy if exists team_all_finish_library on finish_library;
create policy team_all_finish_library on finish_library
  for all to authenticated using (true) with check (true);
drop policy if exists public_read_finish_library on finish_library;
create policy public_read_finish_library on finish_library
  for select to anon using (true);

insert into finish_library (label, spec, sort_order) values
  ('Interior Flooring', null, 1),
  ('Shower Walls', null, 2),
  ('Shower Floors', null, 3),
  ('Interior Paint', 'Milk Glass DEW358', 4),
  ('Cabinets', null, 5),
  ('Countertops', null, 6)
on conflict do nothing;

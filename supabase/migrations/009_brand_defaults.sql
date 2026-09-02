-- Brand defaults.
--
-- The finish schedule, the standard hero, and the flyer copy are the
-- same on every deal. Set them once; a deal only overrides what's
-- actually different about that property.

create table if not exists org_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  label text,
  updated_at timestamptz not null default now()
);

alter table org_settings enable row level security;

drop policy if exists team_all_org_settings on org_settings;
create policy team_all_org_settings on org_settings
  for all to authenticated using (true) with check (true);

-- Buyer links render without a session, so the defaults must be readable
drop policy if exists public_read_org_settings on org_settings;
create policy public_read_org_settings on org_settings
  for select to anon using (true);

insert into org_settings (key, label, value) values
  ('default_hero', 'Standard hero photo', '{}'::jsonb),
  ('default_finishes', 'Standard finish schedule', '[]'::jsonb),
  ('default_gallery', 'Standard interior gallery', '[]'::jsonb),
  ('flyer_copy', 'Standard flyer copy', jsonb_build_object(
    'features', jsonb_build_array(
      'Fully Renovated to Green Light Buying Machine Standards',
      'Fully Furnished',
      'Launched on PadSplit Platform',
      'Digital Smart Locks',
      'High-Speed Internet Installed',
      'Kitchen Fully Equipped',
      'Laundry Room Complete'
    ),
    'about', 'Designed specifically for the growing co-living market, this home provides investors with a professionally renovated, fully furnished, income-producing asset that eliminates months of planning, construction, furnishing, and onboarding.',
    'closing', 'Simply close and begin operating.'
  ))
on conflict (key) do nothing;

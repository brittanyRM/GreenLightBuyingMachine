-- Green Light Buying Machine — Deal Pro Forma schema
-- Powers the buyer pro forma, deal flyer, and floor plan labeling.

-- ============================================================
-- 1. DEALS — one row per property
-- ============================================================
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                    -- 819-n-pioneer-mesa
  status text not null default 'underwriting',  -- underwriting | acquiring | rehab | launching | for_sale | sold
  visibility text not null default 'private',   -- private | buyer_link | public

  -- Location
  address_line text not null,
  city text not null,
  state text not null default 'AZ',
  zip text not null,                            -- joins to padsplit_market
  county text,
  latitude numeric(10,7),
  longitude numeric(10,7),

  -- Public record (assessor / title pull)
  parcel_number text,
  subdivision text,
  legal_description text,
  year_built int,
  lot_sqft int,
  lot_acres numeric(6,3),
  living_area_sqft int,                         -- assessor record
  added_sqft int default 0,                     -- square footage added in rehab
  post_reno_sqft int,                           -- marketed sq ft
  construction_type text,
  roof_material text,
  zoning text,
  school_district text,
  legal_class text,
  assessed_tax_amount numeric(12,2),            -- last known bill (often owner-occupied)

  -- Configuration
  bedrooms int not null,
  bathrooms numeric(3,1) not null,
  ensuite_count int not null default 0,

  -- Acquisition
  purchase_price numeric(12,2),
  rehab_budget numeric(12,2) default 0,
  furniture_budget numeric(12,2) default 0,
  list_price numeric(12,2),                     -- turnkey price to buyer
  close_of_escrow date,
  disposition_coe date,

  -- Assumption overrides. Null keys fall back to org defaults.
  assumptions jsonb not null default '{}'::jsonb,

  -- Media
  hero_image_url text,
  floor_plan_url text,
  gallery jsonb default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_zip_idx on deals(zip);
create index if not exists deals_status_idx on deals(status);

-- ============================================================
-- 2. DEAL_ROOMS — drives the revenue stack AND the floor plan
-- ============================================================
create table if not exists deal_rooms (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,

  room_number int not null,                     -- Bedroom 1..N
  label text,                                   -- "Bedroom 5"
  room_type text not null default 'shared',     -- shared | ensuite
  bath_label text,                              -- "Bath 4 Ensuite" / "Bath 1"

  weekly_rate numeric(10,2),                    -- null = use market rate for zip
  rate_source text default 'market',            -- market | manual | actual_listing
  premium_note text,                            -- "corner room, private entry"

  -- Floor plan overlay: percent coordinates on floor_plan_url (0-100)
  plan_x numeric(5,2),
  plan_y numeric(5,2),

  -- Post-launch actuals
  is_occupied boolean default false,
  padsplit_room_id text,

  created_at timestamptz not null default now(),
  unique (deal_id, room_number)
);

create index if not exists deal_rooms_deal_idx on deal_rooms(deal_id);

-- ============================================================
-- 3. PADSPLIT_MARKET — cached market pull, keyed by ZIP
-- ============================================================
create table if not exists padsplit_market (
  zip text primary key,
  metro text,
  active_units int,
  upcoming_units int,
  shared_weekly numeric(10,2),
  private_weekly numeric(10,2),
  avg_occupancy numeric(4,3),                   -- 0.730
  days_to_first_booking int,
  days_to_80_percent int,
  source_url text,
  fetched_at timestamptz not null default now()
);

-- ============================================================
-- 4. DEAL_COMPS — MLS comps behind the resale chart
-- ============================================================
create table if not exists deal_comps (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  mls_number text,
  address text,
  comp_status text not null,                    -- closed | pending | active | ucb
  list_price numeric(12,2),
  sold_price numeric(12,2),
  sold_date date,
  approx_sqft int,
  price_per_sqft numeric(10,2),
  adom int,
  cdom int,
  created_at timestamptz not null default now()
);

create index if not exists deal_comps_deal_idx on deal_comps(deal_id, comp_status);

-- ============================================================
-- 5. ORG_ASSUMPTIONS — the GLBM default underwriting sheet
-- ============================================================
create table if not exists org_assumptions (
  key text primary key,
  value numeric(10,4) not null,
  label text not null,
  unit text not null default 'percent',         -- percent | currency | years | ratio
  notes text,
  updated_at timestamptz not null default now()
);

insert into org_assumptions (key, value, label, unit, notes) values
  ('vacancy_rate',        0.05,  'Vacancy rate',            'percent',  'GLBM underwriting standard'),
  ('appreciation_rate',   0.05,  'Appreciation rate',       'percent',  null),
  ('management_fee',      0.08,  'Property management fee', 'percent',  'of collected rent'),
  ('padsplit_fee',        0.08,  'PadSplit platform fee',   'percent',  'of collected rent'),
  ('maintenance_rate',    0.02,  'Maintenance / R&M',       'percent',  'of collected rent'),
  ('ltv',                 0.75,  'Loan to value',           'percent',  'DSCR product'),
  ('interest_rate',       0.075, 'Interest rate',           'percent',  null),
  ('loan_term_years',     30,    'Loan term',               'years',    null),
  ('origination_points',  0.02,  'Origination points',      'percent',  null),
  ('closing_costs',       6500,  'Closing costs',           'currency', null),
  ('depreciation_years',  27.5,  'Depreciation schedule',   'years',    'residential'),
  ('building_ratio',      0.80,  'Building basis ratio',    'percent',  'land excluded from depreciation'),
  ('util_power',          425,   'Power',                   'currency', 'per month'),
  ('util_wst',            275,   'Water / sewer / trash',   'currency', 'per month'),
  ('util_wifi',           95,    'WiFi',                    'currency', 'per month'),
  ('util_cleaning',       320,   'Cleaning 2x/month',       'currency', 'per month'),
  ('insurance_annual',    2400,  'Insurance',               'currency', 'per year'),
  ('tax_reclass_factor',  2.35,  'Tax reclass multiplier',  'ratio',    'owner-occupied bill to rental estimate')
on conflict (key) do nothing;

-- ============================================================
-- 6. PRO_FORMA_SNAPSHOTS — what a buyer actually saw, and when
-- ============================================================
create table if not exists pro_forma_snapshots (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  scenario text not null default 'glbm',        -- glbm | market | custom
  inputs jsonb not null,
  outputs jsonb not null,
  sent_to_contact_id uuid,                      -- deal_contacts.id (FK added in 002)
  share_token text unique,
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_deal_idx on pro_forma_snapshots(deal_id);

-- ============================================================
-- Convenience view: deal + market + room mix
-- ============================================================
create or replace view deal_summary as
select
  d.*,
  m.active_units,
  m.upcoming_units,
  m.shared_weekly,
  m.private_weekly,
  m.avg_occupancy,
  m.days_to_first_booking,
  m.days_to_80_percent,
  m.fetched_at as market_fetched_at,
  (select count(*) from deal_rooms r where r.deal_id = d.id and r.room_type = 'ensuite') as rooms_ensuite,
  (select count(*) from deal_rooms r where r.deal_id = d.id and r.room_type = 'shared')  as rooms_shared,
  (select coalesce(sum(coalesce(r.weekly_rate,
      case when r.room_type = 'ensuite' then m.private_weekly else m.shared_weekly end)), 0)
   from deal_rooms r where r.deal_id = d.id) as gross_weekly_rent
from deals d
left join padsplit_market m on m.zip = d.zip;

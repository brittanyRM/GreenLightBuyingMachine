-- Green Light Buying Machine — documents, storage, and access policies
-- Run after 001_deals_schema.sql

-- ============================================================
-- DEAL_DOCUMENTS — every artifact generated for a deal
-- ============================================================
create table if not exists deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,

  doc_type text not null,
  -- loan_request | pro_forma | flyer | comps_package | assessor_record
  -- | market_snapshot | floor_plan | closing_statement | scope_of_work

  version int not null default 1,
  title text not null,
  storage_path text,                            -- bucket path in Supabase Storage
  public_url text,
  file_type text,                               -- pdf | png | docx | html
  file_size_bytes bigint,

  -- What the doc was generated from, so a sent version can be reproduced
  source_snapshot jsonb,

  generated_by text,                            -- auth.users id or 'system'
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  unique (deal_id, doc_type, version)
);

create index if not exists deal_documents_deal_idx on deal_documents(deal_id, doc_type);

-- Latest version of each doc type per deal
drop view if exists deal_documents_current cascade;
create or replace view deal_documents_current as
select distinct on (deal_id, doc_type) *
from deal_documents
order by deal_id, doc_type, version desc;

-- ============================================================
-- DEAL_CONTACTS — buyers on the distribution list
-- ============================================================
create table if not exists deal_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  entity_name text,
  buyer_status text not null default 'active',  -- active | paused | inactive
  markets text[] default '{}',                  -- ZIPs or metros they buy in
  min_price numeric(12,2),
  max_price numeric(12,2),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DEAL_OUTREACH — who got sent what, and what happened
-- ============================================================
create table if not exists deal_outreach (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  contact_id uuid references deal_contacts(id) on delete set null,
  channel text not null default 'email',        -- email | sms | call
  subject text,
  body text,
  documents uuid[] default '{}',                -- deal_documents ids attached
  status text not null default 'draft',         -- draft | sent | opened | replied | passed | committed
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  follow_up_sent_at timestamptz,
  outcome_note text,
  created_at timestamptz not null default now()
);

-- Safety net: if this table already exists from a partial run, the
-- create above is skipped and the column would be missing.
alter table deal_outreach
  add column if not exists follow_up_sent_at timestamptz;

create index if not exists deal_outreach_deal_idx on deal_outreach(deal_id, status);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('deal-sketches', 'deal-sketches', false),
  ('deal-documents', 'deal-documents', false),
  ('deal-photos', 'deal-photos', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- Internal team reads/writes everything. Buyers see only what
-- was shared with them, via a snapshot share token.
-- ============================================================
alter table deals enable row level security;
alter table deal_rooms enable row level security;
alter table deal_comps enable row level security;
alter table deal_documents enable row level security;
alter table deal_contacts enable row level security;
alter table deal_outreach enable row level security;
alter table pro_forma_snapshots enable row level security;
alter table padsplit_market enable row level security;
alter table org_assumptions enable row level security;

-- Authenticated team members: full access
do $$
declare t text;
begin
  foreach t in array array[
    'deals','deal_rooms','deal_comps','deal_documents',
    'deal_contacts','deal_outreach','pro_forma_snapshots',
    'padsplit_market','org_assumptions'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      'team_all_' || t, t
    );
  end loop;
end $$;

-- Anonymous buyer links: read a single snapshot by token.
create policy snapshot_public_read on pro_forma_snapshots
  for select to anon
  using (share_token is not null);

create policy deals_public_read on deals
  for select to anon
  using (visibility in ('buyer_link', 'public'));

create policy deal_rooms_public_read on deal_rooms
  for select to anon
  using (exists (
    select 1 from deals d
    where d.id = deal_rooms.deal_id
      and d.visibility in ('buyer_link','public')
  ));

create policy deal_comps_public_read on deal_comps
  for select to anon
  using (exists (
    select 1 from deals d
    where d.id = deal_comps.deal_id
      and d.visibility in ('buyer_link','public')
  ));

create policy market_public_read on padsplit_market
  for select to anon using (true);

-- ============================================================
-- Mark a snapshot viewed (called from the buyer link page)
-- ============================================================
create or replace function mark_snapshot_viewed(token text)
returns void
language sql
security definer
as $$
  update pro_forma_snapshots
  set viewed_at = coalesce(viewed_at, now())
  where share_token = token;
$$;

-- ============================================================
-- Keep updated_at honest
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists deals_touch on deals;
create trigger deals_touch before update on deals
  for each row execute function touch_updated_at();

-- ============================================================
-- FK from snapshots to buyers (deal_contacts is defined above)
-- ============================================================
alter table pro_forma_snapshots
  drop constraint if exists pro_forma_snapshots_contact_fk;
alter table pro_forma_snapshots
  add constraint pro_forma_snapshots_contact_fk
  foreign key (sent_to_contact_id) references deal_contacts(id) on delete set null;

-- ============================================================
-- Outreach that has gone quiet — read by the Vercel cron job
-- ============================================================
drop view if exists outreach_needing_follow_up cascade;
create or replace view outreach_needing_follow_up as
select
  o.id,
  o.deal_id,
  o.contact_id,
  o.subject,
  o.sent_at,
  c.full_name,
  c.email,
  d.slug,
  d.address_line,
  d.status as deal_status,
  extract(day from now() - o.sent_at)::int as days_since_sent
from deal_outreach o
join deal_contacts c on c.id = o.contact_id
join deals d on d.id = o.deal_id
where o.status in ('sent', 'opened')
  and o.follow_up_sent_at is null
  and o.sent_at < now() - interval '3 days'
  and d.status = 'for_sale'
  and c.buyer_status = 'active';

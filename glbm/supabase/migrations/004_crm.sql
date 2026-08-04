-- Green Light Buying Machine — CRM
-- Run after 003.
--
-- The pipeline isn't the buyer, it's the buyer × deal pair. Michael can
-- pass on one property and commit on the next, and both facts matter.
-- So `deal_interests` is the board, and contacts are the people behind it.

-- ============================================================
-- CONTACTS — extend the existing buyer table
-- ============================================================
alter table deal_contacts
  add column if not exists source text,              -- referral | website | event | cold | repeat
  add column if not exists lifecycle text not null default 'prospect',
  -- prospect | qualified | active_buyer | repeat_buyer | dormant | lost
  add column if not exists owner_email text,
  add column if not exists preferred_contact text default 'email',
  add column if not exists last_contacted_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists deals_purchased int not null default 0,
  add column if not exists total_purchased numeric(14,2) not null default 0,
  add column if not exists tags text[] default '{}';

create index if not exists contacts_lifecycle_idx on deal_contacts(lifecycle);
create index if not exists contacts_activity_idx on deal_contacts(last_activity_at desc);

-- ============================================================
-- DEAL_INTERESTS — the pipeline board
-- ============================================================
create table if not exists deal_interests (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  contact_id uuid not null references deal_contacts(id) on delete cascade,

  stage text not null default 'sent',
  -- sent | viewed | reviewing | call_scheduled | offer | committed | closed | passed

  stage_changed_at timestamptz not null default now(),
  position int not null default 0,               -- ordering within a column

  offer_amount numeric(12,2),
  expected_close date,
  probability int,                               -- 0-100, set by hand
  passed_reason text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, contact_id)
);

create index if not exists interests_stage_idx on deal_interests(stage, position);
create index if not exists interests_deal_idx on deal_interests(deal_id);
create index if not exists interests_contact_idx on deal_interests(contact_id);

drop trigger if exists interests_touch on deal_interests;
create trigger interests_touch before update on deal_interests
  for each row execute function touch_updated_at();

-- Stamp the clock whenever a card moves columns
create or replace function stamp_stage_change()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
  end if;
  return new;
end $$;

drop trigger if exists interests_stage_stamp on deal_interests;
create trigger interests_stage_stamp before update on deal_interests
  for each row execute function stamp_stage_change();

-- ============================================================
-- CONTACT_ACTIVITIES — one timeline per person
-- ============================================================
create table if not exists contact_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references deal_contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,

  activity_type text not null,
  -- email_sent | email_replied | follow_up_sent | proforma_viewed
  -- | stage_changed | call | meeting | note | task_completed

  title text not null,
  detail text,
  metadata jsonb default '{}'::jsonb,
  is_automatic boolean not null default false,   -- logged by trigger vs typed by a person
  actor_email text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists activities_contact_idx
  on contact_activities(contact_id, occurred_at desc);
create index if not exists activities_deal_idx on contact_activities(deal_id);

-- Any activity refreshes the contact's recency counters
create or replace function bump_contact_activity()
returns trigger language plpgsql as $$
begin
  update deal_contacts
  set last_activity_at = new.occurred_at,
      last_contacted_at = case
        when new.activity_type in ('email_sent','follow_up_sent','call','meeting')
        then new.occurred_at
        else last_contacted_at
      end
  where id = new.contact_id;
  return new;
end $$;

drop trigger if exists activities_bump on contact_activities;
create trigger activities_bump after insert on contact_activities
  for each row execute function bump_contact_activity();

-- ============================================================
-- CONTACT_TASKS
-- ============================================================
create table if not exists contact_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references deal_contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  title text not null,
  detail text,
  due_date date,
  assigned_to text,
  priority text not null default 'normal',       -- low | normal | high
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tasks_open_idx
  on contact_tasks(due_date) where completed_at is null;

-- ============================================================
-- AUTO-LOGGING
--
-- The CRM fills itself. Sending a deal, a buyer replying, a pro
-- forma link being opened — all of it lands on the timeline
-- without the app remembering to write it.
-- ============================================================

create or replace function log_outreach_activity()
returns trigger language plpgsql as $$
declare
  addr text;
begin
  select address_line into addr from deals where id = new.deal_id;

  if tg_op = 'INSERT' and new.status = 'sent' then
    insert into contact_activities
      (contact_id, deal_id, activity_type, title, detail, metadata, is_automatic, occurred_at)
    values (
      new.contact_id, new.deal_id, 'email_sent',
      format('Deal sent — %s', coalesce(addr, 'unknown')),
      new.subject,
      jsonb_build_object('thread_id', new.gmail_thread_id, 'attachments', coalesce(array_length(new.documents,1),0)),
      true, coalesce(new.sent_at, now())
    );

    -- Opening an interest card is what puts them on the board
    insert into deal_interests (deal_id, contact_id, stage)
    values (new.deal_id, new.contact_id, 'sent')
    on conflict (deal_id, contact_id) do nothing;

  elsif tg_op = 'UPDATE' then
    if new.status = 'replied' and old.status is distinct from 'replied' then
      insert into contact_activities
        (contact_id, deal_id, activity_type, title, detail, is_automatic, occurred_at)
      values (
        new.contact_id, new.deal_id, 'email_replied',
        format('Replied — %s', coalesce(addr, 'unknown')),
        new.subject, true, coalesce(new.replied_at, now())
      );

      -- A reply means they're engaged; move them off 'sent'
      update deal_interests
      set stage = 'reviewing'
      where deal_id = new.deal_id
        and contact_id = new.contact_id
        and stage in ('sent', 'viewed');
    end if;

    if new.follow_up_sent_at is not null and old.follow_up_sent_at is null then
      insert into contact_activities
        (contact_id, deal_id, activity_type, title, is_automatic, occurred_at)
      values (
        new.contact_id, new.deal_id, 'follow_up_sent',
        format('Follow-up sent — %s', coalesce(addr, 'unknown')),
        true, new.follow_up_sent_at
      );
    end if;
  end if;

  return new;
end $$;

drop trigger if exists outreach_activity_log on deal_outreach;
create trigger outreach_activity_log after insert or update on deal_outreach
  for each row execute function log_outreach_activity();

-- Pro forma link opened
create or replace function log_snapshot_view()
returns trigger language plpgsql as $$
declare
  addr text;
begin
  if new.viewed_at is not null and old.viewed_at is null and new.sent_to_contact_id is not null then
    select address_line into addr from deals where id = new.deal_id;

    insert into contact_activities
      (contact_id, deal_id, activity_type, title, detail, is_automatic, occurred_at)
    values (
      new.sent_to_contact_id, new.deal_id, 'proforma_viewed',
      format('Opened the pro forma — %s', coalesce(addr, 'unknown')),
      format('Scenario: %s', new.scenario), true, new.viewed_at
    );

    update deal_interests
    set stage = 'viewed'
    where deal_id = new.deal_id
      and contact_id = new.sent_to_contact_id
      and stage = 'sent';
  end if;
  return new;
end $$;

drop trigger if exists snapshot_view_log on pro_forma_snapshots;
create trigger snapshot_view_log after update on pro_forma_snapshots
  for each row execute function log_snapshot_view();

-- Stage moves land on the timeline too
create or replace function log_stage_change()
returns trigger language plpgsql as $$
declare
  addr text;
begin
  if new.stage is distinct from old.stage then
    select address_line into addr from deals where id = new.deal_id;

    insert into contact_activities
      (contact_id, deal_id, activity_type, title, detail, metadata, is_automatic, occurred_at)
    values (
      new.contact_id, new.deal_id, 'stage_changed',
      format('%s → %s', old.stage, new.stage),
      coalesce(addr, 'unknown'),
      jsonb_build_object('from', old.stage, 'to', new.stage, 'reason', new.passed_reason),
      true, now()
    );

    -- Closing a deal updates the buyer's purchase history
    if new.stage = 'closed' and old.stage is distinct from 'closed' then
      update deal_contacts
      set deals_purchased = deals_purchased + 1,
          total_purchased = total_purchased + coalesce(
            new.offer_amount,
            (select coalesce(list_price, purchase_price, 0) from deals where id = new.deal_id)
          ),
          lifecycle = case when deals_purchased >= 1 then 'repeat_buyer' else 'active_buyer' end
      where id = new.contact_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists interests_stage_log on deal_interests;
create trigger interests_stage_log after update on deal_interests
  for each row execute function log_stage_change();

-- ============================================================
-- VIEWS
-- ============================================================

-- The board
create or replace view pipeline_board as
select
  i.id,
  i.stage,
  i.position,
  i.stage_changed_at,
  i.offer_amount,
  i.expected_close,
  i.probability,
  i.notes,
  extract(day from now() - i.stage_changed_at)::int as days_in_stage,
  c.id as contact_id,
  c.full_name,
  c.email,
  c.entity_name,
  c.lifecycle,
  c.deals_purchased,
  d.id as deal_id,
  d.slug,
  d.address_line,
  d.city,
  d.zip,
  d.status as deal_status,
  coalesce(d.list_price, d.purchase_price) as deal_price,
  (select max(occurred_at) from contact_activities a
    where a.contact_id = c.id and a.deal_id = d.id) as last_touch
from deal_interests i
join deal_contacts c on c.id = i.contact_id
join deals d on d.id = i.deal_id
where i.stage <> 'passed';

-- Cards nobody has touched
create or replace view pipeline_stalled as
select *
from pipeline_board
where stage not in ('closed', 'committed')
  and days_in_stage >= 7
order by days_in_stage desc;

-- Contact summary for the list view
create or replace view contact_summary as
select
  c.*,
  (select count(*) from deal_interests i where i.contact_id = c.id) as deals_shown,
  (select count(*) from deal_interests i
    where i.contact_id = c.id and i.stage in ('reviewing','call_scheduled','offer','committed')) as deals_active,
  (select count(*) from contact_tasks t
    where t.contact_id = c.id and t.completed_at is null) as open_tasks,
  extract(day from now() - c.last_contacted_at)::int as days_since_contact
from deal_contacts c;

-- Green Light Buying Machine — Google Workspace sending
-- Replaces Resend. Run after 002.

-- ============================================================
-- EMAIL_ACCOUNTS — connected Workspace mailboxes
--
-- One row per person who sends deals. The refresh token lets the
-- cron send and read threads when nobody is logged in.
-- ============================================================
create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  refresh_token text not null,              -- service-role access only
  access_token text,
  token_expires_at timestamptz,
  scopes text[] default '{}',
  is_default boolean not null default false,
  last_error text,
  connected_at timestamptz not null default now()
);

alter table email_accounts enable row level security;
-- No policies on purpose: only the service role touches this table.

create unique index if not exists email_accounts_one_default
  on email_accounts (is_default) where is_default;

-- ============================================================
-- Gmail threading on outreach
-- ============================================================
alter table deal_outreach
  drop column if exists resend_message_id;

alter table deal_outreach
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists sent_from_account_id uuid references email_accounts(id),
  add column if not exists last_checked_at timestamptz;

create index if not exists deal_outreach_thread_idx
  on deal_outreach(gmail_thread_id) where gmail_thread_id is not null;

-- ============================================================
-- Threads to poll for replies
-- ============================================================
drop view if exists outreach_awaiting_reply cascade;
create or replace view outreach_awaiting_reply as
select
  o.id,
  o.deal_id,
  o.contact_id,
  o.gmail_thread_id,
  o.sent_from_account_id,
  o.sent_at,
  c.email,
  c.full_name
from deal_outreach o
join deal_contacts c on c.id = o.contact_id
where o.status in ('sent', 'opened')
  and o.gmail_thread_id is not null
  and o.sent_at > now() - interval '45 days';

-- ============================================================
-- Follow-up view, rebuilt for Gmail
-- Anyone who replied is excluded automatically by status.
-- ============================================================
drop view if exists outreach_needing_follow_up cascade;
create or replace view outreach_needing_follow_up as
select
  o.id,
  o.deal_id,
  o.contact_id,
  o.subject,
  o.sent_at,
  o.gmail_thread_id,
  o.sent_from_account_id,
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

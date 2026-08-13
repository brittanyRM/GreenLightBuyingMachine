-- ============================================================
-- 031 — Comp detail, buyer-visible documents, renovation dates
--
-- Consolidates four earlier drafts that each invented their own name
-- for the same thing. Canonical names, once:
--
--   deal_comps.bedrooms / bathrooms / year_built / distance_miles
--   deal_documents.buyer_visible / buyer_label
--   deals.finished_sqft / reno_complete_date / reno_complete_estimated
--
-- deals.disposition_coe already exists and is the close-of-escrow
-- target; it is not the renovation date and the two are not
-- interchangeable.
--
-- Safe to run whether or not any of the earlier drafts were applied.
-- ============================================================

-- ---------- comps a buyer can actually compare ----------
--
-- Price and square footage alone can't answer "is this comparable".
-- On a co-living conversion the bed count is the whole question.
alter table public.deal_comps
  add column if not exists bedrooms int,
  add column if not exists bathrooms numeric(4,1),
  add column if not exists year_built int,
  add column if not exists distance_miles numeric(5,2),
  add column if not exists notes text;

comment on column public.deal_comps.bedrooms is
  'Beds as sold. A conversion rarely has a like-for-like comp, and saying so is more credible than implying one.';

-- ---------- evidence a buyer can open ----------
--
-- The flexmls comps export and the PadSplit market screenshot are what
-- back the occupancy and the pricing. Off by default: a document is
-- internal unless someone deliberately publishes it.
alter table public.deal_documents
  add column if not exists buyer_visible boolean not null default false,
  add column if not exists buyer_label text;

comment on column public.deal_documents.buyer_visible is
  'Publishes this document to the buyer sheet and share links. Default false.';
comment on column public.deal_documents.buyer_label is
  'What a buyer sees, if the internal title is not appropriate.';

-- ---------- when it is ready ----------
--
-- The first question a turnkey buyer asks. One date plus a flag,
-- rather than separate estimate and actual columns that drift.
alter table public.deals
  add column if not exists finished_sqft int,
  add column if not exists reno_complete_date date,
  add column if not exists reno_complete_estimated boolean not null default true;

comment on column public.deals.finished_sqft is
  'Square footage measured on completion. post_reno_sqft is the underwriting figure.';
comment on column public.deals.reno_complete_date is
  'Renovation completion. reno_complete_estimated false means it has actually happened.';

-- ---------- retire the duplicates ----------
--
-- Dropped rather than left in place: a column nothing reads is a
-- column someone will later assume is authoritative.
alter table public.deals
  drop column if exists reno_complete_estimate,
  drop column if exists reno_complete_actual,
  drop column if exists reno_completion_date,
  drop column if exists reno_status;

alter table public.deal_comps
  drop column if exists lot_sqft;

-- Rollback:
--   alter table public.deal_comps drop column if exists bedrooms, drop column if exists bathrooms,
--     drop column if exists year_built, drop column if exists distance_miles, drop column if exists notes;
--   alter table public.deal_documents drop column if exists buyer_visible, drop column if exists buyer_label;
--   alter table public.deals drop column if exists finished_sqft,
--     drop column if exists reno_complete_date, drop column if exists reno_complete_estimated;

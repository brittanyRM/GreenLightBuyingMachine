-- ============================================================
-- 027 — Show financing as a benefit, not a reward
--
-- Lender introductions were revealed only after a buyer raised a hand.
-- That's backwards when the relationship is itself a reason to buy:
-- financing already lined up belongs in the pitch, alongside the
-- furniture package and the completed launch.
--
-- show_before_interest defaults true so existing rows surface too.
-- Set it false for anything that should stay gated.
-- ============================================================

alter table public.deal_financing_options
  add column if not exists show_before_interest boolean not null default true,
  add column if not exists contact_photo_url text,
  add column if not exists lender_logo_url text,
  add column if not exists nmls text,
  add column if not exists states text[] not null default '{}';

comment on column public.deal_financing_options.show_before_interest is
  'Visible on the sheet before the buyer engages. False keeps it behind interest.';

-- Rollback:
--   alter table public.deal_financing_options
--     drop column if exists show_before_interest,
--     drop column if exists contact_photo_url,
--     drop column if exists lender_logo_url,
--     drop column if exists nmls,
--     drop column if exists states;

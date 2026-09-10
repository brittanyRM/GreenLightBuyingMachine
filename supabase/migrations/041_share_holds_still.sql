-- ============================================================
-- 041 — A shared pro forma holds still by default
--
-- 022 added allow_adjust so a recipient could stress-test the numbers,
-- and defaulted it to true. The reasoning then was that an analyst
-- trusts figures they can push on.
--
-- In practice it works against the document. A pro forma is sent to
-- say what Green Light underwrites a house at. If it moves when the
-- reader touches it, "what does this deal return" stops having one
-- answer, and a figure quoted back in a later conversation may be one
-- the recipient produced rather than one we published.
--
-- Stress-testing still has a home — the calculator is built for it and
-- carries no implication of being the pro forma.
--
-- The column stays and the per-link toggle stays. Only the default
-- flips, so letting someone adjust is now a deliberate choice rather
-- than what happens if nobody thinks about it.
-- ============================================================

alter table public.club_share_links
  alter column allow_adjust set default false;

-- Existing links too. Nothing has been sent through this yet, so there
-- is no recipient whose view changes underneath them — and a link
-- created before this migration was made adjustable by a default
-- rather than a decision.
update public.club_share_links
set allow_adjust = false
where allow_adjust is true;

comment on column public.club_share_links.allow_adjust is
  'Recipient may edit assumptions in-browser. Defaults to false: a shared '
  'pro forma is what we publish, and a document that changes when the '
  'reader touches it cannot be quoted back reliably. Never writes back — '
  'the frozen inputs stand either way.';

-- ---------- check ----------
--
--   select allow_adjust, count(*) from public.club_share_links
--   group by allow_adjust;
--
-- ---------- rollback ----------
--
--   alter table public.club_share_links
--     alter column allow_adjust set default true;
--
-- Rolling back the default does not re-enable existing links. That is
-- deliberate: turning one back on is a per-link decision.

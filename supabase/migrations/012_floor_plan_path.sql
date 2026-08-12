-- Store the sketch's storage path, not a signed URL.
--
-- uploadSketch was saving a signed URL with a one-year expiry into
-- deals.floor_plan_url. It works until it doesn't: a year after
-- upload the link 404s, the sketch canvas shows a broken image, and
-- the render's stored-sketch fallback throws — with nothing to
-- indicate why. The path never expires, so it is what gets stored and
-- the URL is signed fresh on every read.

alter table deals
  add column if not exists floor_plan_path text;

comment on column deals.floor_plan_path is
  'Path within the deal-sketches bucket. Signed on read; never expires.';

-- Backfill from the signed URLs already saved. Supabase signs as
--   /storage/v1/object/sign/<bucket>/<path>?token=...
-- so the path is the segment between the bucket and the query string.
update deals
   set floor_plan_path = substring(
         floor_plan_url from '/object/sign/deal-sketches/([^?]+)'
       )
 where floor_plan_path is null
   and floor_plan_url like '%/object/sign/deal-sketches/%';

-- Anything stored as a public URL rather than a signed one.
update deals
   set floor_plan_path = substring(
         floor_plan_url from '/object/public/deal-sketches/([^?]+)'
       )
 where floor_plan_path is null
   and floor_plan_url like '%/object/public/deal-sketches/%';

do $$
declare
  missing int;
begin
  select count(*) into missing
    from deals
   where floor_plan_url is not null
     and floor_plan_path is null;

  if missing > 0 then
    raise notice
      '% deal(s) have a floor_plan_url the backfill could not parse — those sketches need re-uploading.',
      missing;
  end if;
end $$;

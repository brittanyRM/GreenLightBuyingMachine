-- Storage access policies.
--
-- Creating a bucket doesn't grant access to it. storage.objects has
-- RLS on by default, so without these every upload fails.

-- Sketches and documents: signed-in team only
do $$
declare b text;
begin
  foreach b in array array['deal-sketches', 'deal-documents']
  loop
    execute format($f$
      drop policy if exists %I on storage.objects;
      create policy %I on storage.objects
        for all to authenticated
        using (bucket_id = %L)
        with check (bucket_id = %L);
    $f$, 'team_rw_' || b, 'team_rw_' || b, b, b);
  end loop;
end $$;

-- Photos: team writes, anyone reads (they appear on public buyer links)
drop policy if exists team_write_photos on storage.objects;
create policy team_write_photos on storage.objects
  for all to authenticated
  using (bucket_id = 'deal-photos')
  with check (bucket_id = 'deal-photos');

drop policy if exists public_read_photos on storage.objects;
create policy public_read_photos on storage.objects
  for select to anon
  using (bucket_id = 'deal-photos');

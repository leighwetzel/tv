-- 016: Hosts can make as many invite links as they like, and anyone can remove their unused links. Run after 015, once, in Supabase > SQL Editor. Safe to run again.
-- Everyone else keeps the limit from 006: at most 10 unused links at a time.

drop policy if exists "members create invites" on public.invites;
create policy "members create invites" on public.invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.am_member()
              and (public.is_host(auth.uid()) or public.my_open_invites() < 10));

-- Remove unused links: anyone can delete their own links that nobody has joined with
-- (pending or expired). Links someone joined with stay, as the record of who invited whom.
drop policy if exists "remove own unused invites" on public.invites;
create policy "remove own unused invites" on public.invites
  for delete to authenticated
  using (created_by = auth.uid() and used_by is null);

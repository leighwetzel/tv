-- 016: Hosts can make as many invite links as they like. Run after 015, once, in Supabase > SQL Editor. Safe to run again.
-- Everyone else keeps the limit from 006: at most 10 unused links at a time.

drop policy if exists "members create invites" on public.invites;
create policy "members create invites" on public.invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.am_member()
              and (public.is_host(auth.uid()) or public.my_open_invites() < 10));

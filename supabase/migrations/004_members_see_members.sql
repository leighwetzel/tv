-- 004: Everyone who joined by invite sees everyone else who did.
--
-- "Members" = people who joined through an invite link, plus hosts.
-- Members see every other member's name, photo and reviews.
-- Someone who signs up without an invite is not a member: they see no one, and no one sees them.
-- Other people see only your display name and photo. Your email, streaming services and
-- email settings stay private to you.
--
-- Run once in Supabase > SQL Editor. Safe to run again.

-- 1. Membership ------------------------------------------------------------

alter table public.profiles add column if not exists is_member boolean not null default false;

-- Everyone here today joined by invite (or is a host). Anyone with no invite and no connection
-- signed up on their own and stays out until invited. The check at the end lists both groups.
update public.profiles p set is_member = true
where not p.is_member
  and (p.is_host
       or exists (select 1 from public.invites i where i.used_by = p.id)
       or exists (select 1 from public.connections c where p.id in (c.user_a, c.user_b)));

-- New accounts start with a blank name (not the front of their email address).
-- Welcome asks for a name before anything else.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name) values (new.id, '');
  return new;
end;
$$;

-- 2. Helpers ----------------------------------------------------------------

-- Can the signed-in person see person u? Yes for yourself; otherwise both of you must be members.
-- Only ever answers about the signed-in person, so it can't be used to probe other people.
create or replace function public.can_see(u uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select u = auth.uid()
      or (exists (select 1 from public.profiles where id = auth.uid() and is_member)
          and exists (select 1 from public.profiles where id = u and is_member));
$$;

-- Am I a member? Used so nobody can make themselves one.
create or replace function public.am_member()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_member from public.profiles where id = auth.uid()), false); $$;

-- My own private settings (other people can't read these columns).
create or replace function public.my_settings()
returns table (services int[], weekly_email boolean, is_member boolean)
language sql stable security definer set search_path = public
as $$ select services, weekly_email, is_member from public.profiles where id = auth.uid(); $$;

-- 3. Who can see what ---------------------------------------------------------

-- Profiles: members see members. Only these columns are readable at all.
drop policy if exists "see self and connections" on public.profiles;
drop policy if exists "members see members" on public.profiles;
create policy "members see members" on public.profiles
  for select to authenticated using (public.can_see(id));

revoke select on public.profiles from authenticated;
grant select (id, name, avatar_url, is_host, onboarded, is_member) on public.profiles to authenticated;

-- Can't make yourself a host or a member.
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and is_host = public.is_host(auth.uid()) and is_member = public.am_member());

-- Ratings: members see members' ratings.
drop policy if exists "see connected ratings" on public.ratings;
drop policy if exists "members see members' ratings" on public.ratings;
create policy "members see members' ratings" on public.ratings
  for select to authenticated using (public.can_see(user_id));

-- Want to watch credit and Thanks: any member, not only connections.
drop policy if exists "own watchlist credits" on public.watchlist_credits;
create policy "own watchlist credits" on public.watchlist_credits
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see(recommender_id));

drop policy if exists "send thanks" on public.reactions;
create policy "send thanks" on public.reactions
  for insert to authenticated
  with check (from_user = auth.uid() and from_user <> to_user and public.can_see(to_user));

-- 4. Invites make you a member ---------------------------------------------

create or replace function public.redeem_invite(invite_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  inv public.invites;
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  select * into inv from public.invites where code = invite_code for update;
  if inv is null or (inv.used_by is not null and inv.used_by <> me) then return false; end if;

  update public.invites set used_by = me, used_at = coalesce(used_at, now()) where code = invite_code;
  update public.profiles set is_member = true where id = me;

  -- Still record who invited whom (kept for following, later).
  insert into public.connections (user_a, user_b)
  select least(me, p.id), greatest(me, p.id)
  from public.profiles p
  where p.is_host and p.id <> me
  on conflict do nothing;

  insert into public.activity (user_id, actor_id, kind)
  values (inv.created_by, me, 'joined')
  on conflict do nothing;

  return true;
end;
$$;

-- 5. Function access ---------------------------------------------------------

revoke execute on function public.can_see(uuid)   from public, anon;
revoke execute on function public.am_member()     from public, anon;
revoke execute on function public.my_settings()   from public, anon;
grant  execute on function public.can_see(uuid)   to authenticated;
grant  execute on function public.am_member()     to authenticated;
grant  execute on function public.my_settings()   to authenticated;

-- No access rule uses is_connected any more; stop the app from calling it
-- (it could be used to test whether two other people are connected).
revoke execute on function public.is_connected(uuid, uuid) from authenticated;

-- 6. Check ------------------------------------------------------------------
-- Members (see each other) and non-members (people who signed up without an invite).
-- Look over the non-members: invite anyone who belongs; the rest see nothing.
-- name_from_email = true means that person's display name is still the front of their email
-- address (they never changed it). Others can see it, so ask them to change it on the Me screen.
select p.is_member, p.name, p.name <> '' and p.name = split_part(u.email, '@', 1) as name_from_email,
       u.email, p.created_at::date as joined
from public.profiles p join auth.users u on u.id = p.id
order by p.is_member desc, p.created_at;

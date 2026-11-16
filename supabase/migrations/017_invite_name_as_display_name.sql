-- 017: People who join start with the invite's "who's it for" name instead of a blank one.
-- Run after 016, once, in Supabase > SQL Editor. Safe to run again.
--
-- Found Nov 16: Carmine joined with Rick's link but hadn't finished Welcome,
-- so Rick's My invites showed "Someone". Email addresses stay private: never used as names.

create or replace function public.redeem_invite(invite_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  inv public.invites;
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  -- Already in: leave the link alone so the person it was meant for can still use it.
  if exists (select 1 from public.profiles where id = me and is_member) then return true; end if;

  select * into inv from public.invites where code = invite_code for update;
  if inv is null or (inv.used_by is not null and inv.used_by <> me) then return false; end if;
  if inv.used_by is null and inv.expires_at <= now() then return false; end if;

  update public.invites set used_by = me, used_at = coalesce(used_at, now()) where code = invite_code;
  update public.profiles set is_member = true where id = me;
  -- No name yet? Start with the invite's "who's it for" name. They can change it on Welcome or Me.
  update public.profiles set name = left(trim(inv.for_name), 80)
  where id = me and name = '' and coalesce(trim(inv.for_name), '') <> '';

  insert into public.connections (user_a, user_b)
  select least(me, p.id), greatest(me, p.id)
  from public.profiles p
  where p.is_host and p.id <> me
  on conflict do nothing;

  if inv.created_by <> me then
    insert into public.follows (follower, followee)
    values (me, inv.created_by), (inv.created_by, me)
    on conflict do nothing;
  end if;

  insert into public.activity (user_id, actor_id, kind)
  values (inv.created_by, me, 'joined')
  on conflict do nothing;

  return true;
end;
$$;

-- People who already joined without a name: give them their invite's name now.
update public.profiles p
set name = left(trim(i.for_name), 80)
from public.invites i
where i.used_by = p.id and p.name = '' and coalesce(trim(i.for_name), '') <> '';

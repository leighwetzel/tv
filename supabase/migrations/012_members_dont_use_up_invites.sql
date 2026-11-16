-- 012: Opening an invite link when you're already a member no longer uses it up.
-- Run after 011, once, in Supabase > SQL Editor. Safe to run again.
--
-- Found Nov 16: Rick opened his own invite link, which marked it used by him,
-- so the friend he sent it to couldn't join with it.

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

-- Give back links that their own maker used up, good for 7 more days.
update public.invites
set used_by = null, used_at = null, expires_at = greatest(expires_at, now() + interval '7 days')
where used_by = created_by;

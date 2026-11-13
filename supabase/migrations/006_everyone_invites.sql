-- 006: Every member can invite. Run after 005, once, in Supabase > SQL Editor. Safe to run again.
--
-- Each invite link still works once, for one person.
-- New: unused links expire after 7 days, and each person can have at most 10 unused links at a time.
-- Someone who opens a used or expired link is told why (invite_status).

alter table public.invites add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

-- Unused links the signed-in person has out right now.
create or replace function public.my_open_invites()
returns int language sql stable security definer set search_path = public
as $$ select count(*)::int from public.invites where created_by = auth.uid() and used_by is null and expires_at > now(); $$;

drop policy if exists "hosts create invites" on public.invites;
drop policy if exists "members create invites" on public.invites;
create policy "members create invites" on public.invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.am_member() and public.my_open_invites() < 10);

drop policy if exists "hosts see own invites" on public.invites;
drop policy if exists "see own invites" on public.invites;
create policy "see own invites" on public.invites
  for select to authenticated using (created_by = auth.uid());

-- Redeem: as in 005, plus expired links are refused.
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

-- Why a link didn't work: 'used', 'expired' or 'invalid' ('ok' if it's still good).
-- Says nothing about who made it or who used it.
create or replace function public.invite_status(invite_code text)
returns text language sql stable security definer set search_path = public
as $$
  select case
    when i.code is null then 'invalid'
    when i.used_by is not null and i.used_by <> auth.uid() then 'used'
    when i.used_by is null and i.expires_at <= now() then 'expired'
    else 'ok' end
  from (select 1) one left join public.invites i on i.code = invite_code;
$$;

revoke execute on function public.my_open_invites()    from public, anon;
grant  execute on function public.my_open_invites()    to authenticated;
revoke execute on function public.invite_status(text)  from public, anon;
grant  execute on function public.invite_status(text)  to authenticated;

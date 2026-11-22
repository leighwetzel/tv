-- 021: One invite link per person, good for anyone and never expiring (Nov 22).
-- Run after 020, once, in Supabase > SQL Editor. Safe to run again.
--
-- Leigh found one-person, 7-day links were hurting sign-ups: people didn't pass them on.
-- Now each member has one personal link they can text, forward or drop in a group chat.
-- Every join through it still adds a row to invites (created_by = link owner, used_by = newcomer),
-- so My invites > Joined, the Members page and "invited by" keep working unchanged.
-- Old one-person links still work until they expire.

create table if not exists public.invite_links (
  code        text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  owner       uuid not null unique references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.invite_links enable row level security;
-- No policies: reached only through the functions below.

-- The signed-in member's link, made the first time they ask for it.
create or replace function public.my_invite_link()
returns text language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null or not public.am_member() then return null; end if;
  insert into public.invite_links (owner) values (me) on conflict (owner) do nothing;
  select code into c from public.invite_links where owner = me;
  return c;
end;
$$;
revoke execute on function public.my_invite_link() from public, anon;
grant  execute on function public.my_invite_link() to authenticated;

-- Redeem: as in 017, plus personal links (any number of people, no expiry).
create or replace function public.redeem_invite(invite_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  inv public.invites;
  link_owner uuid;
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  -- Already in: leave the link alone so the person it was meant for can still use it.
  if exists (select 1 from public.profiles where id = me and is_member) then return true; end if;

  select * into inv from public.invites where code = invite_code for update;
  if inv.code is null then
    -- A personal link: record this join as its own invites row.
    select owner into link_owner from public.invite_links where code = invite_code;
    if link_owner is null then return false; end if;
    insert into public.invites (created_by, used_by, used_at, expires_at)
    values (link_owner, me, now(), now())
    returning * into inv;
  else
    if inv.used_by is not null and inv.used_by <> me then return false; end if;
    if inv.used_by is null and inv.expires_at <= now() then return false; end if;
    update public.invites set used_by = me, used_at = coalesce(used_at, now()) where code = invite_code;
  end if;

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

-- Landing page: as in 015, plus personal links (always 'ok').
create or replace function public.invite_preview(invite_code text)
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'status', case
      when l.code is not null then 'ok'
      when i.code is null then 'invalid'
      when i.used_by is not null then 'used'
      when i.expires_at <= now() then 'expired'
      else 'ok' end,
    'inviter_id', p.id,
    'name', nullif(trim(p.name), ''),
    'avatar_url', p.avatar_url)
  from (select 1) one
  left join public.invites i on i.code = invite_code
  left join public.invite_links l on l.code = invite_code
  left join public.profiles p on p.id = coalesce(l.owner, i.created_by);
$$;
revoke execute on function public.invite_preview(text) from public;
grant  execute on function public.invite_preview(text) to anon, authenticated;

-- Why a link didn't work: as in 006, plus personal links (always 'ok').
create or replace function public.invite_status(invite_code text)
returns text language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.invite_links where code = invite_code) then 'ok'
    when i.code is null then 'invalid'
    when i.used_by is not null and i.used_by <> auth.uid() then 'used'
    when i.used_by is null and i.expires_at <= now() then 'expired'
    else 'ok' end
  from (select 1) one left join public.invites i on i.code = invite_code;
$$;
revoke execute on function public.invite_status(text) from public, anon;
grant  execute on function public.invite_status(text) to authenticated;

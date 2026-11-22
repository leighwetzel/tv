-- 022: Named invite links (Nov 22). Run after 021, once, in Supabase > SQL Editor. Safe to run again.
--
-- Leigh likes to see who she sent each invite to. Besides your one personal link (021), you can make
-- a link with a name on it ("Mom"). It works like the personal link (anyone, any number of times,
-- never expires), but My invites shows "Sent to Mom" until someone joins with it, and the first
-- person who joins with it starts with that name (they can change it on Welcome).

alter table public.invite_links add column if not exists for_name text;
alter table public.invite_links drop constraint if exists invite_links_for_name_check;
alter table public.invite_links add constraint invite_links_for_name_check check (char_length(for_name) <= 80);
-- Still one unnamed (personal) link per person; named links as many as you like.
alter table public.invite_links drop constraint if exists invite_links_owner_key;
create unique index if not exists invite_links_one_personal on public.invite_links (owner) where for_name is null;

-- Which link each join came through.
alter table public.invites add column if not exists via_link text;

-- See and remove your own named links.
drop policy if exists "see own links" on public.invite_links;
create policy "see own links" on public.invite_links for select to authenticated using (owner = auth.uid());
drop policy if exists "remove own named links" on public.invite_links;
create policy "remove own named links" on public.invite_links for delete to authenticated
  using (owner = auth.uid() and for_name is not null);
grant select, delete on public.invite_links to authenticated;

create or replace function public.my_invite_link()
returns text language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null or not public.am_member() then return null; end if;
  select code into c from public.invite_links where owner = me and for_name is null;
  if c is null then
    insert into public.invite_links (owner) values (me) on conflict do nothing;
    select code into c from public.invite_links where owner = me and for_name is null;
  end if;
  return c;
end;
$$;

create or replace function public.make_invite_link(p_for text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null or not public.am_member() or coalesce(trim(p_for), '') = '' then return null; end if;
  insert into public.invite_links (owner, for_name) values (me, left(trim(p_for), 80)) returning code into c;
  return c;
end;
$$;
revoke execute on function public.make_invite_link(text) from public, anon;
grant  execute on function public.make_invite_link(text) to authenticated;

-- Redeem: as in 021, plus the link's name for the first person who joins with it.
create or replace function public.redeem_invite(invite_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  inv public.invites;
  link public.invite_links;
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if exists (select 1 from public.profiles where id = me and is_member) then return true; end if;

  select * into inv from public.invites where code = invite_code for update;
  if inv.code is null then
    select * into link from public.invite_links where code = invite_code for update;
    if link.code is null then return false; end if;
    insert into public.invites (created_by, used_by, used_at, expires_at, via_link, for_name)
    values (link.owner, me, now(), now(), link.code,
            case when not exists (select 1 from public.invites where via_link = link.code) then link.for_name end)
    returning * into inv;
  else
    if inv.used_by is not null and inv.used_by <> me then return false; end if;
    if inv.used_by is null and inv.expires_at <= now() then return false; end if;
    update public.invites set used_by = me, used_at = coalesce(used_at, now()) where code = invite_code;
  end if;

  update public.profiles set is_member = true where id = me;
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

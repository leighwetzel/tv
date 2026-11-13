-- 005: Following. Run after 004, once, in Supabase > SQL Editor. Safe to run again.
--
-- You can follow any member. Who you follow is private to you for now
-- (no followers list yet; nobody sees who follows them).
-- Joining from an invite: the inviter and the new person follow each other.
-- People already connected today (everyone Leigh invited) start out following each other.

create table if not exists public.follows (
  follower    uuid not null references public.profiles (id) on delete cascade,
  followee    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows (followee);

alter table public.follows enable row level security;

drop policy if exists "see who I follow" on public.follows;
create policy "see who I follow" on public.follows
  for select to authenticated using (follower = auth.uid());

drop policy if exists "follow a member" on public.follows;
create policy "follow a member" on public.follows
  for insert to authenticated with check (follower = auth.uid() and public.can_see(followee));

drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows
  for delete to authenticated using (follower = auth.uid());

grant select, insert, delete on public.follows to authenticated;

-- Today's connections become follows in both directions.
insert into public.follows (follower, followee)
select user_a, user_b from public.connections
union
select user_b, user_a from public.connections
on conflict do nothing;

-- Invites: the inviter and the new person follow each other (plus everything 004 does).
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

-- Check: how many people each person follows.
select p.name, count(f.followee) as following
from public.profiles p left join public.follows f on f.follower = p.id
where p.is_member
group by p.name order by p.name;

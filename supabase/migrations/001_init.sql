-- tv.xoleigh.com: phase 1 database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to read top to bottom: tables, then who-can-see-what rules, then helper functions.

-- =====================================================================
-- 1. Tables
-- =====================================================================

-- One row per person. Created automatically when someone first signs in.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  avatar_url    text,
  services      int[] not null default '{}',      -- TMDB provider ids ("My services")
  is_host       boolean not null default false,    -- Leigh and Brian
  weekly_email  boolean not null default true,
  onboarded     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Who is connected to whom. Stored once per pair, smaller id first.
create table public.connections (
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

-- Invite links. Only hosts create them.
create table public.invites (
  code        text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  used_by     uuid references public.profiles (id) on delete set null,
  used_at     timestamptz
);

-- Title details copied from TMDB, so pages load without calling TMDB every time.
-- id looks like 'tv:1396' or 'movie:550'.
create table public.titles (
  id           text primary key,
  media_type   text not null check (media_type in ('tv', 'movie')),
  tmdb_id      int  not null,
  name         text not null,
  year         int,
  poster_path  text,
  updated_at   timestamptz not null default now()
);

-- Where each title is streaming (US). Filled by the daily server job.
create table public.title_providers (
  title_id    text primary key references public.titles (id) on delete cascade,
  providers   jsonb not null default '{}',   -- { flatrate: [...], rent: [...], buy: [...] }
  fetched_at  timestamptz not null default now()
);

-- One rating per person per title. Editable anytime.
create table public.ratings (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  title_id           text not null references public.titles (id) on delete cascade,
  rating             text not null check (rating in ('loved', 'liked', 'didnt_like', 'gave_up')),
  note               text check (char_length(note) <= 200),
  source             text not null default 'search' check (source in ('search', 'quickpick', 'watchlist')),
  visibility         text not null default 'friends' check (visibility in ('friends', 'extended')),
  created_at         timestamptz not null default now(),
  activity_at        timestamptz not null default now(),  -- moves the feed card up: new rating, changed rating, or new note
  updated_at         timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- Want to watch list (private to its owner).
create table public.watchlist (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title_id    text not null references public.titles (id) on delete cascade,
  added_at    timestamptz not null default now(),
  watched_at  timestamptz,
  primary key (user_id, title_id)
);

-- Who recommended each Want to watch title (can be several people).
create table public.watchlist_credits (
  user_id         uuid not null,
  title_id        text not null,
  recommender_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (user_id, title_id, recommender_id),
  foreign key (user_id, title_id) references public.watchlist (user_id, title_id) on delete cascade
);

-- "Thanks" taps on someone's rating.
create table public.reactions (
  from_user   uuid not null references public.profiles (id) on delete cascade,
  to_user     uuid not null references public.profiles (id) on delete cascade,
  title_id    text not null references public.titles (id) on delete cascade,
  kind        text not null default 'thanks' check (kind in ('thanks')),
  created_at  timestamptz not null default now(),
  primary key (from_user, to_user, title_id, kind)
);

-- Quick-pick "Haven't seen" answers, so those titles don't come back.
create table public.quickpick_skips (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title_id    text not null references public.titles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- Activity on the Me screen. Written only by the database itself (triggers below).
create table public.activity (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,  -- who sees it
  actor_id    uuid not null references public.profiles (id) on delete cascade,  -- who did it
  kind        text not null check (kind in ('loved_your_pick', 'liked_your_pick', 'thanks', 'joined')),
  title_id    text references public.titles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique nulls not distinct (user_id, actor_id, kind, title_id)
);

create index on public.ratings (title_id);
create index on public.ratings (activity_at desc);
create index on public.activity (user_id, created_at desc);

-- =====================================================================
-- 2. Helper: are two people connected?
-- =====================================================================

create or replace function public.is_connected(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a = b or exists (
    select 1 from public.connections
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

create or replace function public.is_host(u uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_host from public.profiles where id = u), false);
$$;

-- =====================================================================
-- 3. Who can see and change what (row-level security)
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.connections       enable row level security;
alter table public.invites           enable row level security;
alter table public.titles            enable row level security;
alter table public.title_providers   enable row level security;
alter table public.ratings           enable row level security;
alter table public.watchlist         enable row level security;
alter table public.watchlist_credits enable row level security;
alter table public.reactions         enable row level security;
alter table public.quickpick_skips   enable row level security;
alter table public.activity          enable row level security;

-- Profiles: you, and people you're connected to.
create policy "see self and connections" on public.profiles
  for select to authenticated using (public.is_connected(auth.uid(), id));
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and is_host = public.is_host(auth.uid()));  -- can't make yourself a host

-- Connections: see and remove your own. New ones only come from invites.
create policy "see own connections" on public.connections
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "remove a friend" on public.connections
  for delete to authenticated using (auth.uid() in (user_a, user_b));

-- Invites: hosts create and see their own.
create policy "hosts see own invites" on public.invites
  for select to authenticated using (created_by = auth.uid());
create policy "hosts create invites" on public.invites
  for insert to authenticated with check (created_by = auth.uid() and public.is_host(auth.uid()));

-- Titles and streaming info: shared reference data.
create policy "read titles" on public.titles
  for select to authenticated using (true);
create policy "add titles" on public.titles
  for insert to authenticated with check (true);
create policy "read providers" on public.title_providers
  for select to authenticated using (true);

-- Ratings: yours, and those of people you're connected to.
create policy "see connected ratings" on public.ratings
  for select to authenticated using (public.is_connected(auth.uid(), user_id));
create policy "add own ratings" on public.ratings
  for insert to authenticated with check (user_id = auth.uid());
create policy "edit own ratings" on public.ratings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own ratings" on public.ratings
  for delete to authenticated using (user_id = auth.uid());

-- Want to watch: private.
create policy "own watchlist" on public.watchlist
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watchlist credits" on public.watchlist_credits
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_connected(auth.uid(), recommender_id));

-- Reactions: send to connections; see ones you sent or received.
create policy "see own reactions" on public.reactions
  for select to authenticated using (auth.uid() in (from_user, to_user));
create policy "send thanks" on public.reactions
  for insert to authenticated
  with check (from_user = auth.uid() and from_user <> to_user and public.is_connected(from_user, to_user));

-- Quick-pick skips: private.
create policy "own skips" on public.quickpick_skips
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activity: read and mark read your own.
create policy "see own activity" on public.activity
  for select to authenticated using (user_id = auth.uid());
create policy "mark own activity read" on public.activity
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The app can reach only these tables, only when signed in. Nothing for signed-out visitors.
grant usage on schema public to authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, delete                 on public.connections       to authenticated;
grant select, insert                 on public.invites           to authenticated;
grant select, insert                 on public.titles            to authenticated;
grant select                         on public.title_providers   to authenticated;
grant select, insert, update, delete on public.ratings           to authenticated;
grant select, insert, update, delete on public.watchlist         to authenticated;
grant select, insert, delete         on public.watchlist_credits to authenticated;
grant select, insert, delete         on public.reactions         to authenticated;
grant select, insert, delete         on public.quickpick_skips   to authenticated;
grant select, update (read_at)       on public.activity          to authenticated;

-- =====================================================================
-- 4. Automatic behavior
-- =====================================================================

-- New sign-in -> new profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name) values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Ratings: a new rating, a changed rating, or a new note moves the feed card up.
-- Fixing an existing note does not.
create or replace function public.ratings_touch()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.rating is distinct from old.rating
       or (coalesce(old.note, '') = '' and coalesce(new.note, '') <> '') then
      new.activity_at := now();
    else
      new.activity_at := old.activity_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger ratings_touch before insert or update on public.ratings
  for each row execute function public.ratings_touch();

-- Loved or Liked something you saved from a friend -> they get "loved your pick".
create or replace function public.notify_recommenders()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.rating in ('loved', 'liked')
     and (tg_op = 'INSERT' or new.rating is distinct from old.rating) then
    insert into public.activity (user_id, actor_id, kind, title_id)
    select c.recommender_id, new.user_id,
           case new.rating when 'loved' then 'loved_your_pick' else 'liked_your_pick' end,
           new.title_id
    from public.watchlist_credits c
    where c.user_id = new.user_id and c.title_id = new.title_id
      and c.recommender_id <> new.user_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger ratings_notify after insert or update on public.ratings
  for each row execute function public.notify_recommenders();

-- "Thanks" -> activity for the person thanked.
create or replace function public.notify_thanks()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.activity (user_id, actor_id, kind, title_id)
  values (new.to_user, new.from_user, 'thanks', new.title_id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger reactions_notify after insert on public.reactions
  for each row execute function public.notify_thanks();

-- =====================================================================
-- 5. Actions the app calls
-- =====================================================================

-- Accept an invite: connects you to every host (phase 1: Leigh and Brian).
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

-- Delete my account and everything I've added.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.redeem_invite(text)  from public, anon;
revoke execute on function public.delete_my_account()  from public, anon;
grant  execute on function public.redeem_invite(text)  to authenticated;
grant  execute on function public.delete_my_account()  to authenticated;
revoke execute on function public.is_connected(uuid, uuid) from public, anon;
revoke execute on function public.is_host(uuid)            from public, anon;
grant  execute on function public.is_connected(uuid, uuid) to authenticated;
grant  execute on function public.is_host(uuid)            to authenticated;

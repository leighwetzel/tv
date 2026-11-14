-- 007: People without an invite can ask for one. Run after 006, once, in Supabase > SQL Editor.
-- Safe to run again.
--
-- Anyone (signed in or not) can send a request: name, email, who they know.
-- Only the people listed in request_inbox see requests. That's you: put your email in step 2.
-- Asking says nothing about whether an email already has an account.

-- 1. Requests ----------------------------------------------------------------

create table if not exists public.invite_requests (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null check (char_length(email) between 3 and 200 and email like '%_@_%'),
  knows      text not null default '' check (char_length(knows) <= 200),
  created_at timestamptz not null default now(),
  handled    text check (handled in ('invited', 'not_now')),
  handled_at timestamptz
);
create index if not exists invite_requests_email on public.invite_requests (lower(email), created_at);
alter table public.invite_requests enable row level security;

-- 2. Who sees requests ----------------------------------------------------------
-- No access rules on this table, so nobody can add themselves from the app.

create table if not exists public.request_inbox (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.request_inbox enable row level security;

-- >>> Put your own sign-in email between the quotes, then run. <<<
insert into public.request_inbox (user_id)
select id from auth.users where lower(email) = lower('YOUR-EMAIL-HERE')
on conflict do nothing;

create or replace function public.gets_invite_requests()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.request_inbox where user_id = auth.uid()); $$;

drop policy if exists "inbox sees requests" on public.invite_requests;
create policy "inbox sees requests" on public.invite_requests
  for select to authenticated using (public.gets_invite_requests());

drop policy if exists "inbox handles requests" on public.invite_requests;
create policy "inbox handles requests" on public.invite_requests
  for update to authenticated using (public.gets_invite_requests()) with check (public.gets_invite_requests());

-- 3. Sending a request -------------------------------------------------------------
-- The only way in. Quietly drops repeats (same email within a day) and floods (over 20 in an hour),
-- and always answers the same way, so it can't be used to test emails.

create or replace function public.request_invite(p_name text, p_email text, p_knows text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  n text := left(btrim(coalesce(p_name, '')), 80);
  e text := lower(left(btrim(coalesce(p_email, '')), 200));
  k text := left(btrim(coalesce(p_knows, '')), 200);
begin
  if n = '' or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if exists (select 1 from public.invite_requests where lower(email) = e and created_at > now() - interval '1 day') then return; end if;
  if (select count(*) from public.invite_requests where created_at > now() - interval '1 hour') >= 20 then return; end if;
  insert into public.invite_requests (name, email, knows) values (n, e, k);
end;
$$;

revoke execute on function public.request_invite(text, text, text) from public;
grant  execute on function public.request_invite(text, text, text) to anon, authenticated;
revoke execute on function public.gets_invite_requests() from public, anon;
grant  execute on function public.gets_invite_requests() to authenticated;

-- 4. Check -----------------------------------------------------------------------
-- Should list exactly one row: you. If it's empty, fix the email in step 2 and run again.
select p.name, u.email from public.request_inbox r join public.profiles p on p.id = r.user_id join auth.users u on u.id = r.user_id;

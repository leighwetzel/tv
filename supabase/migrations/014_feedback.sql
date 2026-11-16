-- 014: Feedback from TV Rex and Wiki Walk. Run after 013, once, in Supabase > SQL Editor. Safe to run again.
--
-- Anyone can send feedback (Wiki Walk has no sign-in). If they're signed in to TV Rex, it records who they are,
-- so there's no name to type. Only the people in request_inbox (you) can read and resolve it.

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  app         text not null check (app in ('tv', 'walk', 'other')),
  kind        text not null check (kind in ('bug', 'suggestion')),
  message     text not null check (char_length(message) between 1 and 2000),
  user_id     uuid references public.profiles (id) on delete set null,
  name        text not null default '' check (char_length(name) <= 80),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists feedback_open on public.feedback (created_at desc) where resolved_at is null;
alter table public.feedback enable row level security;

drop policy if exists "inbox sees feedback" on public.feedback;
create policy "inbox sees feedback" on public.feedback
  for select to authenticated using (public.gets_invite_requests());
drop policy if exists "inbox resolves feedback" on public.feedback;
create policy "inbox resolves feedback" on public.feedback
  for update to authenticated using (public.gets_invite_requests()) with check (public.gets_invite_requests());
grant select, update (resolved_at) on public.feedback to authenticated;

-- The only way to send. Signed in: your TV Rex name is used. Quietly drops floods (over 30 in an hour).
create or replace function public.send_feedback(p_app text, p_kind text, p_message text, p_name text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  m text := left(btrim(coalesce(p_message, '')), 2000);
  n text := left(btrim(coalesce(p_name, '')), 80);
begin
  if p_app not in ('tv', 'walk', 'other') or p_kind not in ('bug', 'suggestion') or m = '' then return false; end if;
  if me is not null then n := coalesce((select name from public.profiles where id = me), n); end if;
  if me is null and n = '' then return false; end if;
  if (select count(*) from public.feedback where created_at > now() - interval '1 hour') >= 30 then return true; end if;
  insert into public.feedback (app, kind, message, user_id, name) values (p_app, p_kind, m, me, n);
  return true;
end;
$$;

revoke execute on function public.send_feedback(text, text, text, text) from public;
grant  execute on function public.send_feedback(text, text, text, text) to anon, authenticated;

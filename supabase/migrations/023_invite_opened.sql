-- 023: See when a named invite link was opened (Nov 23). Run after 022, once, in Supabase > SQL Editor. Safe to run again.
--
-- My invites now shows Pending -> Opened -> Joined. The invite landing page records the first time a
-- named link is opened. Message previews (iMessage etc.) don't count: they don't run the page's script.
-- Sending a link again from My invites resets it to Pending, so "Opened" always means
-- they opened it since you last sent it.

alter table public.invite_links add column if not exists opened_at timestamptz;

-- Called by the landing page, signed in or not. Named links only (your personal link goes to many people).
create or replace function public.mark_invite_opened(invite_code text)
returns void language sql security definer set search_path = public
as $$
  update public.invite_links set opened_at = now()
  where code = invite_code and for_name is not null and opened_at is null;
$$;
revoke execute on function public.mark_invite_opened(text) from public;
grant  execute on function public.mark_invite_opened(text) to anon, authenticated;

-- Called when you send a pending link again: back to Pending.
create or replace function public.reset_invite_opened(invite_code text)
returns void language sql security definer set search_path = public
as $$
  update public.invite_links set opened_at = null
  where code = invite_code and owner = auth.uid();
$$;
revoke execute on function public.reset_invite_opened(text) from public, anon;
grant  execute on function public.reset_invite_opened(text) to authenticated;

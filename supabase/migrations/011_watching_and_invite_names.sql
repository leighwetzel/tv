-- 011: Watching, and names on invite links. Run after 010, once, in Supabase > SQL Editor. Safe to run again.
--
-- Watching: a Want to watch title you've started. Still private to you, like the rest of My list.
-- Invite names: an optional "Who's it for?" on each link, so your pending invites say who they're for.
--   Only you see your own invites (the existing "see own invites" rule), names included.

alter table public.watchlist add column if not exists started_at timestamptz;

alter table public.invites add column if not exists for_name text;
alter table public.invites drop constraint if exists invites_for_name_check;
alter table public.invites add constraint invites_for_name_check check (char_length(for_name) <= 80);

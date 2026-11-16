-- 013: Genres on titles, for the Genre filter. Run after 012, once, in Supabase > SQL Editor. Safe to run again.
--
-- TMDB genre ids (TV and movie lists differ a little). New titles get them from search;
-- titles already in TV Rex are filled in by the app the first time they show up.
alter table public.titles add column if not exists genres int[];

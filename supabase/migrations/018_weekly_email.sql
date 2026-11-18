-- 018: The Sunday email. Run after 017, once, in Supabase > SQL Editor. Safe to run again.
--
-- email_titles: every title that has been in someone's Sunday email, so it never shows up for them again.
-- email_sends:  one row per person per Sunday, so a retry can't send the same week twice.
-- Only the server function (service role) reads or writes these. The app can't see them.

create table if not exists public.email_titles (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  title_id  text not null references public.titles (id) on delete cascade,
  sent_at   timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.email_sends (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week         date not null,          -- the Sunday, Pacific time
  sent_at      timestamptz not null default now(),
  title_count  int not null default 0,
  primary key (user_id, week)
);

alter table public.email_titles enable row level security;
alter table public.email_sends  enable row level security;

grant all on public.email_titles to service_role;
grant all on public.email_sends  to service_role;

-- Check: both tables should be listed.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('email_titles', 'email_sends');

-- Run once, AFTER Leigh and Brian have each signed in to the app at least once.
-- Replace the two emails, then paste into Supabase > SQL Editor and Run.

with hosts as (
  select id from auth.users
  where lower(email) in (lower('LEIGH_EMAIL_HERE'), lower('BRIAN_EMAIL_HERE'))
)
update public.profiles set is_host = true where id in (select id from hosts);

-- Connect the two hosts to each other.
insert into public.connections (user_a, user_b)
select least(a.id, b.id), greatest(a.id, b.id)
from public.profiles a join public.profiles b on a.id < b.id
where a.is_host and b.is_host
on conflict do nothing;

-- Check: should list both of you with is_host = true.
select p.name, u.email, p.is_host from public.profiles p join auth.users u on u.id = p.id where p.is_host;

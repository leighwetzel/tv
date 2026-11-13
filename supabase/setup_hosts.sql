-- Run once, AFTER Leigh has signed in to the app at least once.
-- Paste into Supabase > SQL Editor and Run.

update public.profiles set is_host = true
where id = (select id from auth.users where lower(email) = 'leigh.wetzel@gmail.com');

-- Check: should list Leigh with is_host = true.
select p.name, u.email, p.is_host
from public.profiles p join auth.users u on u.id = p.id
where p.is_host;

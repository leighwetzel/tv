-- 1. See everyone who has signed up.
select email, email_confirmed_at, created_at from auth.users order by created_at;

-- 2. Delete test accounts (any YOUR-NAME+something@gmail.com address).
--    Their ratings, lists and activity are deleted with them.
delete from auth.users where lower(email) like 'YOUR-NAME+%@gmail.com';

-- 3. Mark Leigh's account as confirmed.
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = 'YOUR-EMAIL-HERE';

-- 4. Check: should show only real accounts, Leigh confirmed.
select email, email_confirmed_at from auth.users order by created_at;

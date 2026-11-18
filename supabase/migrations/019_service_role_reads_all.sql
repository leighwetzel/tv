-- 019: Let the server functions read every table (the Sunday email needs profiles, follows, ratings, watchlist).
-- Found Nov 18: the email function got "permission denied for table profiles".
-- Run once in Supabase > SQL Editor. Safe to run again.
grant all on all tables in schema public to service_role;

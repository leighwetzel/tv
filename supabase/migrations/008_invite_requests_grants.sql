-- 008: Let the app read and mark invite requests. Run after 007.
-- 007 forgot these, so requests saved but never showed in Me.
-- The policies from 007 still decide who sees rows (only request_inbox).
grant select on public.invite_requests to authenticated;
grant update (handled, handled_at) on public.invite_requests to authenticated;

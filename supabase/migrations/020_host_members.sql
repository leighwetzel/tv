-- 020: Members page for hosts (Nov 20). Everyone who has joined, newest first, with email and who invited them.
-- Only hosts get rows; everyone else gets an empty list.
-- Run once in Supabase > SQL Editor. Safe to run again.
create or replace function public.host_members()
returns table (id uuid, name text, email text, joined_at timestamptz, onboarded boolean,
               is_host boolean, invited_by uuid, invited_by_name text, for_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, u.email::text, coalesce(i.used_at, p.created_at), p.onboarded, p.is_host,
         i.created_by, ip.name, i.for_name
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (select * from public.invites x where x.used_by = p.id order by x.used_at limit 1) i on true
  left join public.profiles ip on ip.id = i.created_by
  where p.is_member and public.is_host(auth.uid())
  order by coalesce(i.used_at, p.created_at) desc;
$$;
revoke execute on function public.host_members() from public, anon;
grant execute on function public.host_members() to authenticated;

-- Invite page: say whether the inviter is a host, so Leigh's own links can show
-- a personal note ("I made this app…"). Same as 015 plus one field.
create or replace function public.invite_preview(invite_code text)
returns json language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'status', case
      when i.code is null then 'invalid'
      when i.used_by is not null then 'used'
      when i.expires_at <= now() then 'expired'
      else 'ok' end,
    'inviter_id', p.id,
    'name', nullif(trim(p.name), ''),
    'avatar_url', p.avatar_url,
    'is_host', coalesce(p.is_host, false))
  from (select 1) one
  left join public.invites i on i.code = invite_code
  left join public.profiles p on p.id = i.created_by;
$$;

revoke execute on function public.invite_preview(text) from public;
grant  execute on function public.invite_preview(text) to anon, authenticated;

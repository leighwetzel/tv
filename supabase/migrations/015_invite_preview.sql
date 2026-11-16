-- 015: The invite landing page. Run after 014, once, in Supabase > SQL Editor. Safe to run again.
--
-- Someone who opens an invite link sees who invited them before signing in.
-- Given a link's code, this returns the inviter's display name, photo and id, and whether the link
-- still works. Nothing else: no emails, no reviews. Codes are 18 random hex characters, so they
-- can't be guessed.

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
    'avatar_url', p.avatar_url)
  from (select 1) one
  left join public.invites i on i.code = invite_code
  left join public.profiles p on p.id = i.created_by;
$$;

revoke execute on function public.invite_preview(text) from public;
grant  execute on function public.invite_preview(text) to anon, authenticated;

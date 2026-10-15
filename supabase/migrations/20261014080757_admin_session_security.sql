-- REVIEW REQUIRED. Run after aven_mvp_foundation; no remote execution yet.
-- Supabase Auth validates the JWT signature/issuer/exp before PostgREST.
-- This adds live session authorization, not a custom JWT issuer/token store.
alter table public.admin_profiles add column sessions_revoked_before timestamptz;

-- Invalidates pre-lock sessions permanently, including after re-enabling the
-- account. No client may move this cutoff backwards or edit Auth-owned tables.
create function private.revoke_sessions_on_account_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if OLD.active and not NEW.active then
    NEW.sessions_revoked_before := statement_timestamp();
  else
    NEW.sessions_revoked_before := OLD.sessions_revoked_before;
  end if;
  return NEW;
end;
$$;
revoke all on function private.revoke_sessions_on_account_lock() from public, anon, authenticated, service_role;
create trigger revoke_sessions_on_account_lock before update on public.admin_profiles
  for each row execute function private.revoke_sessions_on_account_lock();

create function private.admin_session_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', p.role,
    'expires_at', least(s.created_at + interval '604800 seconds', s.not_after)
  )
  from auth.sessions s join public.admin_profiles p on p.user_id = s.user_id
  where s.id = case
      when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid else null end
    and s.user_id = (select auth.uid())
    and p.active
    and s.created_at <= statement_timestamp()
    and s.created_at + interval '604800 seconds' > statement_timestamp()
    and (s.not_after is null or s.not_after > statement_timestamp())
    and (p.sessions_revoked_before is null or s.created_at > p.sessions_revoked_before);
$$;
revoke all on function private.admin_session_context() from public, anon, authenticated, service_role;
grant execute on function private.admin_session_context() to authenticated;

create or replace function private.current_admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select private.admin_session_context() ->> 'role';
$$;
revoke all on function private.current_admin_role() from public, anon, authenticated, service_role;
grant execute on function private.current_admin_role() to authenticated;

-- The old self-read branch was the only privileged policy that did not use
-- current_admin_role(). Require a live session on BOTH read branches.
drop policy admin_self_or_super_read on public.admin_profiles;
create policy admin_self_or_super_read on public.admin_profiles for select to authenticated
  using ((select private.current_admin_role()) is not null
    and (user_id = (select auth.uid()) or (select private.current_admin_role()) = 'super_admin'));

-- No input: callers can inspect only their own validated session context.
-- SQL NULL when expired/revoked/inactive/unprovisioned; no tokens or Auth rows.
create function public.get_admin_session_context() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.admin_session_context();
$$;
revoke all on function public.get_admin_session_context() from public, anon, authenticated, service_role;
grant execute on function public.get_admin_session_context() to authenticated;

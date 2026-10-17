-- Local schema change only. Apply through a reviewed migration, never from an app request.
-- "staff" remains a legacy editor role for existing accounts and older clients.
alter table public.admin_profiles drop constraint admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in ('super_admin', 'admin', 'editor', 'staff'));

-- The existing admin_guard trigger serializes all changes to the active super
-- admin count. Keep it in place so service-role writes and Auth cascades cannot
-- remove the last active super admin.

-- A locked account cannot keep an Auth session alive. The existing cutoff also
-- prevents a previously issued session from becoming valid after re-enabling.
create function private.expire_locked_staff_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (TG_OP = 'DELETE' or (OLD.active and not NEW.active)) then
    update auth.sessions set not_after = statement_timestamp()
      where user_id = OLD.user_id
        and (not_after is null or not_after > statement_timestamp());
    -- Auth refresh tokens are separate from access tokens. Remove them if the
    -- installed Auth schema exposes the table; expired JWTs still fail the
    -- live profile/session check even if Auth cleanup is delayed.
    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens where session_id in (select id from auth.sessions where user_id = $1)'
        using OLD.user_id;
    end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function private.expire_locked_staff_sessions() from public, anon, authenticated, service_role;
create trigger expire_locked_staff_sessions after update or delete on public.admin_profiles
  for each row execute function private.expire_locked_staff_sessions();

-- Managers can inspect staff below them. Only super admins retain direct
-- profile writes; the server's service client performs checked management.
drop policy admin_self_or_super_read on public.admin_profiles;
create policy admin_manager_read on public.admin_profiles for select to authenticated
  using ((select private.current_admin_role()) is not null and
    (user_id = (select auth.uid())
      or (select private.current_admin_role()) = 'super_admin'
      or ((select private.current_admin_role()) = 'admin' and role in ('admin', 'editor', 'staff'))));

-- Admins can manage catalog structure; editors and legacy staff retain
-- product/media/inquiry access through the existing staff policies.
drop policy super_write on public.categories;
create policy manager_write on public.categories for all to authenticated
  using ((select private.current_admin_role()) in ('super_admin', 'admin'))
  with check ((select private.current_admin_role()) in ('super_admin', 'admin'));
drop policy super_write on public.consultant_profiles;
create policy manager_write on public.consultant_profiles for all to authenticated
  using ((select private.current_admin_role()) in ('super_admin', 'admin'))
  with check ((select private.current_admin_role()) in ('super_admin', 'admin'));

drop policy newsletter_staff_read on public.newsletter_subscribers;
create policy newsletter_staff_read on public.newsletter_subscribers for select to authenticated
  using ((select private.current_admin_role()) in ('super_admin', 'admin', 'editor', 'staff'));

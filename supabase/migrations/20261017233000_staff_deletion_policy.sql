-- Staff identities are retained as disabled profiles after Auth soft deletion.
-- A hard profile delete would erase an assignment and cascade to a consultant
-- profile. Reject it even when the caller has service-role privileges.
create function private.preserve_staff_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Staff profiles must be deactivated and retained'
    using errcode = '23514';
end;
$$;
revoke all on function private.preserve_staff_history() from public, anon, authenticated, service_role;
create trigger zz_preserve_staff_history before delete on public.admin_profiles
  for each row execute function private.preserve_staff_history();

-- Defense in depth if the profile deletion policy is ever changed: removing a
-- staff row must never silently remove its public consultant record.
alter table public.consultant_profiles drop constraint consultant_profiles_user_id_fkey;
alter table public.consultant_profiles add constraint consultant_profiles_user_id_fkey
  foreign key (user_id) references public.admin_profiles(user_id) on delete restrict;

-- Removing only the public contact profile is allowed. Record who removed it
-- and which staff identity it belonged to before the directory row disappears.
create function private.audit_consultant_removal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, changes)
  values (auth.uid(), 'DELETE', 'consultant_profiles', OLD.user_id,
    jsonb_build_object('user_id', OLD.user_id, 'public_name', OLD.public_name,
      'enabled', OLD.enabled));
  return OLD;
end;
$$;
revoke all on function private.audit_consultant_removal() from public, anon, authenticated, service_role;
create trigger audit_consultant_removal after delete on public.consultant_profiles
  for each row execute function private.audit_consultant_removal();

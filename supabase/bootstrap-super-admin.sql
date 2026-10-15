-- MANUAL, SEPARATELY APPROVED OPERATION AFTER THE SCHEMA MIGRATION.
-- First create/verify the intended Auth user through the Supabase Dashboard.
-- Replace target_user and display_name below; never put a password in SQL.
-- Execute as postgres. This is intentionally NOT an automatic migration/seed.
begin;
do $$
declare
  target_user uuid := '00000000-0000-0000-0000-000000000000';
  admin_count integer;
begin
  select active_count into admin_count from private.admin_guard where singleton for update;
  if admin_count is distinct from 0 then raise exception 'Bootstrap is only allowed before the first super_admin'; end if;
  if not exists (select 1 from auth.users where id = target_user and email_confirmed_at is not null) then
    raise exception 'Choose an existing, confirmed Auth user';
  end if;
  insert into public.admin_profiles(user_id, display_name, role, active)
    values (target_user, 'AvenFurniture administrator', 'super_admin', true);
end;
$$;
commit;

-- A changed role must never inherit a session issued under its old privileges.
-- The existing last-super-admin trigger serializes demotions and deactivations.
create or replace function private.revoke_sessions_on_account_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (OLD.active and not NEW.active) or OLD.role is distinct from NEW.role then
    NEW.sessions_revoked_before := statement_timestamp();
  else
    NEW.sessions_revoked_before := OLD.sessions_revoked_before;
  end if;
  return NEW;
end;
$$;
revoke all on function private.revoke_sessions_on_account_lock() from public, anon, authenticated, service_role;

-- Expire Auth sessions and refresh tokens in the same transaction as the
-- profile change. The live session context also checks the cutoff above.
create or replace function private.expire_locked_staff_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (TG_OP = 'DELETE' or (OLD.active and not NEW.active) or OLD.role is distinct from NEW.role) then
    update auth.sessions set not_after = statement_timestamp()
      where user_id = OLD.user_id
        and (not_after is null or not_after > statement_timestamp());
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

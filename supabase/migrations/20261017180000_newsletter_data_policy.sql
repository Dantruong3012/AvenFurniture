-- Local schema only. Applying this migration to Production requires separate approval.
-- unsubscribe_token stores a SHA-256 digest of a 256-bit bearer token, never the link token.
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  consent_timestamp timestamptz,
  consent_source text check (consent_source is null or length(consent_source) between 1 and 80),
  consent_version text check (consent_version is null or length(consent_version) between 1 and 40),
  consent_ip_hash text check (consent_ip_hash is null or consent_ip_hash ~ '^[0-9a-f]{64}$'),
  consent_user_agent_hash text check (consent_user_agent_hash is null or consent_user_agent_hash ~ '^[0-9a-f]{64}$'),
  unsubscribe_token text not null unique check (unsubscribe_token ~ '^[0-9a-f]{64}$'),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'active' or (consent_timestamp is not null and consent_source is not null and consent_version is not null)),
  check ((status = 'unsubscribed') = (unsubscribed_at is not null))
);
create index newsletter_pending_retention_idx on public.newsletter_subscribers(created_at)
  where status = 'pending';
create index newsletter_unsubscribed_at_idx on public.newsletter_subscribers(unsubscribed_at)
  where status = 'unsubscribed';
create trigger newsletter_touch_updated_at before update on public.newsletter_subscribers
  for each row execute function private.touch_updated_at();

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from public, anon, authenticated;
grant all on public.newsletter_subscribers to service_role;
grant select on public.newsletter_subscribers to authenticated;
create policy newsletter_staff_read on public.newsletter_subscribers for select to authenticated
  using ((select private.current_admin_role()) in ('staff', 'super_admin'));
-- No public table write or roster read. These narrow functions are the only public mutation surface.

create function public.subscribe_newsletter(
  p_email text, p_source text, p_version text, p_token_digest text,
  p_ip_hash text, p_user_agent_hash text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_email is null or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.length(p_email) > 254
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_source is null or pg_catalog.length(p_source) not between 1 and 80
    or p_version is null or pg_catalog.length(p_version) not between 1 and 40
    or p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$'
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
    or (p_user_agent_hash is not null and p_user_agent_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid newsletter consent' using errcode = '22023';
  end if;
  -- Existing addresses are left untouched. A new opt-in after unsubscribe needs
  -- a separately verified email flow; an anonymous form cannot reverse an opt-out.
  insert into public.newsletter_subscribers (
    email, status, consent_timestamp, consent_source, consent_version,
    consent_ip_hash, consent_user_agent_hash, unsubscribe_token
  ) values (
    p_email, 'active', pg_catalog.now(), p_source, p_version,
    p_ip_hash, p_user_agent_hash, p_token_digest
  ) on conflict (email) do nothing;
end;
$$;
revoke all on function public.subscribe_newsletter(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.subscribe_newsletter(text,text,text,text,text,text) to service_role;

create function public.unsubscribe_newsletter(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.newsletter_subscribers
    set status = 'unsubscribed', unsubscribed_at = pg_catalog.now()
    where unsubscribe_token = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
      and status <> 'unsubscribed';
  return found;
end;
$$;
revoke all on function public.unsubscribe_newsletter(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_newsletter(text) to anon, authenticated, service_role;

-- Pending intents expire after 30 days; unsubscribed addresses are purged after
-- 90 days. Active consent is retained until withdrawal. Run daily via pg_cron
-- when installed; operators can also invoke the service-only function manually.
create function public.cleanup_newsletter_retention() returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.newsletter_subscribers
    where (status = 'pending' and created_at < pg_catalog.now() - interval '30 days')
       or (status = 'unsubscribed' and unsubscribed_at < pg_catalog.now() - interval '90 days');
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_newsletter_retention() from public, anon, authenticated;
grant execute on function public.cleanup_newsletter_retention() to service_role;
do $$
begin
  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1,$2,$3)'
      using 'newsletter-retention-daily', '17 3 * * *', 'select public.cleanup_newsletter_retention()';
  end if;
end;
$$;

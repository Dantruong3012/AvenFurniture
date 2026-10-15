-- REVIEW REQUIRED: initial schema only. No remote execution or seed users/data.
-- Apply as postgres through the Supabase migration runner, in one transaction.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  role text not null check (role in ('super_admin', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A single counter row serializes changes, including concurrent demotions.
-- No API role may modify this counter or bypass its trigger.
create table private.admin_guard (
  singleton boolean primary key default true check (singleton),
  active_count integer not null default 0 check (active_count >= 0)
);
insert into private.admin_guard(singleton) values (true);
alter table private.admin_guard enable row level security;

create function private.current_admin_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.admin_profiles p
  where p.user_id = (select auth.uid()) and p.active;
$$;
revoke all on function private.current_admin_role() from public, anon, authenticated;
grant execute on function private.current_admin_role() to authenticated;

create function private.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare was_admin boolean := false; is_admin boolean := false;
begin
  if TG_OP <> 'INSERT' then was_admin := OLD.active and OLD.role = 'super_admin'; end if;
  if TG_OP <> 'DELETE' then is_admin := NEW.active and NEW.role = 'super_admin'; end if;
  if was_admin and not is_admin then
    update private.admin_guard set active_count = active_count - 1
      where singleton and active_count > 1;
    if not found then raise exception 'Cannot remove the last active super_admin' using errcode = '23514'; end if;
  elsif is_admin and not was_admin then
    update private.admin_guard set active_count = active_count + 1 where singleton;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
create trigger guard_last_super_admin before insert or update or delete on public.admin_profiles
  for each row execute function private.guard_last_super_admin();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  price numeric(12,2) check (price >= 0 and price <> 'NaN'::numeric),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo_title text, seo_description text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'published' or length(btrim(description)) > 0)
);
create index products_category_idx on public.products(category_id);
create index products_public_idx on public.products(created_at desc, id) where status = 'published';
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  cloudinary_asset_id text not null unique,
  public_id text not null unique,
  secure_url text not null check (secure_url like 'https://res.cloudinary.com/%'),
  width integer not null check (width > 0), height integer not null check (height > 0),
  format text not null, alt text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  unique(product_id, asset_id)
);
create index product_images_asset_idx on public.product_images(asset_id);
create unique index product_images_primary_idx on public.product_images(product_id) where is_primary;
create table public.consultant_profiles (
  user_id uuid primary key references public.admin_profiles(user_id) on delete cascade,
  public_name text not null check (length(btrim(public_name)) between 1 and 120),
  avatar_url text check (avatar_url like 'https://res.cloudinary.com/%'),
  zalo_phone text not null check (zalo_phone ~ '^[+]?[0-9]{9,15}$'),
  sort_order integer not null default 0, enabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  reference bigint generated always as identity unique,
  idempotency_key uuid not null unique,
  contact_name text not null check (length(btrim(contact_name)) between 1 and 120),
  contact_phone text not null check (length(btrim(contact_phone)) between 6 and 30),
  contact_email text check (length(contact_email) <= 254),
  original_submission jsonb not null check (jsonb_typeof(original_submission) = 'object'),
  message text not null default '' check (length(message) <= 10000),
  source text not null check (source in ('cart','product','contact','manual')),
  status text not null default 'new' check (status in ('new','consulting','completed','cancelled')),
  assignee_id uuid references public.admin_profiles(user_id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index inquiries_assignee_idx on public.inquiries(assignee_id);
create index inquiries_queue_idx on public.inquiries(status, created_at desc) where deleted_at is null;
create table public.inquiry_items (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  product_name text not null, product_slug text not null,
  unit_price numeric(12,2) check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  quantity integer not null check (quantity between 1 and 999)
);
create index inquiry_items_inquiry_idx on public.inquiry_items(inquiry_id);
create index inquiry_items_product_idx on public.inquiry_items(product_id);
create table public.inquiry_notes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.admin_profiles(user_id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index inquiry_notes_inquiry_idx on public.inquiry_notes(inquiry_id);
create index inquiry_notes_author_idx on public.inquiry_notes(author_id);
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(), locked_until timestamptz,
  provider_message_id text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index email_outbox_inquiry_idx on public.email_outbox(inquiry_id);
create index email_outbox_pending_idx on public.email_outbox(next_attempt_at) where status in ('pending','processing');
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, entity_table text not null, entity_id uuid not null,
  changes jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_table, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_id);
create table public.slug_redirects (
  old_slug text primary key check (old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index slug_redirects_product_idx on public.slug_redirects(product_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  NEW.updated_at := now();
  if TG_TABLE_NAME = 'products' then NEW.version := OLD.version + 1; end if;
  return NEW;
end;
$$;
create function private.audit_admin_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, entity_table, entity_id, changes)
  values (auth.uid(), TG_OP, 'admin_profiles', coalesce(NEW.user_id, OLD.user_id),
    jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role, 'old_active', OLD.active, 'new_active', NEW.active));
  return null;
end;
$$;
create trigger audit_admin_profile after insert or update or delete on public.admin_profiles
  for each row execute function private.audit_admin_profile();
create function private.protect_inquiry_original() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if NEW.original_submission is distinct from OLD.original_submission or NEW.message is distinct from OLD.message
    or NEW.source is distinct from OLD.source or NEW.idempotency_key is distinct from OLD.idempotency_key
    or NEW.created_at is distinct from OLD.created_at or NEW.reference is distinct from OLD.reference then
    raise exception 'Original inquiry submission is immutable' using errcode = '23514';
  end if;
  if (NEW.contact_name, NEW.contact_phone, NEW.contact_email) is distinct from
     (OLD.contact_name, OLD.contact_phone, OLD.contact_email) then
    insert into public.audit_logs(actor_id, action, entity_table, entity_id, changes)
    values (auth.uid(), 'contact_updated', 'inquiries', OLD.id,
      jsonb_build_object('before', jsonb_build_object('name', OLD.contact_name, 'phone', OLD.contact_phone, 'email', OLD.contact_email),
                         'after', jsonb_build_object('name', NEW.contact_name, 'phone', NEW.contact_phone, 'email', NEW.contact_email)));
  end if;
  return NEW;
end;
$$;
create trigger protect_inquiry_original before update on public.inquiries
  for each row execute function private.protect_inquiry_original();

-- Explicit grants avoid relying on project-specific default privileges.
do $$
declare t text;
begin
  foreach t in array array['admin_profiles','categories','products','media_assets','product_images','consultant_profiles',
    'inquiries','inquiry_items','inquiry_notes','email_outbox','audit_logs','slug_redirects'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['admin_profiles','categories','products','media_assets','consultant_profiles','inquiries','inquiry_notes','email_outbox'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
  end loop;
end;
$$;
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.products, public.media_assets, public.product_images, public.slug_redirects to anon;
grant insert, delete on public.admin_profiles to authenticated;
grant update(display_name, role, active) on public.admin_profiles to authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images, public.consultant_profiles, public.slug_redirects to authenticated;
-- Media writes require a server that verifies the Cloudinary upload result.
-- Inquiry + items + outbox inserts reserved for a validated transactional service.
grant update(contact_name, contact_phone, contact_email, status, assignee_id, deleted_at) on public.inquiries to authenticated;
grant insert, delete on public.inquiry_notes to authenticated;
grant update(body) on public.inquiry_notes to authenticated;
revoke all on sequence public.inquiries_reference_seq from public, anon, authenticated;
grant usage, select on sequence public.inquiries_reference_seq to service_role;

create policy admin_self_or_super_read on public.admin_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.current_admin_role()) = 'super_admin');
create policy admin_super_insert on public.admin_profiles for insert to authenticated
  with check ((select private.current_admin_role()) = 'super_admin');
create policy admin_super_update on public.admin_profiles for update to authenticated
  using ((select private.current_admin_role()) = 'super_admin') with check ((select private.current_admin_role()) = 'super_admin');
create policy admin_super_delete on public.admin_profiles for delete to authenticated
  using ((select private.current_admin_role()) = 'super_admin');

create policy categories_public_read on public.categories for select to anon, authenticated using (active);
create policy products_public_read on public.products for select to anon, authenticated
  using (status = 'published' and exists (select 1 from public.categories c where c.id = category_id and c.active));
create policy images_public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p join public.categories c on c.id = p.category_id
    where p.id = product_id and p.status = 'published' and c.active));
create policy media_public_read on public.media_assets for select to anon, authenticated
  using (exists (select 1 from public.product_images i join public.products p on p.id = i.product_id
    join public.categories c on c.id = p.category_id where i.asset_id = media_assets.id and p.status = 'published' and c.active));
create policy redirects_public_read on public.slug_redirects for select to anon, authenticated
  using (exists (select 1 from public.products p join public.categories c on c.id = p.category_id
    where p.id = product_id and p.status = 'published' and c.active));

do $$
declare t text;
begin
  foreach t in array array['categories','products','media_assets','product_images','consultant_profiles','inquiries','inquiry_items','inquiry_notes','email_outbox','slug_redirects'] loop
    execute format('create policy staff_read on public.%I for select to authenticated using ((select private.current_admin_role()) is not null)', t);
  end loop;
  foreach t in array array['products','product_images','slug_redirects'] loop
    execute format('create policy staff_write on public.%I for all to authenticated using ((select private.current_admin_role()) is not null) with check ((select private.current_admin_role()) is not null)', t);
  end loop;
  foreach t in array array['categories','consultant_profiles'] loop
    execute format('create policy super_write on public.%I for all to authenticated using ((select private.current_admin_role()) = ''super_admin'') with check ((select private.current_admin_role()) = ''super_admin'')', t);
  end loop;
end;
$$;
create policy inquiries_staff_update on public.inquiries for update to authenticated
  using ((select private.current_admin_role()) is not null) with check ((select private.current_admin_role()) is not null);
create policy notes_staff_insert on public.inquiry_notes for insert to authenticated
  with check ((select private.current_admin_role()) is not null and author_id = (select auth.uid()));
create policy notes_staff_update on public.inquiry_notes for update to authenticated
  using ((select private.current_admin_role()) is not null) with check ((select private.current_admin_role()) is not null);
create policy notes_staff_delete on public.inquiry_notes for delete to authenticated using ((select private.current_admin_role()) is not null);
create policy audit_super_read on public.audit_logs for select to authenticated using ((select private.current_admin_role()) = 'super_admin');

-- Deliberately expose only public consultant fields, never account ID/login email.
create function private.public_consultants()
returns table(public_name text, avatar_url text, zalo_phone text, sort_order integer)
language sql stable security definer set search_path = '' as $$
  select c.public_name, c.avatar_url, c.zalo_phone, c.sort_order
  from public.consultant_profiles c join public.admin_profiles p on p.user_id = c.user_id
  where c.enabled and p.active order by c.sort_order, c.public_name;
$$;
create function public.list_public_consultants()
returns table(public_name text, avatar_url text, zalo_phone text, sort_order integer)
language sql stable security invoker set search_path = '' as $$ select * from private.public_consultants(); $$;
revoke all on function private.current_admin_role(), private.guard_last_super_admin(),
  private.touch_updated_at(), private.audit_admin_profile(), private.protect_inquiry_original(),
  private.public_consultants() from public, anon, authenticated;
grant execute on function private.current_admin_role() to authenticated;
grant usage on schema private to anon;
grant execute on function private.public_consultants() to anon, authenticated;
revoke all on function public.list_public_consultants() from public, anon, authenticated;
grant execute on function public.list_public_consultants() to anon, authenticated;

-- Applied to project eofdtqnnqgxaoykcbfrv as version 20261015085103.
-- Existing assets remain ready; bytes and uploaded_by are nullable for legacy rows.
alter table public.media_assets
  add column bytes bigint check (bytes between 1 and 10485760),
  add column uploaded_by uuid references public.admin_profiles(user_id) on delete set null,
  add column status text not null default 'ready' check (status in ('ready','deleting','delete_failed'));
create index media_assets_status_idx on public.media_assets(status, created_at desc);
alter table public.product_images add constraint product_images_nonnegative_order check (sort_order >= 0);
create unique index product_images_position_idx on public.product_images(product_id, sort_order);

drop policy media_public_read on public.media_assets;
create policy media_public_read on public.media_assets for select to anon, authenticated
  using (status = 'ready' and exists (
    select 1 from public.product_images i
    join public.products p on p.id = i.product_id
    join public.categories c on c.id = p.category_id
    where i.asset_id = media_assets.id and p.status = 'published' and c.active
  ));

-- Deferred checks cover direct PostgREST writes as well as the product RPC.
create function private.check_published_gallery() returns trigger
language plpgsql security definer set search_path = '' as $$
declare product_id_to_check uuid;
begin
  if TG_TABLE_NAME = 'products' then
    product_id_to_check := NEW.id;
  elsif TG_TABLE_NAME = 'product_images' then
    product_id_to_check := case when TG_OP = 'DELETE' then OLD.product_id else NEW.product_id end;
  else
    for product_id_to_check in select distinct i.product_id from public.product_images i
      where i.asset_id = NEW.id loop
      perform private.assert_gallery(product_id_to_check);
    end loop;
    return NEW;
  end if;
  perform private.assert_gallery(product_id_to_check);
  if TG_TABLE_NAME = 'product_images' and TG_OP = 'UPDATE' then
    if OLD.product_id <> NEW.product_id then perform private.assert_gallery(OLD.product_id); end if;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create function private.assert_gallery(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare published boolean; image_count integer; primary_count integer;
begin
  select status = 'published' into published from public.products where id = p_product_id;
  if not found then return; end if;
  select count(*), count(*) filter (where is_primary)
    into image_count, primary_count from public.product_images where product_id = p_product_id;
  if image_count > 20 then raise exception 'Maximum 20 product images' using errcode = '23514'; end if;
  if image_count > 0 and (primary_count <> 1 or not exists (
    select 1 from public.product_images i where i.product_id = p_product_id and i.is_primary
      and i.sort_order = (select min(sort_order) from public.product_images where product_id = p_product_id)
  )) then raise exception 'First product image must be primary' using errcode = '23514'; end if;
  if exists (select 1 from public.product_images i join public.media_assets a on a.id = i.asset_id
             where i.product_id = p_product_id and a.status <> 'ready') then
    raise exception 'Only ready images may be linked' using errcode = '23514';
  end if;
  if published and (image_count = 0 or primary_count <> 1 or exists (
    select 1 from public.product_images i join public.media_assets a on a.id = i.asset_id
    where i.product_id = p_product_id and length(btrim(a.alt)) = 0
  )) then raise exception 'Published products need a primary image and alt text on every image' using errcode = '23514'; end if;
end;
$$;
revoke all on function private.assert_gallery(uuid), private.check_published_gallery() from public, anon, authenticated;
create constraint trigger gallery_product_check after insert or update on public.products
  deferrable initially deferred for each row execute function private.check_published_gallery();
create constraint trigger gallery_link_check after insert or update or delete on public.product_images
  deferrable initially deferred for each row execute function private.check_published_gallery();
create constraint trigger gallery_asset_check after update on public.media_assets
  deferrable initially deferred for each row execute function private.check_published_gallery();

create function private.lock_gallery_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(86753091001);
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;
revoke all on function private.lock_gallery_mutation() from public, anon, authenticated;
create trigger gallery_mutation_lock before insert or update or delete on public.product_images
  for each row execute function private.lock_gallery_mutation();

-- Service workflow calls this as the signed-in admin. The row lock prevents
-- another claim; FK plus gallery checks prevent deleting an attached image.
create function public.claim_unused_media(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_status text; status_updated_at timestamptz;
begin
  if private.current_admin_role() is null then
    raise exception 'Admin session required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(86753091001);
  select status, updated_at into current_status, status_updated_at from public.media_assets where id = p_id for update;
  if not found then return false; end if;
  if exists (select 1 from public.product_images where asset_id = p_id) then
    raise exception 'Image is in use' using errcode = '23503';
  end if;
  -- A crashed worker may leave deleting behind. Retrying after five minutes is safe:
  -- Cloudinary destroy returns 'not found' when the first attempt already finished.
  if current_status = 'deleting' and status_updated_at > now() - interval '5 minutes' then
    raise exception 'Image deletion already in progress' using errcode = 'PT409';
  end if;
  update public.media_assets set status = 'deleting', updated_at = now() where id = p_id;
  return true;
end;
$$;
revoke all on function public.claim_unused_media(uuid) from public, anon;
grant execute on function public.claim_unused_media(uuid) to authenticated;

create or replace function public.save_catalog_product(p_id uuid, p_expected_version integer, p_data jsonb, p_asset_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved_id uuid;
begin
  if private.current_admin_role() is null then raise exception 'Admin session required' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_asset_ids is null
     or cardinality(p_asset_ids) > 20
     or cardinality(p_asset_ids) <> (select count(distinct x) from unnest(p_asset_ids) x) then
    raise exception 'Invalid product payload' using errcode = '22023';
  end if;
  if p_data->>'status' = 'published' and cardinality(p_asset_ids) = 0 then
    raise exception 'Published products need a primary image' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(86753091001);
  -- Claim and direct gallery writes share the same transaction lock.
  if (select count(*) from public.media_assets where id = any(p_asset_ids) and status = 'ready') <> cardinality(p_asset_ids) then
    raise exception 'Only ready images may be linked' using errcode = '23514';
  end if;
  if p_data->>'status' = 'published' and exists (
    select 1 from public.media_assets where id = any(p_asset_ids) and length(btrim(alt)) = 0
  ) then raise exception 'Every published image needs alt text' using errcode = '23514'; end if;
  if p_id is null then
    insert into public.products (name,slug,description,category_id,price,currency,attributes,featured,status,seo_title,seo_description)
    values (p_data->>'name',p_data->>'slug',p_data->>'description',(p_data->>'category_id')::uuid,
      (p_data->>'price')::numeric,p_data->>'currency',p_data->'attributes',(p_data->>'featured')::boolean,
      p_data->>'status',p_data->>'seo_title',p_data->>'seo_description') returning id into saved_id;
  else
    update public.products set name=p_data->>'name',slug=p_data->>'slug',description=p_data->>'description',
      category_id=(p_data->>'category_id')::uuid,price=(p_data->>'price')::numeric,currency=p_data->>'currency',
      attributes=p_data->'attributes',featured=(p_data->>'featured')::boolean,status=p_data->>'status',
      seo_title=p_data->>'seo_title',seo_description=p_data->>'seo_description'
    where id=p_id and version=p_expected_version returning id into saved_id;
    if saved_id is null then raise exception 'Product conflict' using errcode = 'PT409'; end if;
  end if;
  delete from public.product_images where product_id=saved_id;
  insert into public.product_images(product_id,asset_id,sort_order,is_primary)
    select saved_id,asset_id,(position-1)::integer,position=1 from unnest(p_asset_ids) with ordinality as assets(asset_id,position);
  return saved_id;
end;
$$;
revoke all on function public.save_catalog_product(uuid,integer,jsonb,uuid[]) from public,anon;
grant execute on function public.save_catalog_product(uuid,integer,jsonb,uuid[]) to authenticated;

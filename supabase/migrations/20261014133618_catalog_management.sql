-- Additive Phase 1 migration. No data backfill, table/policy/Auth changes.
-- SECURITY INVOKER: all writes, including inside the RPC, obey the caller's RLS.
-- A single transaction lock serializes catalog slug allocation at MVP scale.
create function private.guard_catalog_slug() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(86753091001);
  if TG_TABLE_NAME = 'products' then
    if exists (select 1 from public.slug_redirects where old_slug = NEW.slug and product_id <> NEW.id) then
      raise exception 'Reserved product slug' using errcode = '23505';
    end if;
    -- Returning to one's own previous URL is allowed; no redirect loop remains.
    delete from public.slug_redirects where old_slug = NEW.slug and product_id = NEW.id;
  else
    if exists (select 1 from public.products where slug = NEW.old_slug) then
      raise exception 'Slug is a current product URL' using errcode = '23505';
    end if;
  end if;
  return NEW;
end;
$$;
create function private.remember_product_slug() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if OLD.slug <> NEW.slug then
    insert into public.slug_redirects(old_slug,product_id) values (OLD.slug,NEW.id);
  end if;
  return NEW;
end;
$$;
revoke all on function private.guard_catalog_slug(), private.remember_product_slug() from public, anon, authenticated;
create trigger products_slug_guard before insert or update of slug on public.products
  for each row execute function private.guard_catalog_slug();
create trigger redirects_slug_guard before insert or update on public.slug_redirects
  for each row execute function private.guard_catalog_slug();
create trigger products_remember_slug after update of slug on public.products
  for each row execute function private.remember_product_slug();

create function public.save_catalog_product(p_id uuid, p_expected_version integer, p_data jsonb, p_asset_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved_id uuid;
begin
  if private.current_admin_role() is null then
    raise exception 'Admin session required' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_asset_ids is null
     or cardinality(p_asset_ids) > 20
     or cardinality(p_asset_ids) <> (select count(distinct x) from unnest(p_asset_ids) x) then
    raise exception 'Invalid product payload' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(86753091001);
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
    if saved_id is null then raise exception 'Product conflict' using errcode = '40001'; end if;
  end if;
  -- Replace links only, never delete Cloudinary assets. Failure rolls back product and redirects too.
  delete from public.product_images where product_id=saved_id;
  insert into public.product_images(product_id,asset_id,sort_order,is_primary)
    select saved_id,asset_id,(position-1)::integer,position=1 from unnest(p_asset_ids) with ordinality as assets(asset_id,position);
  return saved_id;
end;
$$;
revoke all on function public.save_catalog_product(uuid,integer,jsonb,uuid[]) from public,anon;
grant execute on function public.save_catalog_product(uuid,integer,jsonb,uuid[]) to authenticated;

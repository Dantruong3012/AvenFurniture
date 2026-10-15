-- Return HTTP 409 for application-level stale edits, not SQL serialization failure/HTTP 500.
-- No data, policy, privilege or Auth changes.
create or replace function public.save_catalog_product(p_id uuid, p_expected_version integer, p_data jsonb, p_asset_ids uuid[])
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
    if saved_id is null then raise exception 'Product conflict' using errcode = 'PT409'; end if;
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

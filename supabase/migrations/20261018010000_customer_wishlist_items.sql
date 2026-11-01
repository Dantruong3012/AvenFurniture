-- customer_wishlist_items was introduced with customer identity. Extend that
-- schema for synchronization without recreating the table or weakening its
-- existing session-bound SELECT, INSERT and DELETE RLS policies.
alter table public.customer_wishlist_items
  add column id uuid not null default gen_random_uuid();
alter table public.customer_wishlist_items
  drop constraint customer_wishlist_items_pkey,
  add constraint customer_wishlist_items_pkey primary key (id),
  add constraint customer_wishlist_items_user_product_key unique (user_id, product_id);

-- Serialize inserts per customer and reject a 101st distinct product even if a
-- client bypasses the application endpoint with the public Supabase API.
create function private.enforce_customer_wishlist_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
  if not exists (select 1 from public.customer_wishlist_items w
      where w.user_id = new.user_id and w.product_id = new.product_id)
    and (select count(*) from public.customer_wishlist_items w where w.user_id = new.user_id) >= 100 then
    raise exception 'customer wishlist item limit exceeded' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_customer_wishlist_limit() from public, anon, authenticated, service_role;
create trigger customer_wishlist_limit before insert on public.customer_wishlist_items
  for each row execute function private.enforce_customer_wishlist_limit();

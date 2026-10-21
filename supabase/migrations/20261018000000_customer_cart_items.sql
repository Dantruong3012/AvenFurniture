-- Quote-request selections only. This table contains no order, checkout,
-- delivery, payment or anonymous tracking data.
create table public.customer_cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index customer_cart_product_idx on public.customer_cart_items(product_id);

alter table public.customer_cart_items enable row level security;
revoke all on public.customer_cart_items from public, anon, authenticated;
grant all on public.customer_cart_items to service_role;
grant select, insert, delete on public.customer_cart_items to authenticated;
grant update(quantity) on public.customer_cart_items to authenticated;

create trigger customer_cart_touch_updated_at before update on public.customer_cart_items
  for each row execute function private.touch_updated_at();

create policy customer_cart_self_read on public.customer_cart_items for select to authenticated
  using (user_id = (select private.current_customer_id()));
create policy customer_cart_self_insert on public.customer_cart_items for insert to authenticated
  with check (user_id = (select private.current_customer_id())
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy customer_cart_self_update on public.customer_cart_items for update to authenticated
  using (user_id = (select private.current_customer_id()))
  with check (user_id = (select private.current_customer_id())
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy customer_cart_self_delete on public.customer_cart_items for delete to authenticated
  using (user_id = (select private.current_customer_id()));

-- Serialize inserts per customer and reject a 101st distinct product even if a
-- client bypasses the application endpoint with the public Supabase API.
create function private.enforce_customer_cart_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if not exists (select 1 from public.customer_cart_items c
      where c.user_id = new.user_id and c.product_id = new.product_id)
    and (select count(*) from public.customer_cart_items c where c.user_id = new.user_id) >= 100 then
    raise exception 'customer cart item limit exceeded' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_customer_cart_limit() from public, anon, authenticated, service_role;
create trigger customer_cart_limit before insert on public.customer_cart_items
  for each row execute function private.enforce_customer_cart_limit();

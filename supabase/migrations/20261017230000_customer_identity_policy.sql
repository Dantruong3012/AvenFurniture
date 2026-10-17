-- Customer identity is optional and separate from staff roles. No backfill or
-- automatic claim occurs when a customer signs up, changes email, or supplies
-- the same contact as a guest inquiry. A trusted service must verify control
-- of the particular inquiry's contact channel before linking it. Conflicting
-- ownership requires staff resolution; contact matching cannot reassign it.
-- Guest data stays local or unlinked until that explicit verification.
create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  contact_phone text check (contact_phone is null or
    (contact_phone ~ '^\+?[0-9 ().-]{6,30}$' and contact_phone ~ '[0-9]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anonymous wishlists remain in the browser. Authenticated wishlists contain
-- product references only; no address, payment, order, or checkout data.
create table public.customer_wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index customer_wishlist_product_idx on public.customer_wishlist_items(product_id);

alter table public.inquiries add column customer_user_id uuid references auth.users(id) on delete set null;
create index inquiries_customer_user_idx on public.inquiries(customer_user_id, created_at desc)
  where customer_user_id is not null and deleted_at is null;

-- Like staff access, customer access requires a live Supabase Auth session.
-- This function does not infer identity from a submitted contact value.
create function private.current_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id from auth.sessions s
  where s.id = case
      when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid else null end
    and s.user_id = (select auth.uid())
    and s.created_at <= statement_timestamp()
    and s.created_at + interval '604800 seconds' > statement_timestamp()
    and (s.not_after is null or s.not_after > statement_timestamp())
  limit 1;
$$;
revoke all on function private.current_customer_id() from public, anon, authenticated, service_role;
grant execute on function private.current_customer_id() to authenticated;

alter table public.customer_profiles enable row level security;
alter table public.customer_wishlist_items enable row level security;
revoke all on public.customer_profiles, public.customer_wishlist_items from public, anon, authenticated;
grant all on public.customer_profiles, public.customer_wishlist_items to service_role;
grant select, insert, delete on public.customer_profiles to authenticated;
grant update(display_name, contact_phone) on public.customer_profiles to authenticated;
grant select, insert, delete on public.customer_wishlist_items to authenticated;

create trigger touch_updated_at before update on public.customer_profiles
  for each row execute function private.touch_updated_at();

create policy customer_profile_self_read on public.customer_profiles for select to authenticated
  using (user_id = (select private.current_customer_id()));
create policy customer_profile_self_insert on public.customer_profiles for insert to authenticated
  with check (user_id = (select private.current_customer_id()));
create policy customer_profile_self_update on public.customer_profiles for update to authenticated
  using (user_id = (select private.current_customer_id()))
  with check (user_id = (select private.current_customer_id()));
create policy customer_profile_self_delete on public.customer_profiles for delete to authenticated
  using (user_id = (select private.current_customer_id()));

create policy customer_wishlist_self_read on public.customer_wishlist_items for select to authenticated
  using (user_id = (select private.current_customer_id()));
create policy customer_wishlist_self_insert on public.customer_wishlist_items for insert to authenticated
  with check (user_id = (select private.current_customer_id())
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
create policy customer_wishlist_self_delete on public.customer_wishlist_items for delete to authenticated
  using (user_id = (select private.current_customer_id()));

-- The staff policies remain in force. Customers see only explicitly linked,
-- non-deleted inquiries and their line items; guest contact matches grant nothing.
create policy inquiries_customer_read on public.inquiries for select to authenticated
  using (deleted_at is null and customer_user_id = (select private.current_customer_id()));
create policy inquiry_items_customer_read on public.inquiry_items for select to authenticated
  using (exists (select 1 from public.inquiries i where i.id = inquiry_id
    and i.deleted_at is null and i.customer_user_id = (select private.current_customer_id())));

-- No authenticated or anonymous role can set customer_user_id. Only a trusted
-- service can link an inquiry after independent proof of contact ownership.

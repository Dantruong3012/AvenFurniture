-- Additive Phase 5 migration: Atomic customer inquiry submission RPC.
-- SECURITY DEFINER: Executes with definer privileges to insert inquiries, items, and email_outbox atomically.
-- Execution is restricted strictly to service_role; anon and authenticated cannot call this function directly via PostgREST.

create or replace function public.submit_customer_inquiry(
  p_idempotency_key uuid,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_message text,
  p_source text,
  p_original_submission jsonb,
  p_items jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  reference bigint,
  is_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_reference bigint;
  v_clean_name text;
  v_clean_phone text;
  v_clean_email text;
  v_clean_message text;
  v_item_count integer;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  v_clean_name := btrim(coalesce(p_contact_name, ''));
  v_clean_phone := btrim(coalesce(p_contact_phone, ''));
  v_clean_email := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_clean_message := coalesce(p_message, '');

  if length(v_clean_name) < 1 or length(v_clean_name) > 120 then
    raise exception 'Contact name must be 1 to 120 characters' using errcode = '22023';
  end if;

  if length(v_clean_phone) < 6 or length(v_clean_phone) > 30 then
    raise exception 'Contact phone must be 6 to 30 characters' using errcode = '22023';
  end if;

  if v_clean_email is not null and (length(v_clean_email) > 254 or v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Invalid contact email' using errcode = '22023';
  end if;

  if length(v_clean_message) > 10000 then
    raise exception 'Message exceeds 10000 characters' using errcode = '22023';
  end if;

  if p_source is null or p_source not in ('cart', 'product', 'contact', 'manual') then
    raise exception 'Invalid inquiry source' using errcode = '22023';
  end if;

  if p_original_submission is null or jsonb_typeof(p_original_submission) <> 'object' then
    raise exception 'Original submission must be a JSON object' using errcode = '22023';
  end if;

  -- Fast path check for existing idempotency key
  select i.id, i.reference into v_inquiry_id, v_reference
  from public.inquiries i
  where i.idempotency_key = p_idempotency_key;

  if v_inquiry_id is not null then
    return query select v_inquiry_id, v_reference, true;
    return;
  end if;

  -- Insert inquiry with on conflict protection against concurrent execution
  insert into public.inquiries (
    idempotency_key, contact_name, contact_phone, contact_email, message, source, original_submission, status
  ) values (
    p_idempotency_key, v_clean_name, v_clean_phone, v_clean_email, v_clean_message, p_source, p_original_submission, 'new'
  )
  on conflict (idempotency_key) do nothing
  returning inquiries.id, inquiries.reference into v_inquiry_id, v_reference;

  -- If conflict occurred concurrently, return existing record without duplicate items/outbox
  if v_inquiry_id is null then
    select i.id, i.reference into v_inquiry_id, v_reference
    from public.inquiries i
    where i.idempotency_key = p_idempotency_key;

    return query select v_inquiry_id, v_reference, true;
    return;
  end if;

  -- Process items if provided
  if p_items is not null and p_items <> 'null'::jsonb then
    if jsonb_typeof(p_items) <> 'array' then
      raise exception 'Items must be a JSON array' using errcode = '22023';
    end if;

    v_item_count := jsonb_array_length(p_items);
    if v_item_count > 100 then
      raise exception 'Maximum 100 items allowed per inquiry' using errcode = '22023';
    end if;

    if v_item_count > 0 then
      insert into public.inquiry_items (
        inquiry_id, product_id, product_name, product_slug, unit_price, currency, quantity
      )
      select
        v_inquiry_id,
        nullif(item->>'product_id', '')::uuid,
        item->>'product_name',
        item->>'product_slug',
        case when item->>'unit_price' is null or item->>'unit_price' = '' then null else (item->>'unit_price')::numeric end,
        upper(item->>'currency'),
        (item->>'quantity')::integer
      from jsonb_array_elements(p_items) as item;
    end if;
  end if;

  -- Enqueue email outbox notification
  insert into public.email_outbox (inquiry_id, status, next_attempt_at)
  values (v_inquiry_id, 'pending', clock_timestamp());

  return query select v_inquiry_id, v_reference, false;
end;
$$;

revoke all on function public.submit_customer_inquiry(uuid,text,text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.submit_customer_inquiry(uuid,text,text,text,text,text,jsonb,jsonb) to service_role;

# Task Plan: inquiry-service-layer

Status: APPROVED

## 1. Objective
Build the transactional data layer, validation schemas, and repository for AvenFurniture's inquiry system (`inquiries`, `inquiry_items`, `inquiry_notes`, and `email_outbox`). Provide a hardened, atomic PostgreSQL RPC for customer submissions and an authenticated repository for admin management.

## 2. Technical Design & Architecture

### 2.1 Architectural Resolution for Atomicity & Idempotency
- **The Problem**: PostgREST client calls cannot span multiple tables in a single transaction across HTTP. Separate `.insert()` calls for `inquiries`, `inquiry_items`, and `email_outbox` cause partial writes if child inserts fail. Furthermore, pre-checking an `idempotency_key` via a `SELECT` query introduces a race condition under concurrent requests.
- **The Solution**: A dedicated PostgreSQL function `public.submit_customer_inquiry` defined in a new local migration.
  - Executes as `SECURITY DEFINER` with `SET search_path = ''`.
  - Atomically performs:
    1. Fast-path check for existing `idempotency_key`. If found, returns existing record immediately with `is_duplicate = true`.
    2. Concurrency-safe insert into `public.inquiries` with `ON CONFLICT (idempotency_key) DO NOTHING`. If a conflict occurs concurrently, retrieves the existing inquiry and returns `is_duplicate = true` without creating duplicate items or outbox rows.
    3. If newly inserted, parses and inserts item snapshots into `public.inquiry_items` (verifying limit of 100 items). Any failure (e.g., check constraint violation) rolls back the entire transaction.
    4. Inserts a queued outbox row into `public.email_outbox` with `status = 'pending'`.
    5. Returns `id uuid`, `reference bigint`, and `is_duplicate boolean`.
  - **Permissions & Security**:
    - `REVOKE ALL ON FUNCTION public.submit_customer_inquiry(...) FROM public, anon, authenticated;`
    - `GRANT EXECUTE ON FUNCTION public.submit_customer_inquiry(...) TO service_role;`
    - Standard public and authenticated PostgREST callers CANNOT invoke this function directly. Only the trusted server-side repository calling with `createServiceClient()` (`service_role`) can execute it after applying honeypot, rate limiting, and input validation.

### 2.2 Database Changes
New migration file: `supabase/migrations/20261016103000_inquiry_transaction.sql`
```sql
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
```

### 2.3 API Contract & Data Types
- `lib/supabase/database.types.ts`:
  Add RPC type under `Database['public']['Functions']`:
  ```typescript
  submit_customer_inquiry: {
    Args: {
      p_idempotency_key: string
      p_contact_name: string
      p_contact_phone: string
      p_contact_email: string | null
      p_message: string | null
      p_source: string
      p_original_submission: Json
      p_items?: Json | null
    }
    Returns: {
      id: string
      reference: number
      is_duplicate: boolean
    }[]
  }
  ```

### 2.4 Server Validation (`lib/validation/inquiry.ts`)
- `validateCustomerInquiryInput(data)`:
  - Validates `contact_name` (1–120 chars), `contact_phone` (6–30 chars, numeric/phone characters), `contact_email` (optional, valid email regex), `message` (optional, max 10,000 chars), `source` (`'cart' | 'product' | 'contact' | 'manual'`).
  - Validates `items`: array of 0 to 100 items. Each item must have `productName`, `productSlug`, `quantity` (1..999), `currency` (3 uppercase chars), `unitPrice` (null or >= 0).
  - Honeypot check: inspects honeypot field (e.g. `hp_company`); if populated, rejects submission as spam without writing to database.
  - Idempotency key: validates UUID syntax or generates UUID v4.

### 2.5 Data Access Layer (`lib/repositories/supabaseInquiryRepository.ts`)
- Must contain `import "server-only";`.
- Uses `createServiceClient()` from `lib/supabase/admin.ts` for customer submissions:
  - `submitCustomerInquiry(input: CustomerInquiryInput): Promise<InquirySubmissionResult>`
    - Invokes `supabase.rpc('submit_customer_inquiry', ...)`.
    - Handles database error codes gracefully (`22023`, `23503`, etc.).
- Administrative functions take an authenticated `SupabaseClient<Database>` caller (obtained via `requireAdmin()`):
  - `listAdminInquiries(supabase, filters)`: Paginated inquiries with status filter, search query, item counts.
  - `getAdminInquiryById(supabase, id)`: Inquiry details with referenced `inquiry_items` and `inquiry_notes`.
  - `updateAdminInquiryStatus(supabase, id, status, assigneeId)`: Updates inquiry status and/or assignee.
  - `addAdminInquiryNote(supabase, inquiryId, body)`: Adds note to `inquiry_notes`.

## 3. Scope & File Ownership
Codex is authorized to create and modify ONLY these paths for this task:
- `supabase/migrations/20261016103000_inquiry_transaction.sql`
- `lib/supabase/database.types.ts`
- `lib/validation/inquiry.ts`
- `lib/repositories/supabaseInquiryRepository.ts`
- `tests/inquiry.test.mjs`
- `.ai-collab/tasks/inquiry-service-layer/IMPLEMENTATION.md`

## 4. Implementation Steps for Codex
1. Create `supabase/migrations/20261016103000_inquiry_transaction.sql` with the exact SQL specified above.
2. Update `lib/supabase/database.types.ts` to include the `submit_customer_inquiry` function definition under `Database['public']['Functions']`.
3. Create `lib/validation/inquiry.ts` with typed schema validation, honeypot protection, and error formatting.
4. Create `lib/repositories/supabaseInquiryRepository.ts`:
   - `import "server-only";`
   - Import `createServiceClient` from `@/lib/supabase/admin`.
   - Implement `submitCustomerInquiry`, `listAdminInquiries`, `getAdminInquiryById`, `updateAdminInquiryStatus`, `addAdminInquiryNote`.
5. Create `tests/inquiry.test.mjs`:
   - Unit tests for validation functions (phone formats, email regex, honeypot rejection, item bounds).
   - Integration tests with PGlite loading all migrations:
     - Verify successful atomic insertion across `inquiries`, `inquiry_items`, and `email_outbox`.
     - Verify rollback atomicity: if an item has invalid constraints (e.g. invalid currency or unit_price < 0), the transaction aborts and no inquiry or outbox row remains.
     - Verify idempotency deduplication: submitting same `idempotency_key` twice returns `is_duplicate: true` with same ID and reference, and creates no duplicate child rows.
     - Verify security/grants: anonymous and standard authenticated roles get permission denied on `submit_customer_inquiry`.
     - Verify admin queries work under authenticated staff session.
6. Run required checks:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
7. Update `.ai-collab/tasks/inquiry-service-layer/IMPLEMENTATION.md` with `Status: READY_FOR_REVIEW`, test outputs, and evidence.

## 5. Acceptance Criteria
- [ ] `supabase/migrations/20261016103000_inquiry_transaction.sql` defines `submit_customer_inquiry` with atomic execution across `inquiries`, `inquiry_items`, and `email_outbox`.
- [ ] Function is granted strictly to `service_role`; public/anon and authenticated are revoked.
- [ ] Duplicate `idempotency_key` returns existing inquiry record with `is_duplicate: true` without duplicating items or outbox.
- [ ] Any failure during item insertion rolls back the entire submission cleanly.
- [ ] `lib/supabase/database.types.ts` typed for `submit_customer_inquiry`.
- [ ] `lib/validation/inquiry.ts` enforces limits and rejects spam honeypot.
- [ ] `lib/repositories/supabaseInquiryRepository.ts` uses `createServiceClient()` and provides admin functions accepting caller client.
- [ ] `tests/inquiry.test.mjs` passes all unit and PGlite integration tests.
- [ ] All required checks pass (`lint`, `typecheck`, `test`, `build`).
- [ ] Zero changes outside the task ownership.
- [ ] No Production database migration executed (local migration file only; Production deployment deferred to explicit user approval).

## 6. Risks & Mitigation
- **Risk**: Calling `submit_customer_inquiry` from browser client leaks secret key.
  - **Mitigation**: `lib/repositories/supabaseInquiryRepository.ts` includes `import "server-only";` to fail at build time if ever imported into a client bundle.
- **Risk**: Concurrent double-submit race condition.
  - **Mitigation**: Handled inside PostgreSQL with `ON CONFLICT (idempotency_key) DO NOTHING` and transaction-level isolation.
- **Risk**: Production migration execution without user consent.
  - **Mitigation**: Local migration is tested in-memory with PGlite. No migration command is run against remote Supabase.

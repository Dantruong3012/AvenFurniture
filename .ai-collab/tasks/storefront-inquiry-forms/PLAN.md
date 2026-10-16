# Plan: storefront-inquiry-forms

Status: APPROVED

# Task Plan: storefront-inquiry-forms

Status: APPROVED

## 1. Objective & Architecture
Provide customer inquiry channels across key storefront touchpoints:
1. Quote submission directly from active cart contents.
2. Product-specific inquiry button & modal on product displays.
3. General contact form on `/contact`.

All submission flows interface securely with the server layer through a dedicated Route Handler (`app/api/inquiries/route.ts`), which validates payloads via `validateCustomerInquiryInput` and persists them atomically via `submitCustomerInquiry` in `lib/repositories/supabaseInquiryRepository.ts`.

## 2. Integration Points & File Ownership
- **Cart integration** (`app/cart/page.tsx` & `components/cart/quote-request-modal.tsx`): Mount quote submission action inside the cart summary, capturing active cart line items and customer contact details. Clears the cart on successful submission.
- **Product detail integration** (`components/product/product-detail-client.tsx` & `components/product/product-inquiry-modal.tsx`): Add "Inquire about this piece" action in detail actions, pre-populating product name, slug, ID, and price snapshot in the inquiry modal.
- **Product card integration** (`components/product/product-card.tsx`): Optional inquiry action or direct inquiry trigger support.
- **Contact page integration** (`app/contact/page.tsx` & `components/forms/contact-form.tsx`): Replace placeholder text with interactive contact form supporting general inquiries and `?source=quote` referral context.
- **Server Route Handler** (`app/api/inquiries/route.ts`): Implement `POST` handler validating incoming JSON with `validateCustomerInquiryInput` and calling `submitCustomerInquiry`.
- **Shared types & styles** (`lib/types.ts`, `app/globals.css`): Shared TypeScript definitions and accessible modal/form styling.
- **Automated tests** (`tests/storefront-inquiry.test.mjs`): Verification of validation rules, honeypot protection, submission payload mapping, and API responses.

## 3. Acceptance Criteria

### 3.1 Quote Submission in Cart
- File: `app/cart/page.tsx` and `components/cart/quote-request-modal.tsx`.
- Trigger button appears when cart has items.
- Modal captures: `contact_name` (required, 1–120 chars), `contact_phone` (required, valid phone number format), `contact_email` (optional, valid email), `message` (optional notes), and honeypot `hp_company`.
- Captures item snapshots from cart: `productId`, `productName`, `productSlug`, `quantity`, `currency`, `unitPrice`.
- Submits payload to `POST /api/inquiries` with `source: "cart"`.
- Handles submitting/loading state, accessible focus management, and escape key close.
- On success, displays assigned inquiry `reference` code and clears active cart via `clearCart()`.

### 3.2 Product Inquiry Button & Modal
- File: `components/product/product-detail-client.tsx` and `components/product/product-inquiry-modal.tsx`.
- Dedicated action button in product detail actions.
- Modal pre-populated with current product details (`productId`, `productName`, `productSlug`, `currency`, `unitPrice`).
- Captures customer contact info (`contact_name`, `contact_phone`, optional `contact_email`, `message`, `hp_company`).
- Submits payload to `POST /api/inquiries` with `source: "product"`.
- Accessible dialog with loading, error alerts, and reference confirmation.

### 3.3 General Contact Form
- File: `app/contact/page.tsx` and `components/forms/contact-form.tsx`.
- Replaces static placeholder text on `/contact`.
- Captures `contact_name`, `contact_phone`, `contact_email`, `message`, and `hp_company`.
- Respects `?source=quote` search param to adapt heading and context.
- Submits to `POST /api/inquiries` with `source: "contact"`.
- Displays clear confirmation with inquiry `reference` number.

### 3.4 API Route Handler
- File: `app/api/inquiries/route.ts`.
- Exports `POST(request: Request)`.
- Validates request body using `validateCustomerInquiryInput`.
- Returns 400 Bad Request with field errors if validation fails or honeypot is triggered.
- Calls `submitCustomerInquiry(validatedData)` from `lib/repositories/supabaseInquiryRepository.ts`.
- Returns 201 Created with `{ success: true, id, reference, is_duplicate }`.
- Catches and sanitizes internal server errors without leaking stack traces.

### 3.5 Automated Test Suite
- File: `tests/storefront-inquiry.test.mjs`.
- Unit and integration tests covering input validation, honeypot spam rejection, API response structures, error handling, and duplicate submission idempotency.
- Executes via `node --test tests/storefront-inquiry.test.mjs`.

## 4. Production Safety Review
- Ordinary scoped frontend components, Next.js route handler, CSS, and unit tests.
- No database schema migrations, credential updates, or production deployments required.

## 5. Verification Plan
- Run test suite: `node --test tests/*.test.mjs`
- Code quality checks: `npm run lint` && `npm run typecheck`
- Production build: `npm run build`
- Verify git cleanliness: `git status --porcelain`

Owned paths: app/api/inquiries/route.ts, app/cart/page.tsx, app/contact/page.tsx, app/globals.css, components/cart/quote-request-modal.tsx, components/forms/contact-form.tsx, components/product/product-card.tsx, components/product/product-detail-client.tsx, components/product/product-inquiry-modal.tsx, lib/types.ts, tests/storefront-inquiry.test.mjs

# Plan: admin-inquiry-export-metrics

Status: APPROVED

### Acceptance Criteria
1. **Inquiry Metrics Calculation & Status Aggregation**:
   - Calculate key inquiry metrics: total inquiries, count and percentage breakdown by status (`new`, `contacted`, `resolved`, `closed`), and inquiries received within standard timeframes (e.g. last 7 days, last 30 days).
   - Provide repository/helper methods in `lib/repositories/supabaseInquiryRepository.ts` or `lib/inquiries/actions.ts` to compute or retrieve status aggregates reliably.

2. **CSV Export Endpoint**:
   - Add an authenticated admin API route at `app/api/admin/inquiries/export/route.ts` that enforces admin session verification.
   - Support query parameters for date range/status filtering.
   - Format inquiry records into valid CSV (RFC 4180 compliant) with proper headers (`id`, `created_at`, `status`, `name`, `email`, `phone`, `product_id`, `message`), handling quotation/escaping.
   - Return response with headers `Content-Type: text/csv` and appropriate `Content-Disposition: attachment; filename="..."`.

3. **Admin Analytics Controls in Inquiry Portal**:
   - Update `components/admin/inquiry-portal.tsx` and `app/admin/(protected)/inquiries/page.tsx` to surface summary metric cards (total, new, in-progress/contacted, resolved).
   - Include UI controls for exporting data to CSV with current active filters (status, date range).

4. **Verification & Tests**:
   - Update `tests/admin-inquiry.test.mjs` to test metrics calculation logic and CSV export formatting/route authorization.
   - Ensure all existing unit/integration checks pass without requiring Production credentials or live external services.

Owned paths: app/admin/(protected)/inquiries/page.tsx, app/api/admin/inquiries/export/route.ts, components/admin/inquiry-portal.tsx, lib/inquiries/actions.ts, lib/repositories/supabaseInquiryRepository.ts, tests/admin-inquiry.test.mjs

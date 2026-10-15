# Phase 2 — Cloudinary media và storefront

Trạng thái: **đã triển khai code và kiểm thử local; migration remote chờ chủ project duyệt**. Project ref `eofdtqnnqgxaoykcbfrv`. Không thay Auth settings, không deploy.

## Đã triển khai

- `/admin/media`: upload ảnh đã ký, xác minh Cloudinary ở server trước khi ghi database, alt text, tìm/lọc ảnh, chỉ xóa ảnh không dùng và retry. Endpoint media kiểm tra phiên/role/Origin/rate. Secret chỉ ở server.
- Product editor chọn/upload/sắp xếp ảnh, ảnh đầu là primary, tối đa 20; validation publish cần ảnh và alt. Product CRUD vẫn dùng session staff và RPC SECURITY INVOKER.
- Storefront đọc Supabase qua publishable key/RLS: trang chủ, `/products`, chi tiết, sitemap, wishlist và quote list. Không nhập seed sản phẩm, không fallback demo. Chi tiết thiếu/ẩn trả HTTP 404; slug cũ redirect 308.
- Giỏ chỉ lưu ID/số lượng trong localStorage; giá null hiển thị “Request a quote”. Contact không giả vờ đã nhận inquiry.
- Migration `supabase/migrations/20261015120000_phase2_media_catalog.sql` thêm `bytes`, `uploaded_by`, `status`, cập nhật policy public media, ràng buộc gallery/publish, workflow claim xóa ảnh và RPC product. Không xóa bảng, cột, user hoặc dữ liệu. Remote hiện không có category/product/media/product_image; migration chưa áp dụng.

## Kiểm chứng hiện có

- PostgreSQL local PGlite nạp toàn bộ migrations và kiểm tra RLS, publish thiếu ảnh/alt, asset không ready, claim ảnh đang dùng, rollback RPC: PASS.
- Unit Cloudinary signature/metadata và URL filter/quote price: PASS.
- `npm test`: 39 tests pass. `npm run typecheck`, `npm run lint`, `npm run build`, `npm run audit:env`: pass (chạy lại sau các sửa cuối trước khi nghiệm thu).
- PostgREST remote read-only: URL đúng ref, 12 bảng public; query public category/product/material/redirect/sitemap trả HTTP 200, catalog trống.
- Production build local: home, `/products`, sitemap trả 200; product slug không tồn tại trả 404. Browser smoke test trong Cốc Cốc headless xác nhận empty state, quote/contact không báo gửi giả và không tràn ngang ở 360/390/768/1440 px. Playwright/cache chỉ nằm trong thư mục tạm và đã được xóa. Chưa có fixture thật để kiểm tra upload/publish end-to-end.
- Security advisor remote: chỉ còn private.admin_guard deny-by-default và cảnh báo leaked-password protection đã biết từ Phase 0.

## Sau khi được duyệt migration

1. Áp dụng đúng file migration qua Supabase migration runner, xác nhận version/schema/policy/advisor; generate lại TypeScript types từ remote.
2. Chạy fixture Cloudinary in-memory với phiên staff và super admin, kiểm tra upload, verify, attach/publish, RLS public, xóa khi dùng bị chặn, unlink rồi xóa DB/Cloudinary; cleanup trong `finally`.
3. Chạy browser test trên production build ở 360/390/768/1440 px, keyboard/focus và các trạng thái/SEO; dọn dependency/cache/screenshot tạm.

Không đưa Inquiry, email, thanh toán hoặc production deploy vào Phase 2.

# Phase 2 — Cloudinary media và storefront

Trạng thái 15/10/2026: **Phase 2 đã nghiệm thu tích hợp trên project `eofdtqnnqgxaoykcbfrv`**. Migration remote, Cloudinary thật, database/RLS và storefront trên production build local đều đã kiểm chứng. Không thay Auth settings, không deploy production.

## Đã triển khai

- `/admin/media`: upload ảnh đã ký, xác minh Cloudinary ở server trước khi ghi database, alt text, tìm/lọc ảnh, chỉ xóa ảnh không dùng và retry. Endpoint media kiểm tra phiên/role/Origin/rate. Secret chỉ ở server.
- Product editor chọn/upload/sắp xếp ảnh, ảnh đầu là primary, tối đa 20; validation publish cần ảnh và alt. Product CRUD vẫn dùng session staff và RPC SECURITY INVOKER.
- Storefront đọc Supabase qua publishable key/RLS: trang chủ, `/products`, chi tiết, sitemap, wishlist và quote list. Không nhập seed sản phẩm, không fallback demo. Chi tiết thiếu/ẩn trả HTTP 404; slug cũ redirect 308.
- Giỏ chỉ lưu ID/số lượng trong localStorage; giá null hiển thị “Request a quote”. Contact không giả vờ đã nhận inquiry.
- Migration `supabase/migrations/20261015085103_phase2_media_catalog.sql` thêm `bytes`, `uploaded_by`, `status`, cập nhật policy public media, ràng buộc gallery/publish, workflow claim xóa ảnh và RPC product. Supabase migration runner đã áp dụng version `20261015085103`; tên file local được đồng bộ theo version remote. Không xóa bảng, cột, user hoặc dữ liệu.

## Nghiệm thu ngày 15/10/2026

- Trước migration: bốn versions và fingerprint local/remote khớp: 13 bảng, 104 cột, 36 indexes, 68 constraints, 29 policies, 13 functions. Category/product/media/gallery remote đều trống, không có dữ liệu vi phạm ràng buộc mới.
- Sau migration: năm versions local/remote khớp. Fingerprint local/remote khớp 13 bảng, 107 cột, 38 indexes, 75 constraints, 29 policies, 17 functions. TypeScript types đã đối chiếu bản generate remote; bổ sung FK `media_assets.uploaded_by`, giữ nullability hai tham số tạo sản phẩm mà generator không phản ánh.
- `npm test`: 39/39 pass (PGlite migrations/RLS/gallery và unit Cloudinary/storefront). `npm run lint`, `npm run typecheck`, `npm run build`, `npm run audit:env`: pass. Typecheck chạy tuần tự sau build để tránh race `.next/types`.
- `npm run test:phase2:live`: PASS trên Cloudinary/Supabase thật với fixture riêng. Staff và super admin upload ký số, xác minh ở server, sửa alt; forged signature bị từ chối, hoàn tất lại upload không tạo hàng trùng, anonymous/sai Origin bị từ chối. Publish thiếu ảnh/alt bị chặn; gallery sắp xếp và primary đúng; media công khai chỉ khi gắn sản phẩm published. Xóa ảnh đang dùng bị chặn; trạng thái `delete_failed` retry được; gỡ liên kết rồi xóa DB/Cloudinary thành công.
- Browser trên production build local: catalog, chi tiết, HTML/OG, sitemap, giá null “Request a quote”, wishlist/giỏ qua reload, keyboard focus, 404, giỏ/wishlist với sản phẩm ẩn và không tràn ngang ở 360/390/768/1440 px: PASS. HTTP/PostgREST kiểm tra slug cũ 308, draft/archive/danh mục tắt không công khai. Test ban đầu điều hướng trước khi browser ghi xong localStorage; script đã chờ trạng thái lưu trước khi điều hướng.
- Script in `CLEANUP`; đọc lại remote xác nhận category/product/media/product_image/slug_redirect đều **0**. Ảnh Cloudinary do fixture tạo được xác nhận xóa; dependency/cache Playwright tạm đã dọn.
- Security advisor: `private.admin_guard` không có policy là deny-by-default; leaked-password protection là cảnh báo Phase 0. Cảnh báo mới `authenticated_security_definer_function_executable` trỏ tới `claim_unused_media`: RPC có chủ ý cho phép `authenticated` gọi, tự kiểm tra phiên/role admin đang hoạt động, khóa transaction và từ chối ảnh còn dùng. Giữ `SECURITY DEFINER` vì quyền cập nhật media không được cấp trực tiếp cho client; đổi sang `SECURITY INVOKER` sẽ làm hỏng workflow hoặc buộc mở quyền ghi trực tiếp. Chưa có MFA bắt buộc/SMTP/domain theo phạm vi Phase 0.

`scripts/test-phase2-live.mjs` dùng Auth Admin API tạo proof một lần trong bộ nhớ cho hai tài khoản admin hiện có, không gửi email hoặc cần mật khẩu, và chỉ thao tác trên fixture có prefix riêng. Script dừng trước khi tạo fixture nếu cột Phase 2 thiếu; nếu cleanup thất bại, nó in đúng ID còn lại. Browser smoke test `scripts/test-phase2-browser.mjs` hỗ trợ catalog rỗng, fixture published và sản phẩm bị ẩn.

Ví dụ chạy lại với Playwright cài tạm và xóa khi thoát:

```sh
phase2_test_dir=$(mktemp -d /private/tmp/aven-phase2-live.XXXXXX)
trap 'rm -rf "$phase2_test_dir"' EXIT
npm install --prefix "$phase2_test_dir" --cache "$phase2_test_dir/npm-cache" --no-package-lock --no-audit --no-fund playwright@1.64.1
PLAYWRIGHT_MODULE="$phase2_test_dir/node_modules/playwright/index.mjs" npm run test:phase2:live
```

Không đưa Inquiry, email, thanh toán hoặc production deploy vào Phase 2.

# Phase 1 — Category & Product Management

Bắt đầu 14/10/2026; cập nhật 15/10/2026. Phạm vi mới do chủ project giao sau khi nghiệm thu Phase 0 đủ để phát triển tính năng. Không thay Auth settings, không deploy production, không triển khai Inquiry hoặc chuyển storefront sang dữ liệu thật.

## Sử dụng

- `/admin`: liên kết quản lý catalog và Account security.
- `/admin/categories`: xem/tìm kiếm/lọc/phân trang danh mục; **super_admin** tạo, sửa, xóa. Staff chỉ xem, kể cả gọi API trực tiếp.
- `/admin/products`: cả staff và super_admin tạo, sửa, xóa sản phẩm qua Supabase với phiên của chính người dùng.
- `/admin/products/[id]`: preview có xác minh quyền, kể cả draft; không phải trang storefront.
- Form hỗ trợ tên/slug/mô tả, danh mục, draft/published/archived, giá tùy chọn/currency, featured, vật liệu/màu/kích thước, thuộc tính bổ sung và SEO. Giá trống là liên hệ báo giá, giá 0 vẫn là 0.
- Có chọn/sắp xếp/gỡ liên kết media đã được xác minh; ảnh đầu là ảnh chính. Chưa có workflow upload Cloudinary hoặc quản trị thư viện ảnh trong Phase 1 này. Remote hiện chưa có media assets.
- Danh sách phân trang 20 dòng, search theo tên (escape wildcard), lọc trạng thái/danh mục, sort ổn định; điều hướng admin có trên mobile.
- Xóa yêu cầu xác nhận. Danh mục có sản phẩm bị FK chặn; cần chuyển sản phẩm trước. Sản phẩm có lịch sử inquiry bị FK chặn; dùng archive. Xóa sản phẩm không xóa tài nguyên Cloudinary.

## Kiến trúc và an toàn

`lib/catalog/queries.ts` và `actions.ts` dùng `requireAdmin()` cùng SSR client có publishable key/cookie người đăng nhập. Không import service client hoặc Secret Key vào CRUD. Mỗi action tự kiểm tra role, Origin, hạn mức trong process và validation; RLS kiểm tra phiên/role/active ở database. Không dựa vào ẩn nút trên UI.

Product dùng `version`, category dùng `updated_at` làm điều kiện compare-and-swap cho update/delete. Không có bản ghi khớp trả lỗi xung đột; không ghi đè nội dung mới. Lỗi trả thông báo hữu ích, không trả SQL/token. Revalidate admin sau thành công; không cache công khai dữ liệu admin. Form có pending, lỗi trường, trạng thái rỗng và cảnh báo rời trang khi chưa lưu.

Hai migration bổ sung, không thay bảng/cột/policies hoặc dữ liệu hiện có:

1. `20261014133618_catalog_management.sql`: trigger bảo vệ namespace slug; đổi slug lưu old_slug → product_id; quay lại slug của chính sản phẩm không tạo vòng lặp. RPC `save_catalog_product` SECURITY INVOKER lưu sản phẩm + liên kết ảnh + redirect trong một transaction, rollback toàn bộ nếu một bước lỗi. Advisory lock điều phối việc cấp slug ở quy mô MVP.
2. `20261014134333_catalog_conflict_status.sql`: dùng `PT409` cho lỗi phiên bản cũ để PostgREST trả HTTP 409. Đây là lỗi nghiệp vụ, không dùng SQL serialization error/HTTP 500. Kiểm thử đồng thời remote xác nhận một response 200 và một 409.

Không ghi lại migration đã áp dụng. Bốn versions local/remote khớp; fingerprint local/remote khớp 13 bảng, 104 cột, 36 indexes, 68 constraints, 29 policies, 13 functions. Type RPC đã đối chiếu generator; bổ sung nullability cho hai tham số tạo sản phẩm vì generator không phản ánh NULL arguments.

RLS/security advisor không có cảnh báo mới: `private.admin_guard` không có policy là deny-by-default có chủ ý; cảnh báo [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) tồn tại từ Phase 0. Không thay Auth settings/gói dịch vụ.

Tham chiếu: [Supabase SECURITY INVOKER functions](https://supabase.com/docs/guides/database/functions), [PostgREST custom HTTP error codes](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).

## Super admin riêng được chủ project chỉ định

- Email: lưu trong Supabase Auth; không ghi địa chỉ cá nhân vào Git. Cung cấp `AVEN_SUPER_ADMIN_EMAIL` chỉ khi chạy live test.
- UUID: tra cứu trong Supabase Auth khi cần.
- Role: `super_admin`, active. Tài khoản staff-test giữ nguyên role/password.
- Tạo Auth qua Admin API sau khi kiểm tra email chưa tồn tại. Không ghi SQL vào auth.users, không gửi email.
- Bootstrap bằng transaction riêng theo `supabase/bootstrap-super-admin.sql`: khóa singleton admin_guard, yêu cầu chưa có super admin, kiểm tra đúng Auth UUID/email đã confirmed rồi tạo profile. Không tạo endpoint nâng quyền.
- Mật khẩu đã được chuyển trực tiếp cho chủ project trong chat theo yêu cầu cập nhật. Mục Keychain đã được xóa và kiểm tra không còn; không lưu mật khẩu vào file hoặc tài liệu này.

Đăng nhập tại `http://localhost:3000/admin/login`. MFA optional và các giới hạn vận hành Phase 0 vẫn giữ nguyên; cần nghiệm thu MFA trước khi phát hành production.

## Kiểm thử

- `npm test`: 34 tests pass, gồm validation/action guard và PostgreSQL local cho ma trận quyền, session, category CRUD, product transaction, rollback ảnh, slug history và conflict.
- `npm run lint`, `npm run typecheck`, `npm run build`: pass.
- `npm run audit:env`: pass, không có secrets trong client build; `.env.local` ignored/mode600; không thay Cloudinary hoặc env.
- PostgREST thật: đăng nhập super admin bằng mật khẩu kiểm thử; staff dùng proof không gửi email. Category CRUD super admin, staff bị chặn category/role; last-super-admin bị chặn hạ role/xóa. Product CRUD staff, anon không thấy draft/archive, category inactive ẩn published, slug unique/reserved, concurrent version conflict và rollback invalid image: pass.
- Browser E2E trên production build local, CocCoc headless + Playwright 1.64.1: **PASS** đăng nhập super admin, tạo/sửa/xóa category và product qua UI, preview, publish validation giữ tên/category/status, xử lý conflict giữ nội dung, xác nhận bỏ thay đổi, tìm kiếm/lọc/phân trang 20+1 dòng, staff không thấy form category nhưng sửa/xóa được product, guest chuyển về login và logout. Kiểm tra navigation và không tràn ngang ở 360/390/768/1440px.
- Browser test phát hiện và đã sửa reset native select sau validation bằng dispatch action trong transition; sửa min-width ô lọc có tên danh mục dài. UI tiếp tục dùng styles và bố cục admin hiện có.

`scripts/test-catalog-live.mjs` kiểm thử bằng user sessions. Secret Key chỉ dùng để cấp proof đăng nhập staff hiện có, không làm CRUD. Fixture có prefix ngẫu nhiên và category IDs riêng, cleanup trong finally qua RLS, chỉ logout phiên do test tạo. Không ghi password/token/cookie ra file. Ảnh debug catalog khi bật tùy chọn chỉ dùng trong thư mục tạm, đã dọn sau test. Script cần `PLAYWRIGHT_MODULE` trỏ tới Playwright cài tạm và dùng CocCoc headless sẵn trên máy. Không chạy đồng thời nhiều bản trên port3198.

Chạy lại test browser với dependency tạm và tự xóa sau khi kết thúc (nhập mật khẩu ẩn vào biến tạm của subshell, cần network, không thay dependencies dự án):

```sh
(
  test_dir=$(mktemp -d /private/tmp/aven-catalog-e2e.XXXXXX)
  trap 'rm -rf "$test_dir"' EXIT
  npm install --prefix "$test_dir" --cache "$test_dir/npm-cache" --no-package-lock --no-audit --no-fund playwright@1.64.1
  read 'AVEN_SUPER_ADMIN_EMAIL?Super admin email: '
  export AVEN_SUPER_ADMIN_EMAIL
  read -rs 'AVEN_SUPER_ADMIN_TEST_PASSWORD?Super admin password: '
  printf '\n'
  export AVEN_SUPER_ADMIN_TEST_PASSWORD
  PLAYWRIGHT_MODULE="$test_dir/node_modules/playwright/index.mjs" node --env-file=.env.local scripts/test-catalog-live.mjs
  unset AVEN_SUPER_ADMIN_TEST_PASSWORD
  unset AVEN_SUPER_ADMIN_EMAIL
)
```

Migrations, source tests và script kiểm thử được giữ để bảo trì; dependency browser/cache/ảnh debug tạm được xóa. Không xóa audit logs hoặc tài khoản thật. Script tạo tài khoản đã được bỏ sau khi bootstrap để tránh tái tạo dữ liệu đăng nhập trên máy.

## Giới hạn phạm vi

Storefront vẫn demo, nên publish hiện cập nhật Supabase catalog và admin preview; chưa cập nhật trang khách/sitemap/HTTP301. Dữ liệu slug redirect đã lưu sẵn để nối trong giai đoạn storefront. Cloudinary upload, email/domain/SMTP, Inquiry, quản lý tài khoản toàn diện và các module khác chưa triển khai trong Phase 1. Không coi báo cáo này là hoàn thành toàn bộ MVP.

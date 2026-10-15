# Phase 3 — audit Supabase Production (15/10/2026)

## Phạm vi và kết luận

Audit chỉ đọc. Không chạy migration, reset database, tạo seed/demo, upload ảnh, đăng nhập thay người dùng, ghi/xóa dữ liệu hoặc đổi Supabase Auth Settings.

Project Supabase được source cố định và `.env.local` hiện dùng là `eofdtqnnqgxaoykcbfrv`. Management API xác nhận project này `ACTIVE_HEALTHY`. Vercel metadata xác nhận đúng project Vercel `aven-furniture`, nhưng cả `get_deployment` lẫn `filter_project_envs` bị 403 ở team `dantruong`; do đó **chưa xác minh trực tiếp được** `NEXT_PUBLIC_SUPABASE_URL` của deployment Production đang trỏ vào project ref nào hoặc commit nào đang chạy. Website `/products` hiện trả 200, không có RSC error và hiển thị 0 pieces; hành vi này phù hợp với database được audit, nhưng không thay thế phép đối chiếu Vercel env.

**Database của project được audit đã sẵn sàng về schema và RLS để vận hành catalog. Catalog rỗng vì không có dữ liệu:** 0 category, 0 product (draft/published/archived), 0 media asset, 0 product image và 0 slug redirect. Truy vấn PostgREST với publishable key tới products/categories/media trả 200 và mảng rỗng; `admin_profiles` không có phiên trả 401 (`42501`). Không có sản phẩm nào để RLS che hay query bỏ sót. Nếu Vercel dùng project khác, cần audit project đó trước khi kết luận cho deployment.

## Migration và schema

Management API migration history có đủ đúng 5 versions dưới đây, đều trùng tên file trong `supabase/migrations/`:

| Version | Tên | Remote |
| --- | --- | --- |
| `20261014080743` | `aven_mvp_foundation` | Đã áp dụng |
| `20261014080757` | `admin_session_security` | Đã áp dụng |
| `20261014133618` | `catalog_management` | Đã áp dụng |
| `20261014134333` | `catalog_conflict_status` | Đã áp dụng |
| `20261015085103` | `phase2_media_catalog` | Đã áp dụng |

Chạy cả 5 migration trên PostgreSQL local trong bộ nhớ và lấy signature từ `supabase/audit-schema.sql`. So sánh JSON remote/local: **khớp chính xác** ở 13 bảng, 107 cột, 38 index, 75 constraint, 29 policy, 17 function. Không có bảng hoặc migration nào thiếu; **SQL đề xuất áp dụng Production: không có**. Không cần dry-run migration mới. Bộ test local cho schema/RLS/catalog/media pass 27/27; không chạy test ghi trên Production.

13 bảng hiện có: `private.admin_guard`; trong `public`: `admin_profiles`, `audit_logs`, `categories`, `consultant_profiles`, `email_outbox`, `inquiries`, `inquiry_items`, `inquiry_notes`, `media_assets`, `product_images`, `products`, `slug_redirects`. Cả 13 đều bật RLS. `private.admin_guard` không có policy để API roles truy cập, đúng thiết kế deny-by-default.

Các quan hệ cốt lõi đã có: `products.category_id → categories.id` (`RESTRICT`), `product_images.product_id → products.id` (`CASCADE`), `product_images.asset_id → media_assets.id` (`RESTRICT`), `media_assets.uploaded_by → admin_profiles.user_id` (`SET NULL`), `admin_profiles.user_id → auth.users.id` (`RESTRICT`). Index duy nhất cho category/product slug, Cloudinary asset/public ID, vị trí ảnh trong gallery và ảnh primary cũng có. Constraint kiểm tra trạng thái sản phẩm/media, định dạng slug, giá, số lượng ảnh và gallery published hiện diện; ba deferred constraint trigger bắt buộc sản phẩm published có ảnh primary và alt text. Remote và local khớp cả định nghĩa, không chỉ số lượng.

## Quyền và RLS

- Remote có **1 `super_admin` active** và **1 `staff` active**, không có profile mồ côi; không truy xuất email/UUID của họ.
- Anonymous có `SELECT` trên các bảng catalog công khai nhưng policy chỉ cho xem category active, product published thuộc category active, ảnh/media gắn vào sản phẩm công khai. Anonymous không có quyền đọc `admin_profiles`; GET thực tế trả 401.
- Authenticated staff/super admin được policy đọc và ghi product/gallery khi `private.current_admin_role()` hợp lệ. Chỉ super admin được ghi category và admin profile. `requireAdmin()` trong source còn kiểm tra session hiện hành và profile active; Server Actions kiểm tra role và Origin trước khi ghi.
- `admin_profiles` chỉ grant UPDATE ở một số cột; kết quả `has_table_privilege(..., 'UPDATE') = false` cho cả bảng là phù hợp với column-level grant, không chứng minh super admin bị chặn sửa role. Test local kiểm tra role và last-super-admin guard; audit không dùng phiên đăng nhập thật để thử ghi Production.

## Luồng tạo sản phẩm thật

1. Super admin đăng nhập, tạo **category thật** tại `/admin/categories` và để active.
2. Staff hoặc super admin vào `/admin/media`, upload ảnh Cloudinary được ký ở server. Endpoint xác minh chữ ký, asset và metadata với Cloudinary trước khi ghi `media_assets`; cần thêm alt text.
3. Staff hoặc super admin vào `/admin/products`, tạo sản phẩm với category, slug và mô tả thật. Có thể lưu `draft` trước; product editor dùng RPC `save_catalog_product` trong một transaction theo quyền user.
4. Chọn ảnh trạng thái `ready`, đặt ảnh đầu là primary, điền alt cho tất cả ảnh rồi chuyển `published`. Source và deferred database triggers đều chặn publish thiếu ảnh/alt.
5. Khi category active và product published, RLS/`listPublishedProducts()` đưa sản phẩm ra trang `/products`, chi tiết và sitemap.

Luồng code và local tests đã kiểm tra. Audit này không thực hiện upload/publish thật vì chúng ghi dữ liệu Production. Cấu hình Cloudinary/Vercel Production và phiên đăng nhập thực tế còn phải kiểm tra trước khi tuyên bố luồng vận hành hoàn chỉnh.

## Biến môi trường và browser

`lib/supabase/client.ts` tạo browser client bằng `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `SUPABASE_SECRET_KEY` chỉ được đọc trong `lib/supabase/admin.ts` có `server-only`, dùng bởi media endpoints server. Local `npm run audit:env` pass, gồm quét client build không có giá trị secret đã cấu hình. Đã đọc 14 bundle JS công khai được liên kết từ `/admin/login`, `/cart` và `/products`: không thấy prefix `sb_secret_`; tuy vậy đây không phải kiểm toán toàn bộ mọi asset/runtime deployment. Không in hoặc giải mã key.

## Việc còn cần xác minh

1. Cấp quyền đọc team Vercel `dantruong` cho MCP/CLI, đọc **tên/target** env và xác nhận `NEXT_PUBLIC_SUPABASE_URL` của deployment Production đúng `eofdtqnnqgxaoykcbfrv`. Kiểm tra `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Cloudinary vars và deployment commit. Không cần đọc giá trị secret để so tên biến.
2. Dùng tài khoản quản trị thực của chủ project để xác nhận login, category UI và media UI; không chia sẻ credentials trong chat. Audit hiện chỉ xác nhận profile/role và quyền DB, chưa chứng minh phiên đăng nhập hoạt động trên Vercel.
3. Khi có ảnh và thông tin sản phẩm thật, chủ project cho phép thao tác ghi theo quy trình riêng; sau đó xác minh URL sản phẩm, ảnh, sitemap và lỗi runtime. Không tạo sản phẩm demo.

Nguồn API audit: [Supabase migration history](https://supabase.com/docs/reference/api/v1-list-migration-history), [Supabase read-only query option](https://supabase.com/docs/reference/api/v1-run-a-query). Chỉ dùng các SELECT đơn với `read_only: true` qua Management API và GET PostgREST bằng publishable key.

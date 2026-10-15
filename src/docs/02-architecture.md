# Kiến trúc, dữ liệu và bảo mật

## Công nghệ và ranh giới trách nhiệm

| Thành phần | Vai trò |
| --- | --- |
| Next.js App Router | Render storefront/admin và xử lý server |
| TypeScript | Kiểu dữ liệu, hợp đồng repositories/services |
| Supabase Postgres | Database, quan hệ, transaction và RLS |
| Supabase Auth | Danh tính, phiên, mời tài khoản và mật khẩu |
| Cloudinary | Lưu trữ, phân phối và biến đổi ảnh |
| Email provider | Email inquiry; SMTP cho Auth nếu phù hợp |
| Worker/scheduled job | Xử lý email outbox, retry và dọn tài nguyên |

Không cần backend riêng cho bản đầu. Chọn nơi chạy worker theo hạ tầng triển khai thực tế; không dựa vào tác vụ nền không được chờ sau khi trả HTTP response.

## Tổ chức mã nguồn đề xuất

- `app/(storefront)/`: layout và trang công khai.
- `app/(admin)/admin/`: layout quản trị, trang auth và các module admin.
- `app/api/`: inquiry, upload signature, webhook và endpoint cần HTTP rõ ràng.
- `lib/supabase/`: client cho browser, server và tác vụ đặc quyền.
- `lib/repositories/`: truy cập dữ liệu bất đồng bộ.
- `lib/services/`: nghiệp vụ catalog, tài khoản, inquiry, media và email.
- `lib/validation/`: schema validation dùng lại, kiểm tra lại ở server.
- `lib/auth/`: xác minh danh tính, kiểm tra vai trò/trạng thái.
- `supabase/migrations/`: schema, constraints, RLS và các hàm transaction.
- `tests/`: kiểm thử có giá trị cho quyền, nghiệp vụ và hành trình chính.

Đây là cấu trúc mục tiêu ở root, không yêu cầu chuyển toàn bộ ứng dụng vào `src/`. Khi tách route groups cần tránh trùng URL và giữ một root layout hợp lệ.

## Quy tắc render và cache

- Render nội dung SEO từ server; client components dành cho tương tác.
- Catalog và metadata dùng cùng nguồn dữ liệu đã xuất bản.
- Cache nội dung công khai theo chiến lược đã kiểm chứng với phiên bản Next.js cài đặt; cập nhật lại cache sau CRUD.
- Không cache công khai dữ liệu phiên, admin hoặc inquiry.
- Không nhập toàn bộ catalog vào global client provider. localStorage chỉ dùng cho wishlist/danh sách báo giá tạm.
- Sản phẩm chưa xuất bản không được truy cập bằng cách đoán slug hoặc gọi API trực tiếp.

## Schema mục tiêu

| Bảng | Trường/quan hệ quan trọng |
| --- | --- |
| admin_profiles | auth user ID, tên, role, active, timestamps |
| products | UUID, tên, slug unique, mô tả, category ID, giá/currency hoặc quote-only, thuộc tính, trạng thái, SEO, version |
| categories | tên, slug unique, mô tả, thứ tự, trạng thái |
| consultant_profiles | user ID unique, tên công khai, ảnh, số Zalo, thứ tự, enabled; chỉ công khai khi tài khoản active |
| media_assets | Cloudinary asset/public ID, URL, width/height, định dạng, alt, người upload |
| product_images | product ID, asset ID, thứ tự, ảnh chính |
| inquiries | mã tham chiếu, contact, nội dung gốc, nguồn, trạng thái, assignee, timestamps, deleted_at |
| inquiry_items | inquiry ID, product ID có thể null, snapshot tên/slug/giá nếu có, số lượng |
| inquiry_notes | inquiry ID, ghi chú nội bộ, người tạo, timestamps |
| email_outbox | event ID unique, inquiry ID, trạng thái, attempts, next_attempt_at, lock, provider ID, lỗi |
| audit_logs | actor, hành động, entity ID, thời gian, thay đổi được lọc dữ liệu nhạy cảm |
| slug_redirects | old path unique, new path, tránh vòng lặp redirect |

Migration phải có khóa ngoại, index theo truy vấn, CHECK constraints cho số lượng/giá/trạng thái và UTC timestamps. Chọn kiểu tiền phù hợp, không dùng float tùy tiện. Chốt quan hệ danh mục theo nhu cầu thực tế; MVP dùng một danh mục chính; database/CRUD bộ sưu tập để sau.

Lưu snapshot sản phẩm trong inquiry để lịch sử còn đúng sau khi catalog thay đổi. Ưu tiên archive sản phẩm đã được tham chiếu. Dùng version hoặc updated_at để phát hiện cập nhật đồng thời.

## Ma trận quyền

| Đối tượng | Đọc catalog công khai | CRUD tất cả sản phẩm/inquiry | Quản lý tài khoản/danh mục/tư vấn viên |
| --- | --- | --- | --- |
| Khách | Chỉ published/active | Chỉ gửi inquiry qua endpoint | Không |
| Nhân viên `staff` đang hoạt động | Có | Có | Không |
| `super_admin` đang hoạt động | Có | Có | Có |
| Tài khoản bị khóa | Như khách | Không | Không |

- Bật RLS cho các bảng được expose qua Supabase API; mặc định từ chối nếu chưa có policy.
- Không cấp SELECT inquiry cho anon. Endpoint tiếp nhận phải validate/rate-limit trước khi ghi bằng đường dẫn được kiểm soát.
- Kiểm tra quyền ở mỗi server action/route; proxy/redirect chỉ hỗ trợ luồng truy cập.
- Role không đặt trong metadata mà người dùng tự sửa được. Ngăn staff tự nâng quyền. Chỉ có hai role `super_admin` và `staff`; assignee không giới hạn quyền xem/sửa inquiry.
- Kiểm tra trạng thái active phía server/database để việc khóa có hiệu lực với phiên còn hạn.
- Secret/service-role có thể vượt RLS: chỉ dùng trong tác vụ đặc quyền đã kiểm tra quyền, không dùng làm client mặc định cho mọi CRUD.
- Audit log không lưu password, token hoặc secret; giới hạn quyền sửa/xóa log.
- Chặn xóa/khóa/hạ quyền super admin cuối cùng, kể cả khi có hai yêu cầu đồng thời.

API công khai tư vấn viên chỉ trả tên, ảnh, số Zalo và thứ tự; không trả email đăng nhập hoặc thông tin nội bộ.

## Tài liệu tham chiếu

- [Supabase SSR clients và xác minh phiên](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Cloudinary signed uploads](https://cloudinary.com/documentation/client_side_uploading)

Đối chiếu lại tài liệu dịch vụ khi triển khai; API và quy ước có thể thay đổi.

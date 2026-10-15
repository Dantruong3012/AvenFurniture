# Thứ tự ưu tiên và lộ trình

Ước lượng cho một lập trình viên toàn thời gian, tận dụng UI hiện có. Các khoảng thời gian dưới đây là tham khảo từ kế hoạch rộng trước đó; cần ước lượng lại theo MVP tại tài liệu 07, chưa tính chờ dịch vụ/nội dung. Các checkbox dưới đây là tiêu chí nghiệm thu toàn giai đoạn, chưa được đánh dấu hoàn thành. Phần nền tảng đã chuẩn bị local được ghi riêng ở [trạng thái Supabase](./08-supabase-integration.md).

## Giai đoạn 1 — Chốt phạm vi và thiết kế nền tảng (2–3 ngày)

Ưu tiên P0; tiền đề cho các giai đoạn sau.

- [ ] Xác nhận ngôn ngữ/currency hiện tại, giá tùy chọn và domain; giỏ gửi inquiry, hai roles và Zalo đã chốt.
- [ ] Kiểm kê giao diện, nội dung mẫu, link/form chưa hoạt động.
- [ ] Dependencies đã cài; kiểm tra version và đọc local Next.js docs theo AGENTS.md trước khi viết code.
- [ ] Chốt sơ đồ dữ liệu, luồng quyền, wireframe admin và design tokens.
- [ ] Xác minh .env.example và .env.local đã tạo; hoàn thiện cấu hình Supabase/email và staging/production.

Nghiệm thu: danh sách màn hình, schema, ranh giới chức năng và quy tắc dữ liệu đủ rõ để triển khai.

## Giai đoạn 2 — Database và lớp truy cập dữ liệu (3–4 ngày)

Ưu tiên P0; phụ thuộc giai đoạn 1.

- [ ] Viết migrations, constraints, index, RLS, seed development.
- [ ] Chuẩn bị Supabase local nếu Docker khả dụng.
- [ ] Tách repositories/services, schema validation và typed data contracts.
- [ ] Thiết lập client server/browser/privileged và kiểm tra env.
- [ ] Thiết kế transaction inquiry/outbox, audit và cập nhật đồng thời.
- [ ] Kiểm thử RLS qua truy cập trực tiếp, không chỉ qua UI.

Nghiệm thu: dữ liệu lưu được, quyền từ chối mặc định, không lộ draft/inquiry. Mock có nhãn rõ và chỉ dành cho development.

## Giai đoạn 3 — Auth và quản lý admin (3–5 ngày)

Ưu tiên P0; phụ thuộc giai đoạn 2.

- [ ] Tách admin layout và navigation responsive.
- [ ] Đăng nhập/đăng xuất, quên/reset và đổi mật khẩu.
- [ ] Bootstrap super admin, mời admin, cập nhật vai trò và khóa tài khoản.
- [ ] Bảo vệ từng thao tác server, chống tự nâng quyền, bảo vệ super admin cuối cùng.
- [ ] MFA super admin và audit các hành động tài khoản.

Nghiệm thu: khách gọi trực tiếp endpoint bị từ chối; staff không quản lý role, tài khoản, danh mục hoặc hồ sơ tư vấn công khai; tài khoản khóa mất quyền. Email Auth thật cần cấu hình dịch vụ trước khi nghiệm thu staging.

## Giai đoạn 4 — CRUD catalog và Cloudinary (4–6 ngày)

Ưu tiên P0; phụ thuộc giai đoạn 2–3.

- [ ] CRUD sản phẩm cho cả hai role; CRUD danh mục chỉ super_admin; search/filter/pagination.
- [ ] Upload ký số, gallery, alt, sắp xếp và dọn ảnh không sử dụng.
- [ ] Server render catalog/detail, metadata cùng dữ liệu và revalidation.
- [ ] Publish/draft/archive, xử lý đổi slug, preview có quyền.
- [ ] Chuẩn hóa danh sách báo giá và snapshot sản phẩm.

Nghiệm thu: thay đổi được phản ánh trên storefront; draft không lộ; lỗi upload/database không để UI báo thành công giả. Cloudinary thật là điều kiện nghiệm thu upload.

## Giai đoạn 5 — Inquiry và email (4–5 ngày)

Ưu tiên P0; phụ thuộc giai đoạn 2–4.

- [ ] Form chung/theo sản phẩm/nhiều sản phẩm, validation và chống spam.
- [ ] Transaction lưu inquiry/items/outbox và idempotency.
- [ ] Worker claim/retry/backoff, email template và trạng thái gửi.
- [ ] Dashboard và CRUD inquiry, assignee, notes, audit, thùng rác.
- [ ] Test DB lỗi, provider lỗi, worker dừng giữa chừng và submit lặp.

Nghiệm thu: inquiry đã lưu vẫn tồn tại khi email lỗi; retry không tạo inquiry trùng; email thật đến đúng hộp thư trên staging với cấu hình thử nghiệm.

## Giai đoạn 6 — Tư vấn viên Zalo, SEO, UI và responsive

Bổ sung Zalo vào MVP; ước lượng lại giai đoạn này khi triển khai.

Ưu tiên P1, bắt buộc trước launch; các quy tắc được áp dụng từ giai đoạn 1.

- [ ] Super_admin cấu hình hồ sơ tư vấn gắn với nhân viên; ẩn tài khoản khóa.
- [ ] Khách chọn tư vấn viên, mở Zalo, sao chép/gọi số hoặc gửi inquiry khi chưa có người tư vấn.
- [ ] Sitemap, robots, canonical, OG, structured data, 404/301.
- [ ] Hoàn thiện nội dung thật, loại bỏ form/link demo gây hiểu nhầm.
- [ ] Kiểm tra storefront/admin trên mobile/tablet/desktop.
- [ ] Accessibility, trạng thái UI, ảnh/font/bundle và hiệu năng.

Nghiệm thu: HTML có nội dung SEO thật, schema đúng dữ liệu, các hành trình chính dùng được bằng bàn phím và màn hình nhỏ.

## Giai đoạn 7 — Staging và production (3–4 ngày)

Ưu tiên P0 cho phát hành; phụ thuộc mọi giai đoạn trên.

- [ ] Cấu hình dự án dịch vụ riêng, domain, email DNS và secrets.
- [ ] CI lint/typecheck/test/build; chạy E2E staging.
- [ ] Backup và thử khôi phục; chuẩn bị rollback app/database.
- [ ] Theo dõi lỗi/uptime/outbox và cảnh báo vận hành.
- [ ] Kiểm tra không có dữ liệu mẫu nhạy cảm, noindex staging và cấu hình index production đúng.
- [ ] Smoke test sau deploy; bàn giao hướng dẫn admin.

Nghiệm thu: toàn bộ checklist production đạt; không còn thiếu cấu hình bắt buộc hoặc luồng báo thành công giả.

## Cấu hình dịch vụ và việc làm trong lúc chờ

Cloudinary media và storefront Phase 2 đã nghiệm thu tích hợp; migration remote version `20261015085103` đã áp dụng. Thay Cloudinary secret trước production. Email/domain/SMTP vẫn hoãn; MFA vận hành và các bước staging/production còn chờ. Bước chức năng tiếp theo theo MVP là inquiry, sau đó tư vấn viên Zalo. Xem [báo cáo Phase 2](./13-phase2-media-storefront.md).

## P2 — Sau khi vận hành ổn định

- Realtime inquiry, xuất dữ liệu có kiểm soát, báo cáo chuyển đổi.
- CRUD bộ sưu tập, CMS bài viết và landing pages theo nhu cầu tìm kiếm.
- Đa ngôn ngữ đầy đủ, tích hợp CRM và marketing có consent riêng.
- Thanh toán/đơn hàng chỉ triển khai theo phạm vi được chốt riêng.

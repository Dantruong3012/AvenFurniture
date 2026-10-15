# Kế hoạch triển khai AvenFurniture

Cập nhật: 15/10/2026. Phase 0 đủ để bắt đầu Feature Development; Phase 1 quản lý catalog và Phase 2 Cloudinary/storefront đã nghiệm thu tích hợp. Xem báo cáo 12–13 cho trạng thái hiện tại. Các roadmap cũ là kế hoạch MVP tổng thể.

## Mục tiêu

Xây dựng website nội thất nhận yêu cầu tư vấn/báo giá, có quản trị bảo mật, sử dụng Next.js, TypeScript, Supabase và Cloudinary. Website cần responsive, giữ phong cách nội thất cao cấp hiện có và có nền tảng SEO tốt.

## Mục lục

1. [Phạm vi và hiện trạng](./01-scope.md)
2. [Kiến trúc, dữ liệu và bảo mật](./02-architecture.md)
3. [Chức năng và luồng nghiệp vụ](./03-features.md)
4. [SEO, giao diện và hiệu năng](./04-seo-ui.md)
5. [Thứ tự ưu tiên và lộ trình](./05-roadmap.md)
6. [Kiểm thử, cấu hình và vận hành production](./06-production.md)
7. [Kế hoạch MVP đã chốt](./07-mvp-plan.md) — nguồn phạm vi và quyền chính thức.
8. [Supabase: kết nối, migrations và Auth](./08-supabase-integration.md) — trạng thái tích hợp thực tế.

## Thứ tự thực hiện

**Chốt phạm vi → nền tảng/database/RLS → đăng nhập và phân quyền → CRUD catalog và ảnh → inquiry/email → tư vấn viên Zalo → nghiệm thu SEO, responsive → staging và production.**

SEO, accessibility, validation và responsive phải được áp dụng xuyên suốt từng tính năng; giai đoạn cuối dành cho kiểm tra tổng thể.

## Các nguyên tắc bắt buộc

- Cloudinary upload/storefront Phase 2 đã nghiệm thu trên dịch vụ thật; migration remote version `20261015085103` đã áp dụng. Supabase schema/Auth và admin catalog Phase 1 đã tích hợp; email/domain/SMTP được hoãn theo yêu cầu chủ project. Trạng thái mới nhất ở tài liệu 13.
- Không coi mock là tích hợp thật; production không được tự chuyển sang mock khi thiếu cấu hình.
- Inquiry chỉ báo tiếp nhận thành công sau khi lưu bền vững; gửi email lỗi không làm mất inquiry.
- Kiểm tra quyền trên server và ở database; không dựa vào việc ẩn nút trên giao diện.
- Không commit secret hoặc dữ liệu khách hàng thật vào repository.
- Đọc tài liệu đúng phiên bản tại `node_modules/next/dist/docs/` trước khi viết code, theo AGENTS.md.
- Các đường dẫn ứng dụng trong tài liệu là đề xuất. Hiện ứng dụng nằm ở `app/`, `components/`, `lib/` tại root; tạo `src/docs` không đồng nghĩa chuyển source code vào `src`.

## Các quyết định cần chốt trước khi tích hợp

- Ngôn ngữ chính: tiếng Việt, tiếng Anh hay song ngữ.
- Công khai giá hay chỉ nhận báo giá; đơn vị tiền tệ.
- Đã chốt: giỏ gửi inquiry, không thanh toán; hai vai trò `super_admin`/`staff`; tư vấn viên gắn với tài khoản nhân viên.
- Domain, email nhận inquiry, thông tin showroom và nội dung thương hiệu thực tế.
- Nhà cung cấp email, môi trường hosting, ngân sách dịch vụ và thời gian lưu dữ liệu khách hàng.

Triển khai theo phạm vi MVP nhận báo giá đã chốt trong tài liệu 07. Ước lượng cũ 22–32 ngày chỉ là tham khảo cho phạm vi rộng trước đây; cần ước lượng lại khi bắt đầu triển khai.

11. [Báo cáo Phase 0 và vận hành Auth](./11-phase0-acceptance.md).
12. [Phase 1: Category & Product Management](./12-phase1-catalog.md).
13. [Phase 2: Cloudinary media và storefront](./13-phase2-media-storefront.md).

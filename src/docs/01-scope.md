# Phạm vi và hiện trạng

## Hiện trạng đã kiểm tra

| Hạng mục | Hiện tại | Hướng chuyển đổi |
| --- | --- | --- |
| Nền tảng | Next.js 16.3.8, React 19, TypeScript, Tailwind 4 | Đọc tài liệu đúng phiên bản trước khi triển khai |
| Sản phẩm | LocalProductRepository lưu localStorage | Repository bất đồng bộ, Supabase làm nguồn dữ liệu chính |
| Admin | Auth SSR/RLS đã triển khai; Category/Product CRUD dùng Supabase, super_admin riêng đã bootstrap | Nghiệm thu Phase 1 theo tài liệu 12; quản lý tài khoản và module khác làm sau |
| Contact | Submit chỉ đổi trạng thái UI | Lưu inquiry và tạo tác vụ email thật |
| SEO sản phẩm | Metadata lấy seedProducts | Metadata và nội dung cùng lấy dữ liệu đã xuất bản |
| Ảnh | Unsplash hoặc URL nhập tay | Upload và thư viện Cloudinary |
| Responsive | Có breakpoint CSS | Kiểm thử thực tế; bổ sung điều hướng admin mobile |
| Newsletter | Hiển thị thành công bằng state local | Tích hợp thật nếu đưa vào phạm vi, hoặc bỏ form giả trước khi phát hành |

Các file liên quan tại root: `lib/repositories/productRepository.ts`, `components/store/store-provider.tsx`, `components/admin/admin-client.tsx`, `app/contact/page.tsx`, `app/products/[slug]/page.tsx`, `app/layout.tsx`, `app/globals.css`.

Dependencies đã được cài và dev từng khởi động thành công; dev đã được dừng theo yêu cầu. Đọc guide trong `node_modules/next/dist/docs/` trước khi thay đổi code Next.js.

## Phạm vi production đầu tiên

- Storefront: trang chủ, catalog, chi tiết sản phẩm, danh mục, bộ sưu tập, giới thiệu và liên hệ.
- Inquiry chung, inquiry theo sản phẩm và danh sách sản phẩm yêu cầu báo giá.
- Admin: dashboard, CRUD sản phẩm và inquiry cho cả hai vai trò; danh mục chỉ dành cho `super_admin`, thư viện ảnh, quản lý inquiry.
- Đăng nhập/đăng xuất, đổi mật khẩu, quên/reset mật khẩu.
- Chỉ `super_admin` được mời/tạo, khóa tài khoản và gán vai trò `super_admin`/`staff`.
- Chọn tư vấn viên Zalo gắn với nhân viên; chỉ `super_admin` cấu hình hồ sơ công khai.
- Email thông báo inquiry mới, retry và theo dõi lỗi.
- SEO kỹ thuật, responsive, accessibility, monitoring, backup và quy trình triển khai.

## Ngoài phạm vi mặc định

- Thanh toán, quản lý đơn hàng/vận chuyển và hoàn tiền.
- Tài khoản khách hàng, CRM phức tạp và tự động hóa marketing.
- Quản trị bộ sưu tập, blog CMS, đa ngôn ngữ đầy đủ và realtime dashboard. Các trang bộ sưu tập hiện có chỉ giữ nội dung công khai phù hợp.

Các phần trên có thể bổ sung sau khi bản nhận báo giá vận hành ổn định. Nếu giữ trang inspiration, nội dung và liên kết phải hoạt động thực tế khi phát hành.

## Định nghĩa hoàn thành

Một tính năng chỉ hoàn thành khi có hành vi thật, kiểm tra dữ liệu/quyền, trạng thái loading/error/empty/success, khả năng sử dụng trên mobile và kiểm thử phù hợp. Mock UI không được đánh dấu là đã nghiệm thu tích hợp.

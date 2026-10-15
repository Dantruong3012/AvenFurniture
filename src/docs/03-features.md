# Chức năng và luồng nghiệp vụ

Phạm vi chuẩn: [MVP đã chốt](./07-mvp-plan.md). Chỉ có `super_admin` và `staff`; cả hai CRUD mọi sản phẩm và inquiry.

## 1. Tài khoản quản trị

Trang dự kiến: `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/settings/security`, `/admin/users`.

1. Bootstrap super admin đầu tiên bằng quy trình thiết lập có kiểm soát, không tạo endpoint đăng ký công khai.
2. Super admin mời người mới bằng email và chọn vai trò.
3. Người nhận mở liên kết có thời hạn và tự đặt mật khẩu.
4. Ghi audit cho tạo tài khoản, thay đổi role và khóa/mở khóa.
5. Có xử lý gửi lại/hủy lời mời và lỗi từng bước giữa Auth và profile; thao tác có thể retry an toàn.

Đăng nhập/đăng xuất dùng Supabase Auth SSR. Xác minh token theo guide hiện hành; không dùng user từ session chưa xác minh để quyết định quyền. Cho phép password manager và paste mật khẩu.

Đổi mật khẩu yêu cầu xác thực lại phù hợp, xác nhận mật khẩu mới và xử lý phiên sau thay đổi theo chính sách. Reset mật khẩu dùng liên kết có hạn, xử lý expired/reused token và chỉ cho redirect tới URL được cho phép. Không gửi mật khẩu rõ qua email. Rate-limit login/reset và tránh tiết lộ email tồn tại. MFA là điều kiện phát hành cho super admin.

## 2. Catalog

- Sản phẩm: tạo, sửa, xem trước, xuất bản, chuyển nháp, archive và xóa theo quyền/ràng buộc.
- Trường dữ liệu: tên/slug, nội dung, danh mục, vật liệu/màu/kích thước, giá/currency hoặc liên hệ báo giá, ảnh, SEO.
- Danh sách: search, filter, sort và pagination ở server.
- Slug tự gợi ý nhưng được sửa; chống trùng, đổi slug tạo 301.
- Publish kiểm tra đủ trường bắt buộc; preview draft chỉ dành cho admin hợp lệ.
- Cảnh báo unsaved changes, xác nhận xóa, phát hiện xung đột cập nhật.
- Danh mục: chỉ super_admin CRUD; phải chuyển sản phẩm sang danh mục khác trước khi xóa. CRUD bộ sưu tập ngoài MVP.
- Cache và sitemap được cập nhật sau thay đổi trạng thái/nội dung.

## 3. Ảnh Cloudinary

1. Admin chọn ảnh, xem preview và validation ban đầu.
2. Server xác minh quyền, giới hạn tham số và cấp chữ ký upload.
3. Browser upload trực tiếp lên Cloudinary.
4. Server xác minh kết quả và tài nguyên trước khi ghi media_assets.
5. Admin chọn ảnh chính, sắp xếp gallery, nhập alt và thay ảnh.

Giới hạn dung lượng, định dạng, số lượng và tần suất. API secret chỉ ở server. Lưu public ID/asset ID và kích thước; cấu hình nguồn ảnh được phép trong Next.js. Chỉ xóa tài nguyên không còn tham chiếu; có job dọn ảnh upload dở. Xử lý retry khi database hoặc Cloudinary lỗi, không giả định cả hai nằm trong cùng transaction.

## 4. Form inquiry công khai

Các trường: họ tên và số điện thoại bắt buộc, email tùy chọn, chủ đề, nội dung, danh sách sản phẩm/số lượng tùy nguồn. Có thông báo sử dụng dữ liệu và liên kết chính sách riêng tư. Không tự đăng ký marketing từ inquiry.

Luồng tiếp nhận:

1. Validate phía server, giới hạn độ dài/body size, honeypot và rate-limit dùng kho dùng chung khi chạy nhiều instance; CAPTCHA chỉ thêm khi cần.
2. Kiểm tra sản phẩm/số lượng từ database, không tin giá hoặc tên từ client.
3. Dùng idempotency key để retry cùng lần gửi không tạo bản ghi trùng.
4. Trong một transaction, tạo inquiry, inquiry_items và email_outbox.
5. Chỉ sau commit mới báo đã tiếp nhận, trả mã tham chiếu không làm lộ dữ liệu khác.
6. Nếu DB lỗi, hiển thị lỗi thật và giữ nội dung form để gửi lại.

## 5. Email inquiry

- Worker claim job an toàn khi có nhiều tiến trình; có lock/lease timeout để khôi phục job bị treo.
- Email gồm mã inquiry, thời gian, liên hệ, nội dung cần thiết, sản phẩm và link admin yêu cầu đăng nhập.
- Dùng From thuộc domain đã xác minh; email khách hợp lệ đặt ở Reply-To. Escape nội dung khách khi tạo HTML email.
- Retry với backoff, số lần giới hạn, lưu provider message ID và trạng thái lỗi.
- Dashboard cho biết pending/sent/failed và cho phép gửi lại theo quyền.
- Dùng idempotency phía provider nếu được hỗ trợ; không hứa exactly-once trong mọi sự cố mạng.
- Nếu nhận webhook, xác minh chữ ký và chống xử lý trùng; phân biệt provider accepted với delivered/bounced.
- Không dùng riêng inbox admin làm nơi lưu inquiry. Email lỗi không làm mất dữ liệu đã tiếp nhận.

## 6. CRUD inquiry trong admin

| Thao tác | Hành vi |
| --- | --- |
| Create | Nhập yêu cầu từ điện thoại/trực tiếp, ghi nguồn; mặc định không tạo email thông báo mới trừ khi được chọn rõ |
| Read | Danh sách, chi tiết, search/filter/pagination, số yêu cầu mới |
| Update | Đổi trạng thái, assignee, sửa liên hệ có lịch sử; giữ nguyên nội dung khách gửi ban đầu |
| Notes | Ghi chú nội bộ, không tự gửi cho khách |
| Delete | Thùng rác, khôi phục; purge theo quyền và chính sách lưu giữ |

Trạng thái: `new → in_progress → completed`; nhánh bổ sung `cancelled`. Ghi audit các chuyển trạng thái và thay đổi người phụ trách. Realtime là phần nâng cấp sau; bản đầu có refresh hoặc polling phù hợp.

## 7. Giỏ gửi inquiry

Giỏ lưu localStorage, không cần khách đăng nhập. Cho thêm/xóa/sửa số lượng; bỏ checkout, phí giao hàng và thông báo thanh toán demo. Server kiểm tra lại sản phẩm khi gửi; sản phẩm không còn công khai phải được thông báo để khách sửa giỏ. Chỉ xóa giỏ sau khi inquiry được lưu thành công.

## 8. Tư vấn viên Zalo

Super_admin chọn nhân viên, cấu hình tên công khai, ảnh, số Zalo, thứ tự và bật/tắt hiển thị. Khách chọn người trên trang sản phẩm hoặc liên hệ rồi mở Zalo; có số để sao chép/gọi nếu không mở được. Tài khoản khóa hoặc hồ sơ tắt không được hiển thị. Không có tư vấn viên thì hiển thị form inquiry. Click Zalo không tạo inquiry, không tự gửi giỏ và không đồng bộ hội thoại.

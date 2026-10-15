# Kế hoạch MVP AvenFurniture đã chốt

Tài liệu này là nguồn phạm vi chính thức, thay thế các đề xuất rộng trước đó. Đây là kế hoạch, không phải danh sách tính năng đã hoàn thành.

## 1. Mục tiêu và phạm vi

Website nội thất đơn giản: khách xem danh sách/chi tiết sản phẩm, thêm giỏ và gửi inquiry để nhận tư vấn/báo giá; hoặc chọn nhân viên để liên hệ trực tiếp qua Zalo. Khách không cần đăng nhập. Không thanh toán online, quản lý đơn hàng hoặc chat nội bộ website.

Next.js App Router + TypeScript, Supabase Postgres/Auth, Cloudinary cho ảnh và dịch vụ email cho thông báo inquiry. Không xây backend riêng hoặc hệ thống quyền tùy biến phức tạp.

## 2. Hai vai trò

| Chức năng | super_admin | staff |
| --- | --- | --- |
| CRUD tất cả sản phẩm, kể cả do người khác tạo | Có | Có |
| CRUD tất cả inquiry, ghi chú và chăm sóc khách | Có | Có |
| Upload ảnh sản phẩm | Có | Có |
| CRUD danh mục sản phẩm | Có | Không |
| Tạo/mời, khóa tài khoản, gán role | Có | Không |
| Cấu hình hồ sơ tư vấn viên công khai | Có | Không |
| Đổi mật khẩu chính mình | Có | Có |

Người phụ trách inquiry dùng để phối hợp, không giới hạn quyền truy cập. Kiểm tra quyền ở server và RLS. Không đăng ký quản trị công khai; bảo vệ super_admin cuối cùng khỏi bị khóa, xóa hoặc hạ quyền. Có đăng nhập/đăng xuất, quên/reset và đổi mật khẩu; bootstrap super_admin có kiểm soát.

## 3. Luồng khách hàng

### Sản phẩm và giỏ

- Danh sách có lọc danh mục, tìm kiếm/phân trang; trang chi tiết có ảnh, mô tả, thông số, giá tùy chọn và CTA.
- Giỏ lưu trình duyệt; thêm/xóa/sửa số lượng, giữ sau tải lại trang.
- Thay checkout demo bằng “Gửi yêu cầu báo giá”; bỏ phí giao hàng và thông báo thanh toán giả.
- Inquiry được gửi từ giỏ, chi tiết sản phẩm hoặc liên hệ. Họ tên và điện thoại bắt buộc, email tùy chọn; có nội dung và sản phẩm/số lượng liên quan.
- Server kiểm tra sản phẩm/số lượng; báo sản phẩm không còn công khai để khách sửa giỏ. Lưu snapshot tên và giá nếu có.
- Chỉ báo thành công và xóa giỏ sau khi lưu bền vững; lỗi giữ nội dung để khách thử lại. Chống submit trùng và spam.

### Tư vấn viên Zalo

- Hồ sơ gắn với tài khoản nhân viên: tên công khai, ảnh, số Zalo, thứ tự và bật/tắt hiển thị; chỉ super_admin sửa cấu hình.
- Hiển thị bộ chọn trên trang sản phẩm và liên hệ; khách chọn người rồi mở liên kết Zalo của đúng số đó.
- Có số điện thoại để sao chép/gọi nếu Zalo không mở; khi chưa có tư vấn viên thì hiển thị lựa chọn gửi inquiry.
- Không hiển thị hồ sơ tắt hoặc tài khoản khóa. API chỉ trả thông tin công khai, không lộ email đăng nhập/dữ liệu nội bộ.
- Click Zalo không tạo inquiry, không tự gửi giỏ hàng và không đồng bộ hội thoại về website. Xác minh định dạng liên kết được Zalo hỗ trợ và thử trên mobile/desktop khi tích hợp.

## 4. Quản trị và dữ liệu

- Sản phẩm: tên, slug, danh mục, mô tả, thông số, ảnh, giá tùy chọn, SEO và trạng thái nháp/công khai/lưu trữ.
- Cả hai role CRUD sản phẩm; archive giữ lịch sử inquiry. Danh mục có sản phẩm phải chuyển sản phẩm trước khi xóa.
- Inquiry có trạng thái Mới, Đang tư vấn, Hoàn tất, Đã hủy; ghi chú nội bộ, người phụ trách, chỉnh liên hệ có lịch sử và thùng rác. Giữ nguyên nội dung khách gửi ban đầu.
- Admin/nhân viên tạo inquiry thủ công từ cuộc gọi; không tự gửi thông báo mới trừ khi chọn rõ.
- Lưu inquiry, sản phẩm yêu cầu và email outbox trong cùng transaction. Email gửi đến hộp thư admin cấu hình, có retry và trạng thái lỗi; email lỗi không làm mất inquiry.
- Dữ liệu gồm tài khoản/vai trò, hồ sơ tư vấn công khai, danh mục, sản phẩm/ảnh, inquiry/items/notes, email outbox và audit cần thiết.
- Repository sản phẩm chuyển sang bất đồng bộ/Supabase; localStorage chỉ giữ giỏ/wishlist tạm.
- Endpoint inquiry công khai được validate/rate-limit; mutation quản trị và cấp chữ ký upload kiểm tra quyền. Cloudinary secret chỉ dùng phía server.

## 5. Thứ tự thực hiện

1. Đồng bộ tài liệu theo MVP này và cấu hình mẫu/local an toàn.
2. Đọc Next.js docs đúng phiên bản; chuẩn bị schema, migrations, RLS và lớp truy cập dữ liệu.
3. Auth, hai role, mời/khóa tài khoản và đổi/reset mật khẩu.
4. CRUD danh mục/sản phẩm, upload Cloudinary, storefront dùng dữ liệu server.
5. Giỏ gửi inquiry, quản trị inquiry, ghi chú chăm sóc khách và email retry.
6. Cấu hình/chọn tư vấn viên Zalo và kiểm thử liên kết liên hệ.
7. Nghiệm thu SEO, responsive, quyền, lỗi tích hợp trên staging rồi phát hành production.

Áp dụng SEO/responsive trong từng bước: HTML sản phẩm từ server, metadata cùng nguồn dữ liệu, sitemap/canonical, 404/301 và admin mobile. Giữ phong cách giao diện hiện có.

## 6. Kiểm thử nghiệm thu

- Khách không gọi được CRUD; staff không quản lý role/tài khoản/danh mục/hồ sơ tư vấn kể cả gọi API trực tiếp.
- Staff sửa được sản phẩm và inquiry của người khác; khóa tài khoản chặn thao tác dù session còn hạn.
- Giỏ giữ sau reload, số lượng hợp lệ, gửi tạo một inquiry và lưu snapshot đúng.
- Database lỗi không báo thành công; email lỗi giữ inquiry, retry không tạo inquiry mới.
- Tư vấn viên đúng số, tài khoản khóa không hiện, có fallback và click không tạo inquiry.
- Upload trái phép bị từ chối; draft không lộ; sản phẩm có HTML/metadata thật và URL lỗi trả 404.
- Các hành trình chính hoạt động trên điện thoại và bằng bàn phím.

## 7. Mặc định và cấu hình

- Giữ ngôn ngữ/tiền tệ hiện tại cho đến khi có quyết định chuyển; không tự đổi toàn site sang tiếng Việt/VND.
- Không bổ sung CRUD bộ sưu tập, blog CMS, realtime, thanh toán, CRM hoặc chat trong MVP.
- Cloudinary đã lưu cấu hình local, chưa tích hợp hoặc xác minh upload. Supabase MCP/API và URL/publishable key local đã kiểm chứng; migration remote đang chờ duyệt, Auth setup và email vẫn cần hoàn thiện. Xem [trạng thái tích hợp](./08-supabase-integration.md).
- Secret đã chia sẻ trong chat phải thay trước production; không chép giá trị vào tài liệu. Xem [hướng dẫn cấu hình/deploy](./06-production.md).
- Chưa đủ dịch vụ vẫn làm UI, migrations và kiểm thử local; không đánh dấu mock là tích hợp hoàn thành hoặc fallback mock trong production.

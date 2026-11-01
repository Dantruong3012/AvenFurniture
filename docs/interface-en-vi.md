# Giao diện tiếng Anh / tiếng Việt

Chọn **English** hoặc **Tiếng Việt** trên thanh điều hướng. Trang đăng nhập và khu vực admin có cùng bộ chọn ở góc trên bên phải. Lựa chọn áp dụng cho giao diện bán hàng, danh sách báo giá, yêu thích, biểu mẫu, đăng nhập, MFA và quản trị.

Cookie `aven_locale` chỉ nhận `en` hoặc `vi`, lưu một năm, `SameSite=Lax`, `Path=/`, thêm `Secure` trên HTTPS. Mặc định và giá trị không hợp lệ dùng tiếng Anh. Cookie này chỉ lưu ngôn ngữ, không chứa thông tin tài khoản. Không thay đổi URL hoặc tạo URL ngôn ngữ mới; lựa chọn không tự đồng bộ sang thiết bị khác.

Server đọc cookie bằng API bất đồng bộ của Next.js trước khi tạo HTML và metadata. Client đổi bản dịch rồi refresh Server Components, giữ trạng thái React, dữ liệu biểu mẫu và giỏ hàng. Nhãn hiển thị được dịch; ID, slug, giá trị select, trạng thái API/database, tiền tệ và số lượng giữ nguyên. Ngày giờ và giá được định dạng theo ngôn ngữ; múi giờ cố định hiện có được giữ.

Tên, mô tả sản phẩm, danh mục do chủ shop nhập, nội dung bài viết, tin nhắn khách hàng, ghi chú nội bộ và alt text trong database giữ nguyên theo dữ liệu. Không có dịch tự động hoặc dịch vụ trả phí. Bốn task Email tiếp tục hoãn; dịch nhãn các màn hình hiện có không kích hoạt gửi thư hay worker.

## Cấu trúc

- `lib/i18n/messages.ts`: locale allowlist, nội suy và các thông báo kiểm tra độ dài.
- `lib/i18n/vi.ts`: bản dịch tiếng Việt; chuỗi gốc tiếng Anh là khóa.
- `lib/i18n/server.ts`: locale của từng request; `lib/i18n/client.ts`: context giao diện.
- `components/i18n/`: provider và bộ chọn ngôn ngữ.

Thêm thông điệp bằng `t("English message")`, đưa bản tiếng Việt vào dictionary. Dùng placeholder cho dữ liệu thay đổi, ví dụ `t("View {v0}", { v0: product.name })`. Nội suy trả chuỗi văn bản, không tạo HTML. Không dịch giá trị gửi API, class CSS, đường dẫn hoặc React key. Các thông điệp chưa có bản dịch dùng nguyên văn gốc.

Đọc cookie tại root khiến các trang UI được render theo request thay vì dùng HTML tĩnh chung cho mọi người. Giữ cơ chế streaming/Suspense của Next.js; việc hiển thị nội dung streamed và chuyển ngôn ngữ cần JavaScript. Kiểm thử SSR đối chiếu HTML thực tế từ server, không khẳng định hỗ trợ đầy đủ điều hướng khi tắt JavaScript.

## Kiểm chứng và phát hành

Kiểm chứng cục bộ: 258 kiểm thử ứng dụng/SQL, 167 kiểm thử runner, 57 Playwright E2E trên Chromium, Firefox và mobile Chromium đều PASS. Lint không có lỗi (hai warning đã tồn tại), typegen/typecheck và production build PASS. Security gate không có high/critical; 16 moderate dependency findings đã tồn tại, không đổi dependency trong tính năng này.

E2E xác minh cookie, reload/navigation, HTML/metadata theo locale, locale không hợp lệ, giữ URL/query/hash, giữ draft và giỏ hàng, validation được dịch, login không gửi credential và bố cục 320–1440px. Tất cả yêu cầu ghi của fixture bị chặn hoặc mock tại localhost; không chạy bộ fixture trên Production. Kiểm thử admin SSR giữ nguyên trạng thái được chọn, ID, nội dung khách hàng và escape HTML.

Baseline read-only ngày 2026-11-01: main và Vercel Production alias cùng SHA `75565b2f1e4267a4beb462fc051c231f2cc4ed4b`, deployment `dpl_2jKjbr948xLihXH93wd5UGw7GPd4` READY. Required approvals=0; giữ sáu checks bound Actions App15368, strict/up-to-date, enforce-admins, resolve-conversations, cấm force-push/delete. Main tự deploy và gán alias `aven-furniture.vercel.app` khi merge.

Tính năng này chưa được Push/Merge/Deploy. Cần owner phê duyệt Push SHA mới, tạo PR để lấy sáu CI checks và Preview mới. Sau đó fresh preflight và authorization exact HEAD/BASE cho Merge/Production. Ngoại lệ session authorization dùng cho PR1 đã được tiêu thụ; không dùng lại. Không có migration, thay đổi secret, Auth/RLS hay environment trong gói source này. Rollback ứng dụng dùng deployment Production baseline; không bao gồm rollback database.

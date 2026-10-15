# Kiểm thử, cấu hình và vận hành production

## Cấu hình cần chuẩn bị

Các tên biến trong .env.example; Cloudinary đã được lưu riêng trong .env.local, chưa tích hợp hoặc xác minh kết nối:

```dotenv
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=
ADMIN_NOTIFICATION_EMAIL=
```

Tên key Supabase có thể thay đổi theo project sử dụng key mới hay legacy; thống nhất khi tích hợp. Chỉ publish URL/publishable key cần thiết. Secret/service-role và Cloudinary API secret tuyệt đối không dùng prefix NEXT_PUBLIC.

Cấu hình bổ sung theo hạ tầng: scheduler authentication, webhook signing secret, kho rate-limit dùng chung, monitoring và CAPTCHA nếu áp dụng. Supabase Auth cần cấu hình site URL, redirect allowlist, email templates và SMTP phù hợp; không nhầm email Auth với email inquiry của ứng dụng.

- Tạo .env.example không chứa giá trị thật; .env.local được gitignore.
- Secrets production đặt trong secret manager của hosting.
- Thiếu env bắt buộc phải báo lỗi rõ; không fallback mock ở production.
- Tách Supabase/Cloudinary/email local, staging và production phù hợp; staging dùng recipient thử nghiệm.
- Chưa có cloud key: dùng local Supabase nếu có Docker, adapter mock cho ảnh/email và ghi rõ giới hạn nghiệm thu.

## Kiểm thử bắt buộc

| Nhóm | Tình huống |
| --- | --- |
| Quyền | Khách gọi CRUD trực tiếp; staff gọi quản lý tài khoản/danh mục/tư vấn viên; tự nâng role; tài khoản bị khóa còn session |
| RLS | Anon không đọc inquiry/profile; chỉ đọc catalog published; đường privileged không bỏ qua kiểm tra quyền |
| Auth | Login/logout; reset expired/reused link; redirect không hợp lệ; đổi mật khẩu và chính sách phiên |
| Catalog | Slug trùng, draft publish, chuyển archive, sản phẩm mới xuất hiện, cập nhật đồng thời |
| Media | Upload trái phép/vượt giới hạn, giả metadata, DB lỗi sau upload, xóa ảnh còn được tham chiếu |
| Inquiry | Submit lặp, input sai/quá lớn, DB lỗi, snapshot sản phẩm và rate-limit nhiều instance |
| Email | Provider lỗi, timeout không rõ trạng thái, worker song song, job treo, retry/gửi lại và webhook giả nếu có |
| SEO | HTML nội dung/metadata nhất quán; sitemap published; status 404/301; canonical/filter; schema dữ liệu thật |
| UI | Mobile/admin navigation, zoom, keyboard/focus, form error và mạng chậm |
| Zalo | Chọn đúng số; ẩn tài khoản khóa; fallback khi không có người tư vấn; không tạo inquiry khi click |
| Giỏ | Giữ sau reload; cập nhật số lượng; xử lý sản phẩm ngừng công khai; gửi inquiry không trùng |

Dùng unit test cho logic validation/trạng thái; integration test cho database/RLS/transaction; E2E cho các hành trình thật. Không viết test chỉ sao chép implementation hoặc kiểm tra trang có render mà bỏ qua hành vi quan trọng.

## CI và phát hành

- [ ] Lint, TypeScript, test quan trọng và production build chạy thành công.
- [ ] Kiểm tra phiên bản dependency, lockfile và bản vá bảo mật phù hợp.
- [ ] Migrations thử trên staging với dữ liệu đại diện; có kế hoạch cho thay đổi phá vỡ tương thích.
- [ ] Domain/HTTPS đúng; metadataBase và canonical dùng domain thật.
- [ ] SPF/DKIM/DMARC được cấu hình và email được kiểm tra thực tế.
- [ ] Admin bootstrap/MFA đã kiểm chứng; đăng ký admin công khai bị vô hiệu hóa.
- [ ] Kiểm tra headers/CSP phù hợp Cloudinary/Auth, origin cho mutation dùng cookie, rate-limit và payload limits.
- [ ] Staging được bảo vệ và noindex; production index đúng trang công khai.
- [ ] Không còn secret, dữ liệu khách thật hoặc form thành công giả trong demo/seed/log.
- [ ] Chạy smoke test login, CRUD, gửi inquiry và nhận email sau deploy.

## Quan sát và xử lý sự cố

- Log có request/event ID; che token, password, secret và dữ liệu cá nhân không cần thiết.
- Theo dõi uptime, lỗi server, inquiry submission failure, email pending lâu và failed jobs.
- Cảnh báo tới người vận hành bằng kênh đã cấu hình; không tự gửi thông tin khách sang dịch vụ ngoài phạm vi.
- Có hướng dẫn resend email, khóa admin, khôi phục inquiry và xử lý ảnh mồ côi.
- Phân biệt email được provider chấp nhận, giao thành công và bounce nếu có webhook.
- Theo dõi chi phí database, hosting, email, Cloudinary storage/transformation/bandwidth trước khi mở rộng.

## Backup, rollback và dữ liệu cá nhân

- Chọn backup/PITR theo gói Supabase và nhu cầu; chốt RPO/RTO trước launch, không mặc định mọi gói đều có.
- Backup database không thay thế backup ảnh Cloudinary; xác định chính sách khôi phục cho cả hai.
- Thử restore vào môi trường riêng và ghi lại kết quả.
- Rollback app theo bản deploy; database dùng migration tương thích hoặc forward fix đã chuẩn bị, không xóa dữ liệu để rollback tùy tiện.
- Quy định thời gian giữ inquiry, thùng rác, audit và log; purge cả dữ liệu liên quan theo chính sách.
- Xác định người chịu trách nhiệm nhận yêu cầu chỉnh sửa/xóa dữ liệu khách hàng.

## Bàn giao

- Hướng dẫn mời/khóa admin, đổi mật khẩu/MFA.
- Hướng dẫn CRUD catalog, alt ảnh, publish và đổi slug.
- Hướng dẫn xử lý inquiry, notes, trạng thái và email lỗi.
- Danh sách môi trường/dịch vụ, nơi quản lý secrets, lịch backup và quy trình khôi phục.
- Báo cáo kiểm thử, giới hạn còn lại và danh sách nâng cấp P2.

## Lưu Cloudinary và deploy an toàn

- `.env.local` nằm tại root, được Git bỏ qua và có quyền `600` (chỉ chủ file đọc/ghi). Không đưa file này vào gói deploy hoặc gửi cho người khác.
- `.env.example` chỉ có tên biến và giá trị trống; `.gitignore` cho phép commit riêng file mẫu này.
- Khi deploy, nhập CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trực tiếp trong Environment Variables/Secrets của hosting. Không commit giá trị thật vào docs, source hoặc cấu hình CI.
- Tách môi trường development/production và giới hạn người xem/sửa secrets. Việc lưu local không tự cấu hình hosting.
- Secret đã được chia sẻ trong chat phải thay trước production. Cập nhật secret mới trực tiếp ở local/hosting, không gửi vào chat; thu hồi secret cũ sau khi chuyển đổi phù hợp.
- Khi tích hợp, đọc secret trong module server-only; không dùng NEXT_PUBLIC_ cho secret, không đặt trong next.config env hoặc serialize xuống client.
- Không log toàn bộ env, payload ký số có secret hoặc file cấu hình. Cloud name/API key không phải API secret, nhưng tài liệu vẫn chỉ dùng tên biến.
- Kiểm tra `git check-ignore .env.local`, file mode, file mẫu trống và quét secret trong tracked/untracked không bị ignore trước commit. Báo kết quả pass/fail, không in giá trị.
- Cấu hình đã lưu không đồng nghĩa upload hoạt động. Signed upload và xác minh tích hợp thuộc giai đoạn CRUD sản phẩm.

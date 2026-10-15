# Tài khoản staff kiểm thử

- Email: `staff-test-eofdtqnnqgxaoykcbfrv@example.com`.
- UUID: tra cứu trong Supabase Auth khi cần.
- Role: staff, active.
- Đăng nhập: http://localhost:3000/admin/login.

Tạo qua Supabase Auth Admin API, không ghi SQL vào auth.users. Email dùng cho kiểm thử đăng nhập, không nhận thư. Tài khoản không bị reset/thay mật khẩu hoặc tự enroll MFA trong Phase 0.

**Theo yêu cầu chủ project, mục macOS Keychain và file metadata đã xóa. Không lưu mật khẩu trong tài liệu, Git hoặc file tạm.** Script provisioning/lưu password cũ đã bỏ để tránh lưu lại ngoài ý muốn.

Test hiện tại dùng fixture Auth-only riêng trong bộ nhớ, xóa user mới sau khi chạy. Khi kiểm thử staff SSR, Admin generateLink tạo proof đăng nhập không gửi email; không đổi mật khẩu, không thu hồi phiên người dùng trên thiết bị khác. Script chỉ logout phiên do chính nó tạo.

Lệnh: `npm run test:live` và `node --env-file=.env.local scripts/test-staff-routes.mjs`. Cần SUPABASE_SECRET_KEY server-side. Kết quả mới nhất ở [11-phase0-acceptance.md](11-phase0-acceptance.md); kết quả JWT 3600/replay FAIL cũ đã được thay bằng kiểm thử cấu hình mới/timing đúng.

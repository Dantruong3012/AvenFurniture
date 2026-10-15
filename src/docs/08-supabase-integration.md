# Supabase: trạng thái tích hợp Phase 0

Cập nhật 14/10/2026. Nguồn nghiệm thu hiện tại: [11-phase0-acceptance.md](11-phase0-acceptance.md). Các roadmap nghiệp vụ là kế hoạch tương lai, không phải kết quả triển khai.

Snapshot Phase 0 bên dưới được giữ để đối chiếu. Category/Product CRUD, hai migration catalog bổ sung và bootstrap super admin sau đó được ghi tại [báo cáo Phase 1](12-phase1-catalog.md).

## Remote đã xác minh

- AvenFurniture, project ref `eofdtqnnqgxaoykcbfrv`, gói Free theo xác nhận chủ project.
- MCP, modern publishable key, Auth API và PostgREST hoạt động.
- 12 bảng public và `private.admin_guard`; 13/13 bật RLS, 29 policies. Private schema không expose qua PostgREST.
- Hai migrations đã áp dụng và khớp lịch sử: [foundation](../../supabase/migrations/20261014080743_aven_mvp_foundation.sql), [session security](../../supabase/migrations/20261014080757_admin_session_security.sql). TypeScript types đã generate từ remote.
- So sánh local/remote khớp bảng, cột, constraints, indexes, policies và functions. Không reset, tạo lại hoặc bổ sung schema nghiệp vụ trong Phase 0.
- Tài khoản staff-test hoạt động; không tự tạo super admin. Bootstrap riêng theo [script](../../supabase/bootstrap-super-admin.sql), cần danh tính được chỉ định.

## Auth settings đã áp dụng và đọc lại

| Mục | Giá trị |
| --- | --- |
| JWT expiry | 900 giây, JWT mới đã kiểm chứng |
| Public signup | Disabled |
| Refresh rotation | Enabled |
| Reuse interval | 10 giây |
| Password minimum | 12 ký tự |
| Site URL | http://localhost:3000 |
| Redirect allowlist | http://localhost:3000/auth/confirm |
| TOTP enroll/verify | Enabled |
| Email auto-confirm | False |
| Custom SMTP / sender | Chưa cấu hình, DEFERRED |

Management API chỉ sửa các trường đã được người dùng cho phép, giữ nguyên signing keys và SMTP. Supabase Secret Key không có quyền quản trị project; dùng SUPABASE_ACCESS_TOKEN riêng cho thao tác này, cần thu hồi sau setup.

## Phần ứng dụng

SSR browser/server cookies, proxy refresh, DAL requireAdmin, live RPC và RLS đều kiểm tra phiên quản trị. Role lấy từ database, không tin user metadata. Native paid timebox không bật; hạn quyền quản trị 7 ngày kiểm tra từ `auth.sessions.created_at`, session_id/user_id và cutoff khóa tài khoản, không gia hạn do refresh.

Login/logout, đổi mật khẩu, recovery proof, MFA enrollment/challenge và server-side AAL2 cho thay đổi Auth nhạy cảm đã có. Account security UI phục vụ Auth, không có dashboard nghiệp vụ. Chưa bật mandatory AAL2 toàn hệ thống; MFA QR/recovery vận hành cần xác minh thủ công.

Mutation Auth có Origin guard và limiter trong process. Production auth/admin dùng private/no-store, no-referrer; framework dev logging đã tắt để không log đối số Server Actions. Next.js đã vá lên 16.3.8. Không dùng service client cho CRUD thường; Secret Key không có trong client bundle.

## Email và production sau này

SMTP, custom domain và email delivery DEFERRED theo yêu cầu chủ project; chưa gửi email kiểm thử. Recovery proof được kiểm thử qua Admin generateLink + verifyOtp, không đồng nghĩa delivery đã hoạt động. Template tương thích ứng dụng khi cấu hình email sau này:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

Invite dùng `type=invite`. Luồng hiện tại không xử lý generic OAuth/PKCE callback, không tự bật OAuth provider. Template remote có tồn tại nhưng chưa nghiệm thu rendering/delivery, không tự thay khi email đang deferred. Phải cấu hình domain/HTTPS, allowlist chính xác và access-log redaction trước production.

## Kiểm thử và vận hành

28 test local đạt; Auth/MFA/recovery proof/refresh live đạt sau sửa timing test reuse; staff HTTP smoke và CSRF cross-origin đạt. Xem bảng bằng chứng và phần giới hạn trong tài liệu 11. Production dependency audit không có vulnerability; audit toàn bộ còn vấn đề dev-tool braces/ESLint, không ép hạ major.

`.env.local` giữ nguyên Cloudinary, mode 600 và Git ignore; không commit. Mật khẩu không còn lưu Keychain/file; fixtures Auth-only được xóa sau kiểm thử. Migration/test lâu dài được giữ.

Storefront vẫn demo. Product/category/consultant CRUD, inquiry transaction, Cloudinary upload và email worker chưa triển khai và nằm ngoài Phase 0. Không tự chuyển sang các chức năng đó.

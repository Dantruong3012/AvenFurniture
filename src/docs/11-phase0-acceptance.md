# Phase 0 — nghiệm thu ngày 14/10/2026

**Cập nhật sau báo cáo:** Chủ project đã nghiệm thu Phase 0 đủ để phát triển tính năng và cho phép bắt đầu [Phase 1: Category & Product Management](12-phase1-catalog.md). Các kết quả/giới hạn bên dưới là snapshot lịch sử Phase 0, không phải lệnh dừng Phase 1.

Project `eofdtqnnqgxaoykcbfrv`, Supabase Free. Không deploy, nâng cấp gói, reset database, seed nghiệp vụ hoặc đổi mật khẩu staff. SMTP, custom domain và email delivery **DEFERRED theo yêu cầu chủ project**. Không mua hoặc đăng ký dịch vụ.

## Checklist cuối cùng

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| Supabase connection | PASS | MCP đúng ref; Auth settings và PostgREST trả thành công |
| Environment | PASS | 7 biến ứng dụng có giá trị; `.env.local` mode 600/ignored/untracked; giá trị mẫu trống; quét client build không có secrets |
| JWT 15 phút | PASS | Management API `jwt_exp=900`; JWT mới đã xác minh `exp-iat=900` |
| Public signup disabled | PASS | PATCH/GET `disable_signup=true`; public Auth settings xác nhận |
| Auth URLs | PASS | Site URL `http://localhost:3000`; redirect `http://localhost:3000/auth/confirm` |
| Refresh rotation | PASS | Token đổi; session/deadline không đổi; HTTP trực tiếp và SDK |
| Concurrent refresh / parent exception | PASS | Hai request đồng thời thành công; parent vẫn hợp lệ sau 11 giây |
| Reuse detection | PASS ngoài grace | Ancestor bị từ chối; đợi thêm 11 giây sau thu hồi, token mới nhất bị từ chối HTTP 400 |
| Session 7 ngày | PASS ở app/RLS | Fixture SQL trước/sau mốc 604800 giây; RPC deadline thật không kéo dài khi refresh |
| Login/logout/reload | PASS | Password login fixture; staff SSR cookie qua reload; logout chặn JWT/cookie cũ |
| Expired session handling | PASS với controlled fixture | SDK tự refresh khi expires_at cục bộ hết hạn; proxy từ chối phiên SQL hết hạn; chưa ngồi chờ JWT thật hết 15 phút |
| Password change | PASS ở Auth API | Chỉ trên fixture: mật khẩu cũ bị từ chối, mới đăng nhập được, global sign-out |
| Password recovery | PASS proof/guard; delivery DEFERRED | Admin-generated recovery proof chỉ dùng một lần; unit test chặn thiếu OTP/MFA; không gửi email |
| Staff/Super admin permissions | PASS trong phạm vi test | Staff live không sửa role, không thấy audit; super admin/last-admin guard kiểm thử SQL local, chưa bootstrap super admin thật |
| RLS | PASS | 13/13 bảng bật RLS; 29 policies; private schema HTTP 406; anon/no-profile bị chặn dữ liệu quản trị |
| MFA backend | PASS | TOTP enroll/challenge/verify AAL2/unenroll trên fixture remote; fixture đã xóa |
| MFA giao diện và recovery vận hành | MANUAL VERIFICATION REQUIRED | Giao diện tối thiểu đã triển khai; cần chủ project thử quét QR, challenge ở browser và diễn tập mất thiết bị |
| SMTP/domain/email delivery | DEFERRED | Chưa có SMTP/sender; chủ project yêu cầu chưa gửi email |
| Migrations/schema | PASS | 2 versions local/remote khớp; tái tạo PGlite; signature bảng/cột/constraints/indexes/policies/functions khớp |
| TypeScript / ESLint | PASS | `npm run typecheck`, `npm run lint` |
| Tests | PASS | 28 test local; `test-phase0-live.mjs` exit 0 sau sửa timing reuse |
| HTTP smoke / CSRF | PASS production local | Staff `/admin` và `/admin/settings/security` 200; cookie logout 307; Server Action cross-origin bị từ chối |
| Development startup | PASS có giới hạn | Dev server hiện có trả login 200; không dừng server của người dùng |
| Production build | PASS | Next.js 16.3.8, build toàn bộ routes |
| Production dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Full dependency audit | FAIL / upstream dev-tool issue | 5 báo cáo high trong chuỗi ESLint → fast-glob → micromatch → braces; không có bản vá tương thích mà audit đưa ra |

**SETUP INCOMPLETE — BLOCKERS REMAINING** cho tiêu chí nghiệm thu toàn bộ: MFA browser/recovery vẫn cần xác minh thủ công; dependency audit đầy đủ còn cảnh báo dev-tool. Core database/Auth đã hoạt động và được kiểm thử. Không coi SMTP/domain/email delivery đang DEFERRED là lỗi triển khai. Không chuyển sang nghiệp vụ.

## Thay đổi đã thực hiện

- Management API PATCH hẹp: JWT 900, signup tắt, rotation bật, reuse 10, password tối thiểu 12, Site URL localhost và thêm redirect callback. Đọc lại để xác minh. Không rotate signing keys/Secret Key, thay SMTP hoặc bật paid timebox.
- Next.js và eslint-config-next từ 16.3.5 lên 16.3.8; cập nhật sharp/source-map-js trong lockfile. Node 22.17+ được khai báo; `.nvmrc` dùng Node 22. Audit production trước đó có lỗi, sau bản vá bằng 0. Không dùng `npm audit fix --force` để hạ ESLint config về Next 14.
- MFA tùy chọn tại `/admin/settings/security`. Server xác minh session/role trước mỗi thao tác; challenge chỉ cho factor của caller. Thao tác đổi password, thêm/gỡ factor đòi AAL2 nếu tài khoản đã có verified factor. Chưa ép toàn bộ super admin AAL2 hoặc tự enroll staff.
- Password reauthentication dùng client riêng trong bộ nhớ rồi logout, giữ cookie AAL2 hiện tại. Recovery yêu cầu proof OTP và mã TOTP chính nếu đã enroll; proof sai/hết hạn hoặc MFA sai không được đổi password. Link GET không tiêu thụ proof; không nhận redirect tùy ý.
- Bổ sung kiểm tra Origin bắt buộc và giới hạn lượt thử trong process. Supabase Auth limits vẫn hoạt động; giới hạn local này không thay thế distributed rate limiter hoặc CAPTCHA trước public production.
- Headers nosniff, DENY/frame-ancestors, base-uri/object-src, permissions policy; response auth/admin production private/no-store/no-referrer. Tắt framework development logging vì Next 16 có thể log đối số Server Functions. Host/proxy production vẫn cần cấu hình lọc query chứa token_hash trong access logs.
- Dev Next tự ghi đè Cache-Control trang render thành `no-cache, must-revalidate`; redirect vẫn private/no-store. Production smoke xác minh no-store. Không sửa internals Next để thay hành vi dev.
- Dòng chờ tính năng admin đã sửa để không còn báo database chưa setup. Không thêm CRUD hoặc chuyển storefront sang remote.

## Giải thích kiểm thử refresh

Không tự triển khai refresh token. Khi test ngay sau replay, token mới nhất từng trả 200. Đối chiếu [mã nguồn RevokeTokenFamily](https://github.com/supabase/auth/blob/master/internal/models/refresh_token.go) thấy nhánh legacy cập nhật `updated_at` khi thu hồi; [nhánh refresh](https://github.com/supabase/auth/blob/master/internal/tokens/service.go) áp dụng grace dựa trên mốc đó. Thử lại ngoài khoảng 10 giây mới kiểm chứng thu hồi, và kết quả HTTP 400. Không hứa tất cả token bị chặn tức thì trong grace window. Parent exception được kiểm thử riêng, không coi đó là replay trái phép.

Giới hạn 7 ngày dùng `auth.sessions.created_at`, session_id và user_id từ JWT đã xác minh; kiểm tra not_after, profile active, cutoff khóa và role hiện tại. Tất cả policy quản trị gọi helper, bao gồm self-read profile. Khách vẫn đọc catalog public. Free không có native timebox được bật: Auth có thể tiếp tục refresh, nhưng RLS/server từ chối quyền quản trị quá tuổi. [Supabase Sessions](https://supabase.com/docs/guides/auth/sessions).

## MFA và recovery vận hành

Theo [Supabase TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), TOTP khả dụng trên Free. Chỉ chủ tài khoản mới thấy QR trong response riêng tư; không log/persist QR hoặc secret. Test backend dùng secret trong RAM của fixture, không enroll vào tài khoản staff của người dùng.

Manual verification: đăng nhập → Account security → Add authenticator → quét QR → Verify code → reload xác nhận AAL2. Đăng nhập ở browser mới phải AAL1; đổi password/gỡ factor phải yêu cầu verify. Thử một mã sai phải bị từ chối. Có thể thêm factor thứ hai sau khi xác minh factor đầu. Khi hủy enrollment, bấm Cancel enrollment để xóa factor chưa verified; không tự xóa factor từ thiết bị khác.

Mất thiết bị: dùng factor dự phòng nếu có. Nếu mất mọi factor, không cho self-service bỏ qua MFA bằng email. Chủ project cần xác minh danh tính ngoài ứng dụng, kiểm tra UUID/factors qua Dashboard/Admin API và thực hiện recovery có giám sát. Không gỡ factor chỉ vì ai đó biết email. Khóa profile trước với tài khoản thông thường, giữ audit; chỉ gỡ factor của user đã xác minh; kiểm tra phiên cũ bị chặn và enroll lại trước mở quyền. Super admin cuối cùng không thể bị khóa bằng trigger: phải chuẩn bị người quản trị dự phòng theo bootstrap/handover đã có trước khi bắt buộc MFA toàn hệ thống. Quy trình mất mọi factor chưa diễn tập với người vận hành, vì vậy chưa bật mandatory AAL2.

## Database audit

13 bảng, 104 cột, 68 constraints CHECK/FK/PK/UNIQUE, 36 indexes, 29 policies, 10 functions. Signature read-only ở `supabase/audit-schema.sql`, tái tạo local bằng `scripts/audit-schema-local.mjs`. PGlite PostgreSQL mới biểu diễn NOT NULL thành constraint riêng; loại `contype=n` khỏi so sánh constraint, vẫn so sánh is_nullable của từng cột. Không phát hiện schema drift.

Migration chạy một lần theo lịch sử version, không được chạy lại toàn bộ file lên schema đã có. Tái tạo schema trống đã đạt; không thêm IF NOT EXISTS để che drift. Không có migration mới trong Phase 0. Security definer functions có search_path cố định; private.admin_guard không có policy là chủ ý chặn client. Advisor cảnh báo leaked-password protection chưa bật; không nâng gói để bật. Performance warning nhiều SELECT policies/index chưa dùng không được đánh dấu đã tối ưu tải.

## Vận hành và secrets

Biến runtime: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`; giữ nguyên ba biến `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Cloudinary chỉ kiểm tra cấu hình có sẵn, không upload/xóa ảnh hoặc gọi workflow nghiệp vụ. Các biến EMAIL_PROVIDER_API_KEY/EMAIL_FROM/ADMIN_NOTIFICATION_EMAIL trong mẫu là dự kiến giai đoạn sau, chưa dùng.

`SUPABASE_ACCESS_TOKEN` chỉ dành cho script quản trị, không phải runtime app. **Sau khi kiểm tra xong, chủ project thu hồi token tại Supabase Account → Access Tokens và xóa riêng dòng SUPABASE_ACCESS_TOKEN khỏi `.env.local`.** Không thu hồi nhầm SUPABASE_SECRET_KEY; không cần giữ Management token để app chạy. Không commit `.env.local`.

Keychain và `.env.staff-test.json` đã xóa theo yêu cầu trước đó. Các script provisioning/lưu password cũ đã bỏ; test mới không cần lưu mật khẩu. User fixture Auth-only đã được xóa, staff giữ nguyên; chỉ còn một user Auth sau cleanup. Server production smoke do agent tạo đã dừng; giữ dev server của người dùng. Không xóa migration, test lâu dài hoặc audit logs hệ thống.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run audit:env
npm run check:supabase
npm run test:live
node --env-file=.env.local scripts/test-staff-routes.mjs
```

`test:live` tạo fixture riêng rồi xóa trong finally, không gửi email; cần server Secret Key và mạng. `auth:config -- --apply` cần Management token, thay các trường đã liệt kê; không chạy lại sau khi thu hồi token. Lưu ý script Auth URL hiện dùng localhost theo Phase 0; phải review trước production.

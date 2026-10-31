# Ngoại lệ Solo tối thiểu cho PR #1 — owner đã xác nhận

Status: OWNER_CONFIRMED / PROTECTION_VERIFIED. Owner tự đặt approvals=0; read-back xác nhận required-PR object và sáu required checks/protections còn lại được giữ. Owner cũng xác nhận backup waiver gồm Auth/MFA và inventory đã báo. Không xin lại hai quyết định này. Chỉ Codex, không gọi Antigravity, không sửa Orchestrator; đề xuất hai-agent trước đây không áp dụng. Các mục dưới giữ bối cảnh ngoại lệ đã chốt, không phải approval chạy migrations/merge/deploy.

## Thay đổi cần duyệt

1. Cho repository `Dantruong3012/AvenFurniture` dùng Codex kiểm tra kỹ thuật và owner `Dantruong3012` quyết định phát hành; bỏ yêu cầu independent human/Antigravity review trong Release Policy của luồng Solo này. Không tạo GitHub review APPROVED giả hoặc self-review.
2. PATCH `/repos/Dantruong3012/AvenFurniture/branches/main/protection/required_pull_request_reviews`, chỉ đổi `required_approving_review_count: 1 → 0`. Giữ required-pull-request object và toàn bộ flags khác. Đọc/snapshot rule trước, read-back sau; không xóa protection.
3. Giữ sáu contexts `lint`, `typecheck`, `unit-pglite-integration`, `local-fixture-e2e`, `build`, `security` bound App 15368, strict/up-to-date; enforce admins, resolve conversations, cấm force push/delete/bypass, auto-merge=false, merge commit. GitHub không tự chứng minh Codex đã kiểm tra hoặc owner đã duyệt Production; quyết định vận hành vẫn phải được ghi riêng.
4. Giữ exact-SHA/expiry/signer và cơ chế rollback hiện có. Khi mọi gate đạt và owner đã cấp authorization exact head/base/Production impact hợp lệ, cho Codex đóng vai operator gọi GitHub merge API chuẩn với `sha=HEAD`, `merge_method=merge`, sau fresh preflight rule/CI/identity và xác minh authorization. Đây là đường thao tác operator theo ngoại lệ chính sách đã duyệt, không sửa Orchestrator/adapter hoặc tự động merge vì CI xanh. Không gọi helper hiện tại với receipt giả để vượt điều kiện human/HMAC; không gọi merge API trước khi ngoại lệ và authorization thực sự được owner duyệt.

## Dữ liệu exact-SHA đã xác minh

- HEAD: `eedc8a8990da5e46e981604c21dd667e8ed48c30`.
- BASE/main: `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`.
- PR #1 Ready, chưa merged, không behind base; sáu latest required checks success. Approval mục tiêu release hiện tại chưa phải signed authorization exact head/base/expiry. Signing key/token chưa được provision; không tự ký thay owner. Chuẩn bị claims theo [runbook](release-operations.md), chỉ cấp issuedAt/expiresAt/signature sát thời điểm mọi prerequisite đã đạt (tối đa 900 giây). Head/base thay đổi phải trình lại.
- Vercel Production Branch main, automatic domain assignment=true. Merge main có thể tự build/deploy và đưa alias Production sang version mới; approval merge phải bao gồm tác động này.
- Production đang READY ở `dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge`, SHA BASE/main phía trên; Preview READY đúng HEAD tại `aven-furniture-cui191qsc-dantruong.vercel.app`.

## Blocker bắt buộc trước merge

Supabase đã apply thành công đúng gói10 migrations được owner duyệt riêng, một transaction/HTTP201, history15 và schema/Auth/RLS postflight đạt. Xem [kết quả thực thi](production-migrations-waiver-preflight.md). Không còn blocker thiếu batch schema này. Không reset, seed hoặc đổi secrets; waiver không thay thế việc kiểm thử.

Owner đã chấp nhận nguy cơ không phục hồi gồm Auth/MFA và inventory đã báo; waiver giữ nguyên. Merge/Deploy vẫn chưa được duyệt.

Inquiry chống spam/body cap và live authenticated acceptance/alert delivery còn là release-readiness findings; không được coi CI xanh là tự giải quyết. Không gọi API ghi Production để thử. Runtime log read 15m hiện trả 0 records, không phải bằng chứng mọi chức năng ổn định. Bốn task Email giữ hoãn hoàn toàn.

Release Policy/runbook đã ghi nhận quyết định owner; agent không sửa remote protection, application source, HEAD, main, deployment, database hoặc secrets. Không gọi Antigravity. Evidence mới: `.ai-collab/.runtime/solo-waiver-release-preflight/`; receipt trước waiver vẫn giữ lịch sử trong `.ai-collab/.runtime/production-release-final-preflight/`.

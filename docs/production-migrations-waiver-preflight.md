# Migration preflight sau quyết định Solo / backup waiver

Status: APPLIED_POSTFLIGHT_VERIFIED. Owner đã phê duyệt riêng đúng packet/project; 10 migrations đã chạy thành công một lần. Chưa Merge hoặc Deploy. Backup waiver gồm Auth/MFA vẫn giữ nguyên. Chỉ Codex; không sửa Orchestrator, không bật task Email.

## Kết quả thực thi được phê duyệt — 2026-11-01 (giờ Việt Nam)

- Project `eofdtqnnqgxaoykcbfrv`, ACTIVE_HEALTHY; kiểm tra SHA256 ngay trước request khớp `12d5154f2409e9dcecdfc090e5540118df228685d9685fba4740ca6e5ed5bfd0`, 75,734 bytes. History trước đúng 5 versions, baseline signature/data đúng rehearsal và waiver.
- Gửi nguyên packet đúng **một POST Management SQL API**, một BEGIN/COMMIT cho cả DDL và history, lock timeout5s / statement timeout60s. HTTP201 lúc `2026-10-31T17:12:26.016Z`; không lỗi/timeout/uncertain response và không retry. SELECT-only probe trước apply xác minh endpoint giữ transaction READ ONLY và SET LOCAL trong transaction rồi reset sau rollback; packet rehearsal đã xác minh rollback toàn bộ khi inject lỗi.
- Postflight READ ONLY hoàn tất `2026-10-31T17:15:56.379Z`: đủ **15 versions**, SQL statements history của 10 versions khớp hash gốc. Schema public/private khớp toàn bộ disposable signature: 17tables / 140columns / 52indexes / 43policies / 30functions / 105constraints. Không còn migration nào trong batch này thiếu.
- RLS bật trên toàn bộ application tables; `submit_customer_inquiry` chỉ service_role được execute, anon/authenticated không được. Anon không truy cập admin_guard hoặc gọi private admin/customer identity helpers. Kiểm tra ban đầu kỳ vọng private schema USAGE=false là không đúng với baseline: baseline cố ý cấp USAGE để gọi duy nhất consultant helper công khai; object grants thực tế đúng, không thay thêm Production grant.
- GET PostgREST customer profiles/cart/wishlist/newsletter trả401 với anonymous; products200/0rows; JWT hỏng401. Auth config giữ canonical Production URL, signup disabled, JWT900s, refresh rotation và TOTP bật. Đây là kiểm tra cấu hình/quyền; chưa chạy login/MFA hoặc business write live.
- Aggregate counts giữ nguyên: Auth3 / identities3 / MFA1 / sessions10 / staff3 / media3 / category1 / audit3 / products0 / inquiries0 / outbox0. Không reset, seed, gửi email, đổi Auth config hoặc secrets. Không có cron.job table; không kích hoạt bốn task Email.
- Evidence private, gitignored: `.ai-collab/.runtime/approved-production-migrations-20261101/` gồm preflight, mutation-attempt/response, history-after, postflight và anonymous-access. Không commit raw response hoặc credentials.
- Tiếp theo: sửa Inquiry body cap/anti-abuse local, kiểm thử rồi xin duyệt push exact SHA mới; CI/Preview cần xác minh trên revision mới trước approval Merge/Production auto-deploy riêng. Không dùng CI của revision cũ thay thế.

## Bối cảnh chuẩn bị trước apply (lịch sử)

Các mục dưới ghi lại preflight và kế hoạch trước approval; trạng thái thực thi hiện tại ở trên và trong manifest.

## Kết quả mới

- PR #1 Ready, chưa merged; HEAD `eedc8a8990da5e46e981604c21dd667e8ed48c30`, BASE/main `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`; cả sáu latest required checks success, App 15368.
- Main có required-PR object, approvals=0 do owner thay; strict/enforce admins/conversation resolution true, force push/delete false, không bypass; auto-merge=false, merge commit được phép. Agent không thay protection.
- Supabase history GET + read-only SQL thành công; role read-only có BYPASSRLS; các application tables public/private đều bật RLS. Baseline vẫn đúng5 versions qua `20261015085103`.
- Dữ liệu: Auth users3, identities3, MFA factors1, sessions10, staff3, media3, category1, audit3; products/product_images/inquiries/items/notes/outbox/storage objects đều0. Không đọc nội dung tài khoản/MFA secret/dữ liệu cá nhân.

Backup waiver đã được owner chấp nhận và làm rõ: Auth/MFA cùng inventory trên có thể tạo lại; chấp nhận nguy cơ không khôi phục được khi migration lỗi. Database không trống, nhưng phạm vi waiver này đã có hiệu lực. Không xin lại waiver/clarification hoặc đòi backup như một điều kiện không thể miễn trừ. Chỉ dừng nếu phát hiện dữ liệu/rủi ro mới vượt phạm vi đã chấp nhận.

## Đúng 10 migrations còn thiếu

SHA256 từng file khớp [manifest](production-migration-manifest-2026-10-31.json), source local và blob của candidate; không có SQL drift:

1. `20261016103000_inquiry_transaction.sql` — atomic inquiry RPC.
2. `20261017163000_inquiry_change_events.sql` — event schema/change RPCs.
3. `20261017180000_newsletter_data_policy.sql` — newsletter schema/RLS/RPC, không delivery activation.
4. `20261017193000_staff_auth_policy.sql` — roles/session expiry/manager RLS.
5. `20261017210000_staff_invite_lifecycle.sql` — invite fields/constraints.
6. `20261017223000_staff_role_status_safeguards.sql` — revoke sessions/refresh tokens khi đổi role/khóa.
7. `20261017230000_customer_identity_policy.sql` — customer ownership/RLS/wishlist.
8. `20261017233000_staff_deletion_policy.sql` — giữ staff history/FK/audit.
9. `20261018000000_customer_cart_items.sql` — cart/session RLS/limits.
10. `20261018010000_customer_wishlist_items.sql` — wishlist sync key/limits.

## Rehearsal và compatibility

Chạy lại migration-upgrade, database, auth-session, staff-auth-policy, customer-identity-policy: **49/49 pass**, không skipped. Baseline5→15 trên PGlite disposable; mỗi migration transaction riêng, so khớp rows/columns gốc sau từng commit, gồm markers password/MFA, sessions, legacy staff, media/audit. Test service-only inquiry RPC/idempotency, RLS17 tables, owner/session-bound cart/wishlist và rollback DDL khi transaction lỗi.

Đây không phải backup/restore thật hoặc GoTrue/MFA live login. Waiver không tạo khả năng phục hồi. Main cũ chưa có inquiry management mới; legacy staff/session/catalog được giữ trong rehearsal. Sau khi dùng role admin/editor mới, full Auth rollback về app cũ chưa được nghiệm thu. Không thay/khóa account Production để thử.

Fresh Production schema signature cũng khớp chính xác baseline5: 13 tables,107 columns,38 indexes,29 policies,17 functions,75 constraints. Đã lưu expected signature sau nâng cấp để postflight: 17 tables,140 columns,52 indexes,43 policies,30 functions,105 constraints. Signature public/private kiểm tra metadata/code, không phải dump dữ liệu Auth.

## Kế hoạch để duyệt thao tác riêng

1. Scope waiver đã xác nhận; trước apply đọc lại project/history/hash. Credentials không ở chat/arguments/repo/CI. Executor preflight đã chạy SELECT trong transaction **READ ONLY** trên normal Management SQL endpoint: role postgres, create public/private và history INSERT privileges đều true; không có DDL/DML thật. Không cần xin PG password hoặc đổi secret để chuẩn bị.
2. Gói thực thi cụ thể: `.ai-collab/.runtime/solo-waiver-release-preflight/production-migrations-reviewed.sql` (75,734 bytes), SHA256 `12d5154f2409e9dcecdfc090e5540118df228685d9685fba4740ca6e5ed5bfd0`. Gói chứa đúng10 SQL nguyên bản và INSERT history đúng versions/names/statements trong **một transaction chung**, lock timeout5s/statement timeout60s. Guard bắt buộc history đúng5 baseline trước và15 sau; không overwrite/repair history. Không đụng Vault/seed/roles/secrets.
3. Đã chạy chính gói SQL trên PGlite disposable: apply thành công, history15 đúnghash, giữ mọi rows/columns gốc; lỗi giả ngay trước commit rollback toàn bộ DDL+history; chạy lại bị baseline guard chặn. Đây là rehearsal SQL packet, không phải native CLI hoặc thử write trên Supabase. Method đề nghị duyệt: một POST tới [Management SQL query API](https://supabase.com/docs/reference/api/v1-run-a-query) của đúng project với chính packet trên, sau khi rehash. API được provider đánh dấu Beta/experimental; metadata permission probe đã pass nhưng chưa có actual migration call. Không dùng Apply Migration API tự sinh versions và không tách apply/history thành hai request không atomic. Đây là operational SQL packet phục vụ release, không xây Orchestrator/runner/workflow mới.
4. Trình owner approval **chỉ Production migrations**: project `eofdtqnnqgxaoykcbfrv`, đúng10 tên/hash và packet SHA trên, method/transaction/timeouts, rủi ro waiver. Sau approval riêng mới gửi request. Lỗi/timeout/403 phải dừng và đọc history/schema; không retry mù, đổi executor/payload/quyền hoặc tự nâng quyền. Transaction chung dự kiến cho trạng thái5 hoặc15; nếu khác phải dừng điều tra. Không auto-down/reset/delete/restore; không hứa phục hồi dữ liệu khi lỗi ngoài transaction.
5. Postflight chỉ đọc: đủ15 versions; RPC signatures/grants, RLS/policies, cart/wishlist/newsletter/event schema; aggregate counts giữ nguyên ngoài thay đổi được duyệt. Không đăng nhập/submit inquiry/gửi email tự động.
6. Giải quyết inquiry anti-abuse/body cap và giới hạn authenticated acceptance/alert delivery trước public exposure. Nếu source HEAD đổi phải kiểm thử/CI/Preview lại và trình exact SHA mới.
7. Khi DB/readiness đạt mới trình approval **merge + Production auto-deploy** cho exact PR/head/base. Signer/signed authorization hiện chưa cấu hình; không tự ký thay owner. Waiver không phải approval merge/deploy.

## Vercel và rollback

Production Branch main, autoAssignCustomDomains=true: merge main có thể tự build/deploy và chuyển Production alias. Alias `aven-furniture.vercel.app` hiện trỏ `dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge`, READY, SHA `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`.

Deployment baseline còn truy xuất được, là rollback target dự kiến, **không chứng nhận mọi nghiệp vụ ổn định**: sitemap build cũ còn localhost, không có sản phẩm thật. Chưa test promote rollback hoặc chứng minh quyền write rollback. Code rollback cần approval riêng rồi xác minh alias/SHA/health; không đảo schema/data. Waiver đồng nghĩa database restore không phải phương án sẵn có.

Sau merge được duyệt: lấy full merge_commit_sha từ GitHub, chờ Vercel READY trên main đúng merge SHA, kiểm tra alias và GET home/products/sitemap/missing-product/admin login/protected redirects/API privacy; không thay merge SHA bằng dev SHA. Catalog0 nên chưa thể chứng minh valid-product/media flow nếu không có sản phẩm thật và approval nghiệp vụ. Đọc build/runtime logs có scope; empty window không phải full health/alert proof.

Evidence: `.ai-collab/.runtime/solo-waiver-release-preflight/`. HEAD, main, SQL source, Orchestrator và services/credentials không đổi.

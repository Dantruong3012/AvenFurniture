# Bàn giao AvenFurniture — Release / Production

Cập nhật: **31/10/2026, 22:46 (UTC+7)**. Đây là điểm đọc đầu tiên khi tiếp tục phiên sau. Tài liệu execution cũ giữ lịch sử theo thời điểm; các kết quả mới bên dưới thay thế những blocker đã hết hiệu lực.

Owner đã yêu cầu tiếp tục sau snapshot này. Kết quả điều tra CI, rehearsal nâng cấp và kiểm thử mới ở [release continuation](release-continuation-2026-10-31.md). Trạng thái “dừng”/“tài liệu chưa commit” bên dưới là lịch sử tại thời điểm bàn giao; không thay thế STATE mới. Production vẫn chưa được duyệt thực thi.

## Điểm dừng hiện tại

Owner yêu cầu dừng triển khai để lưu bàn giao. **Chưa merge main, chưa deploy/promote Production, chưa chạy Production migration, chưa reset/xóa database.** Bốn task Email vẫn hoãn. Không chạy Antigravity CLI theo chỉ đạo owner; không có independent review được giả lập.

| Hạng mục | Trạng thái đã xác minh |
| --- | --- |
| Repository | Dantruong3012/AvenFurniture |
| Branch dev / HEAD đã push | `dev/aven-autonomous-backlog` — `4d78b2cd5387a59bfa90db4eca62be61be8adaf3` |
| Main / Production SHA | `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1` |
| PR | [Draft PR #1](https://github.com/Dantruong3012/AvenFurniture/pull/1), head đúng 4d78b2c; body cập nhật và kiểm chứng; chưa merge |
| Main protection | PUT 200 + GET 200: strict/up-to-date, 6 checks gắn GitHub Actions App 15368, 1 review, dismiss stale, enforce admins, resolve conversations; force push/delete bị cấm |
| Merge settings | `allow_auto_merge=false`, `allow_merge_commit=true`, đã đọc lại |
| Reviewer | Chưa có reviewer GitHub độc lập; owner/PR author không tự đáp ứng review |
| Supabase | `eofdtqnnqgxaoykcbfrv`, ACTIVE_HEALTHY; owner tự Resume sau khi request của agent bị 403 |
| Vercel Production | `dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge`, alias https://aven-furniture.vercel.app; vẫn SHA main cũ |

Working tree sạch trước khi tạo bộ tài liệu bàn giao này. Các sửa tài liệu bàn giao được để local, chưa commit/push; không thay đổi release candidate. Lần push trước chỉ được duyệt đúng SHA 4d78b2c.

## CI và kiểm thử

Đọc GitHub lúc **15:45:56 UTC** cho đúng SHA 4d78b2c:

- [PR run 41215954294](https://github.com/Dantruong3012/AvenFurniture/actions/runs/41215954294): **6/6 jobs success** — lint, typecheck, unit-pglite-integration, local-fixture-e2e, build, security.
- [Push run 41215950054](https://github.com/Dantruong3012/AvenFurniture/actions/runs/41215950054): **failure**, riêng unit-pglite-integration lỗi tại bước Run unit-pglite-integration; 5 jobs khác success. Chưa đọc log để xác định nguyên nhân. Không gọi toàn bộ CI xanh; phiên sau cần điều tra khác biệt push/PR trước khi quyết định rerun/fix.
- Các run SHA 1501f2c trước đó lỗi test origin hardcoded localhost. Đã sửa test cô lập NEXT_PUBLIC_SITE_URL và push 4d78b2c theo approval. Không mặc định lỗi push mới có cùng nguyên nhân.
- Local: 235 tests ứng dụng/SQL/CLI pass (cả env CI); 165 runner tests pass; 42 E2E fixtures pass Chromium/Firefox/mobile; lint/typegen/TypeScript/build pass; secret scans pass; audit 0 high/critical, 16 moderate. Hai lint warnings cũ còn tồn tại.
- Fixtures không chứng minh toàn bộ luồng đăng nhập/admin CRUD/media trên Production. Chưa tạo mới Preview evidence cho 4d78b2c.

## Database: dữ liệu thực tế và backup

Read-only inventory lúc **2026-10-31T15:42:33Z**, role `supabase_read_only_user` có BYPASSRLS; chỉ đếm, không xuất nội dung tài khoản hay secret:

| Relation | Số dòng |
| --- | ---: |
| auth.users / auth.identities | 3 / 3 |
| auth.mfa_factors / auth.sessions | 1 / 10 |
| public.admin_profiles | 3 (2 active super_admin, 1 active staff trong kiểm tra trước) |
| private.admin_guard | 1 |
| public.audit_logs | 3 |
| public.categories | 1 |
| public.media_assets | 3 |
| public.products / product_images | 0 / 0 |
| public.inquiries / inquiry_items / inquiry_notes | 0 / 0 / 0 |
| public.consultant_profiles / email_outbox / slug_redirects | 0 / 0 / 0 |
| storage.buckets / storage.objects | 0 / 0 |

Customer profiles/cart/wishlist tables chưa tồn tại. **Database không trống**: có tài khoản, MFA, metadata media, taxonomy và dữ liệu quản trị cần đưa vào quyết định bảo tồn. Chưa xác minh toàn bộ nội dung/ý nghĩa nghiệp vụ hoặc tài sản Cloudinary thực tế từ các counts này. Không có sản phẩm/inquiry trong phạm vi inventory; chưa thể kết luận mọi dữ liệu đều bỏ được.

Owner yêu cầu đơn giản hóa: kiểm tra read-only, xem xét bỏ full backup/restore rehearsal nếu thực sự không cần bảo tồn; không yêu cầu PG credentials chỉ để backup nếu quyền hiện có đủ; kiểm thử disposable trước; xin approval riêng trước migration. **Chưa có quyết định/approval bỏ backup.** Backup inventory API từng 403; chưa tạo pg_dump, chưa restore-test backup. Không reset password/đổi gói/reset database để giải quyết. Không lặp lại yêu cầu PG credentials một cách máy móc.

Các migration đã được test trong disposable PGlite của suite; chưa có rehearsal nâng cấp riêng từ đúng baseline Production (5 migrations + dữ liệu tương đương hiện tại) rồi áp dụng 10 migrations và chứng minh bảo toàn dữ liệu. Đây là bước tiếp theo cần làm trước đề xuất waiver/migration cụ thể.

## Migration history và đúng 10 migrations còn thiếu

Production đã áp dụng 5 bản: `20261014080743`, `20261014080757`, `20261014133618`, `20261014134333`, `20261015085103`.

Chỉ dự kiến, **chưa được duyệt thực thi Production**:

1. `20261016103000_inquiry_transaction.sql`
2. `20261017163000_inquiry_change_events.sql`
3. `20261017180000_newsletter_data_policy.sql`
4. `20261017193000_staff_auth_policy.sql`
5. `20261017210000_staff_invite_lifecycle.sql`
6. `20261017223000_staff_role_status_safeguards.sql`
7. `20261017230000_customer_identity_policy.sql`
8. `20261017233000_staff_deletion_policy.sql`
9. `20261018000000_customer_cart_items.sql`
10. `20261018010000_customer_wishlist_items.sql`

Manifest tên/SHA256: receipt `pending-migrations.json`; phải đối chiếu file và history mới trước thực thi. `submit_customer_inquiry` chưa tồn tại trên Production. RLS hiện có bật; anon private reads bị chặn; list_public_consultants read-only hoạt động; malformed JWT 401. Những quan sát này không thay thế kiểm tra compatibility sau nâng cấp. Các migration có dependency schema event/outbox/newsletter sẵn có; không được kích hoạt Email provider/scheduler/retry vì thế.

## Cấu hình đã thay đổi theo approval

- Supabase Auth: agent PATCH bị 403, owner tự sửa Dashboard; đọc lại đã đúng `site_url=https://aven-furniture.vercel.app`, redirect URLs gồm Production `/auth/confirm` và localhost:3000 `/auth/confirm`. Không sửa SMTP/provider/signup, không gửi test email/login.
- Vercel: thêm `NEXT_PUBLIC_SITE_URL=https://aven-furniture.vercel.app`, **Production only**, POST 201 và đọc lại đúng. Chưa redeploy. Build Production hiện tại vẫn có sitemap canonical localhost; env mới có hiệu lực ở build tiếp theo.
- Source đã sửa canonical fallback Production và sitemap trả no-store 503 khi backend lỗi; catalog khỏe trả 404 cho sản phẩm không tồn tại. Đã test local, chưa lên Production.
- Project Vercel `prj_PyRDr0N6RUnKTeKWaum17vWfkmkY`, team `team_TNVd8B1HyqiU94SchwMOUvBO`; Production branch main, automatic domain assignment đang bật. Merge main có thể kích hoạt deploy, nên cần approval phối hợp đúng SHA trước hành động đó.
- Preview 1501f2c READY nhưng HTTP302 vào Vercel SSO; không được ghi là business smoke pass. Runtime logs/monitoring chưa xác minh đầy đủ do quyền công cụ.

## Những approval đã có / chưa có

Đã có và đã dùng: Resume hiện trạng (owner thực hiện), push 1501f2c + tạo Draft PR; push 4d78b2c + cập nhật PR; main protection + tắt auto-merge; đúng hai sửa Auth/Vercel canonical nêu trên. Không xin lại các approval này cho cùng hành động đã hoàn thành.

Chưa có: Production migrations cụ thể, waiver backup, push SHA mới khác 4d78b2c, merge main hoặc Production deploy/promote. Local code/tests/docs được phép tiếp tục. Owner đã dừng yêu cầu gọi Antigravity; điều này không tự tạo human GitHub review hoặc cho phép bypass protection.

Giữ nguyên bốn task: `email-delivery-policy`, `email-provider-adapter`, `outbox-scheduler`, `outbox-admin-retry`. Không triển khai Email, không import demo products, không reset/xóa Production.

## Trình tự tiếp tục phiên sau

1. Đọc tài liệu này, STATE, task artifacts và actual Git status/HEAD/remotes; phân biệt tài liệu local chưa commit với candidate đã push. Kiểm tra lock/process trước khi chạy coordinator; không xóa lock của process còn sống.
2. Read-only đối chiếu lại PR/head/main/protection/CI; lấy log job lỗi của push run 41215950054. PR run xanh chưa đủ để bỏ qua lỗi push chưa rõ nguyên nhân. Nếu cần sửa code, test/scan/local commit rồi xin push đúng SHA mới.
3. Tiếp tục yêu cầu mới nhất về DB: đánh giá dữ liệu hiện có, rehearsal baseline→10 migrations trên disposable với dữ liệu giả tương đương; kiểm tra Auth/RLS/RPC/cart/wishlist/app và bảo toàn dữ liệu. Không chạy writes trên Production để kiểm thử.
4. Báo owner bằng chứng dữ liệu cần giữ, đề xuất có thể bỏ full backup/restore test hay không, giới hạn recovery/rủi ro, exact migration manifest và cách thực thi/forward-fix. Chỉ xin approval migration sau khi phương án cụ thể review được; chưa có approval thì không chạy.
5. Giải quyết reviewer độc lập và Preview/smoke bằng quyền hiện có. Giữ Draft và giữ release tasks BLOCKED đến khi acceptance thực tế đạt. Không tạo review APPROVED giả, không tự bỏ protection.
6. Chuẩn bị approval riêng phối hợp migration/merge/deploy cho đúng SHA và thứ tự; Vercel auto-deploy main cần được tính vào approval merge. Xác minh Production sau khi được phép; không coi code rollback là database rollback.

## Điểm tìm evidence và credential

Runtime receipts local (ignored, không commit raw logs): `.ai-collab/.runtime/release-execution-20261031/`.

- `approved-ci-fix-push.json`, `pr-ci-fix-update.json`: push + PR 4d78b2c đã hoàn tất, không lặp lại.
- `github-policy-change-attempt4.json`: protection đã thành công. Các attempt 403/422 cũ chỉ là lịch sử.
- `github-policy-change-attempt2.json`: repo merge settings thành công dù protection ở lần đó còn lỗi.
- `ci-handoff-status.json`, `ci-handoff-jobs.json`: snapshot CI mới nhất.
- `full-data-inventory.json`, `active-schema.json`, `pending-migrations.json`: counts, schema/history, manifest.
- `auth-verified-after-owner.json`, `vercel-env-change.json`: kết quả cấu hình mới nhất.
- `approved-resume.json`: chỉ chứng minh agent request bị 403; owner mới là người Resume.

Credential nằm ngoài repo: `~/.config/avenfurniture/github-release-20261031.env` và `~/.config/avenfurniture/management.env`. Không in giá trị, không đưa token vào command arguments/logs/docs. PAT từng được owner gửi vào chat: cần rotate ngoài repo và cập nhật file bảo mật khi thuận tiện. Không tự đổi secret trong phiên bàn giao.

Tham khảo: [release operations](release-operations.md), [release policy](release-policy.md), [execution history](production-execution-2026-10-31.md). Release config vẫn disabled/manual, checkpoint IDLE; không chạy backlog Email hoặc tự clear BLOCKED khi resume.

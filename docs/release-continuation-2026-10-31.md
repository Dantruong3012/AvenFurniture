# Tiếp tục bàn giao — 31/10/2026

Status: LOCAL_VERIFIED; remote release vẫn BLOCKED. Owner yêu cầu tiếp tục sau thời điểm lưu [bàn giao](release-handoff-2026-10-31.md). Ngoại lệ local planning/review trong [release policy](release-policy.md) vẫn áp dụng; không gọi Antigravity CLI thật và không tạo approval độc lập.

## CI: kết quả điều tra

Read-only GitHub xác nhận PR #1 vẫn Draft, head `4d78b2cd5387a59bfa90db4eca62be61be8adaf3`, base/main `7454ca2eacb6185ca3611159d80c0aadf1cd9cd1`, chưa merge và chưa có review. Main protection đọc được, giữ nguyên; không thực hiện remote write.

- [PR run 41215954294](https://github.com/Dantruong3012/AvenFurniture/actions/runs/41215954294): 6/6 jobs success.
- [Push job 124580385873](https://github.com/Dantruong3012/AvenFurniture/actions/runs/41215950054/job/124580385873): test ứng dụng đã pass; test runner `false-commit is BLOCKED without completing a task` thất bại vì checkpoint còn `RUNNING`, expected `BLOCKED`. Đây không phải lỗi origin cũ. Log hiện có chưa chứa output của child bị lỗi nên chưa xác định được exception gốc. Chạy lại nguyên bộ integration gốc trên local pass 105/105, kể cả test đó.
- Khi điều tra, tái hiện độc lập được lỗi runner: child đóng stdin trước khi đọc hết prompt làm `write EPIPE` trở thành unhandled stream error, thoát coordinator trước khi lưu blocker. Đã thêm handler chuyển lỗi thành `STDIN_ERROR`, dừng process group và đi qua đường cleanup/checkpoint hiện có. Không sửa receipt, review, commit, quota hoặc release gates.
- Test mới chứng minh child lỗi không làm crash process cha, executor tiếp tục dùng được, và coordinator lưu `BLOCKED`, không review/commit, giải phóng lock. Các assertion của nhóm false-commit giữ nguyên và thêm child output để lần CI sau có bằng chứng chẩn đoán.

**Chưa khẳng định EPIPE là nguyên nhân lần push CI nói trên.** Fix local xử lý một lỗi đã tái hiện; cần push SHA mới theo approval riêng rồi kiểm tra CI thực tế. Không rerun, push, sửa PR hoặc bỏ check trong phiên này.

## Rehearsal database từ baseline Production

Fresh read-only Management SQL lúc `2026-10-31T15:57:11Z` đối chiếu `supabase/audit-schema.sql`: baseline 5 migrations local khớp chính xác Production ở 13 tables, 107 columns, 38 indexes, 75 constraints, 29 policies và 17 functions. Role audit là `supabase_read_only_user` có BYPASSRLS. Chỉ đọc metadata và counts; không lấy bản ghi tài khoản/MFA thật.

Inventory mới vẫn có 3 Auth users, 3 identities, 1 MFA factor, 10 sessions, 3 admin profiles (2 active super_admin), 1 category, 3 media assets, 3 audit logs; products/inquiries/outbox bằng 0. Các cột Auth phụ thuộc (`sessions.id/user_id/created_at/not_after`, `refresh_tokens.session_id`) có kiểu tương ứng với mô hình test.

[tests/migration-upgrade.test.mjs](../tests/migration-upgrade.test.mjs) thực hiện:

1. Khởi tạo PostgreSQL PGlite disposable với Auth/storage SQL stubs, áp dụng đúng 5 migrations baseline.
2. Tạo dữ liệu giả tương đương inventory, thêm marker giả cho password/MFA và refresh-token references. Không nhập dữ liệu Production.
3. Chụp toàn bộ hàng và cột gốc trong public/private/auth/storage; áp dụng từng migration còn thiếu bằng transaction riêng. Sau mỗi commit, so sánh chính xác mọi giá trị gốc, kể cả timestamps, roles, MFA/password markers, sessions, media references, audit và guard counter.
4. Xác minh legacy staff và super_admin vẫn dùng session hiện có; invite fields mới để null; catalog/consultant reads còn hoạt động; không tự tạo inquiry, email hay cron job khi migrate.
5. Kiểm tra RLS tất cả 17 tables, quyền gọi inquiry RPC service-only và idempotency, customer/cart/wishlist đúng chủ và đúng session; mô phỏng lỗi transaction để xác nhận DDL/data chưa commit được rollback.

Kết quả: **5/5 tests pass; cả 10 migration áp dụng thành công và bảo toàn toàn bộ dữ liệu baseline sau từng commit.** Manifest tên/SHA256 được lưu trong [production-migration-manifest-2026-10-31.json](production-migration-manifest-2026-10-31.json), khớp receipt bàn giao và file hiện tại. Không sửa SQL migration.

Giới hạn: đây là PostgreSQL disposable với mô hình SQL Auth, không phải restore backup Production, GoTrue/MFA đăng nhập thật, PostgreSQL extensions/ownership đầy đủ hay Cloudinary. Transaction thất bại được rollback không thể hoàn tác các migration trước đã commit. Không chứng minh chống được lỗi provider hoặc mất dữ liệu ngoài transaction.

## Quyết định backup và thứ tự còn lại

Database hiện có dữ liệu cần giữ, đặc biệt tài khoản/MFA và liên kết ảnh. **Không đề nghị coi database là trống để bỏ bảo tồn.** Rehearsal pass giảm rủi ro SQL, không tạo khả năng khôi phục dữ liệu thật. Backup inventory trước đây bị 403; chưa có full backup hoặc restore rehearsal. Không yêu cầu lại PG credentials chỉ để làm backup; trước hết owner cần chọn giữa cung cấp phương án backup có thể xác minh và chấp nhận waiver cụ thể cùng rủi ro mất những dữ liệu nêu trên. Chưa có waiver nào được áp dụng.

Trước approval migration cần đối chiếu lại đúng project `eofdtqnnqgxaoykcbfrv`, history và manifest; chốt executor/quyền ghi và cách lưu đúng migration versions. [Management Apply Migration API](https://supabase.com/docs/reference/api/v1-apply-a-migration) yêu cầu `database:write`/`database_migrations_write`, body có query/name nhưng không có trường version. Chưa có bằng chứng credential hiện tại có quyền này hoặc API sẽ giữ các version local; không tự đổi history để lách khác biệt. [Supabase CLI](https://supabase.com/docs/guides/deployment/database-migrations) đối chiếu local files với `supabase_migrations.schema_migrations`; không chạy `migration repair` hay `db reset` để bỏ qua lệch lịch sử.

Sau khi backup/waiver và executor được chốt, trình owner đúng 10 files/hash, một transaction mỗi file, timeout/lock budget và approval Production riêng. Dừng ngay khi lỗi; đọc lại history/schema/counts trước mọi retry, giữ migration đã commit, chuẩn bị forward-fix riêng. Không tự down-migrate/restore. Xác minh sau apply bằng metadata/RLS/grants và GET read-only; business writes/login/upload vẫn cần quyền riêng.

## Preview và Production

Vercel MCP list bị 403 do team scope; REST fallback với credential đã có đọc thành công cùng project/team. Preview `dpl_7JiR6HeAhaSH5QyQRVkMTMoXUafR` đúng SHA `4d78b2c` READY tại `aven-furniture-bhqdefxpt-dantruong.vercel.app`; GET `/`, `/products`, `/sitemap.xml` đều 302 vào SSO. Chưa có business smoke pass. Không đổi bảo vệ Preview.

Production alias vẫn `aven-furniture.vercel.app` → `dpl_9whkyD1hL2HYVsxuyR2zNXvjR1Ge`. Auth canonical/redirects đọc lại đúng Production và localhost callback. Không thay env, secret, Auth, database, deploy hoặc alias. Reviewer độc lập, Preview access/smoke và monitoring vẫn còn thiếu. Bốn task Email tiếp tục hoãn.

## Verification local

- `npm test` với đúng public env CI: 240/240 pass.
- Runner/autopilot suite: 167/167 pass; chỉ gọi fixture CLIs giả trong disposable directories.
- Lint: pass, 2 warnings cũ; Next typegen, TypeScript và production build: pass.
- Fixture E2E: 42/42 pass trên Chromium, Firefox và mobile Chromium; không skipped.
- Security scan: pass; dependency audit gate pass, 0 high/critical và 16 moderate còn tồn tại. Staged blobs được quét riêng trước local commit.

Raw receipts/logs local ignored: `.ai-collab/.runtime/release-continuation-20261031/`. Không commit raw logs, API bodies hay credentials. Checkpoint hiện hữu và release config giữ nguyên. Task release vẫn BLOCKED; local commit không đồng nghĩa DONE hoặc remote CI pass.

Local implementation commit: `fd618db8235cf0a3e3d096d37eea81b94c680aa0`. Metadata commit tiếp theo ghi hash này trong BACKLOG/STATE/IMPLEMENTATION; khi xin push phải dùng full HEAD sau metadata commit, không chỉ hash implementation. Pushed candidate vẫn `4d78b2c`. Working tree đã được kiểm tra và toàn bộ thay đổi thuộc lần tiếp tục này, gồm snapshot bàn giao local trước đó, đã được giữ lại trong commit.

# Chẩn đoán Production ngày 15/10/2026

## Kết quả đã xác minh

- Vercel MCP cung cấp 236 công cụ và `get_project` đọc được project `aven-furniture`, ID `prj_PyRDr0N6RUnKTeKWaum17vWfkmkY`, account/team `team_TNVd8B1HyqiU94SchwMOUvBO` (`dantruong`).
- Metadata project trả latest deployment `dpl_AkqLRVwP4Z1kau3g6ay5SC5NHEYK`, target `production`, trạng thái `READY`, tạo lúc 16:04:18 ngày 15/10/2026 (UTC+7).
- Các lệnh MCP đọc deployment chi tiết, danh sách deployments, runtime errors/logs và env metadata trả 403. Vercel CLI đọc env với đúng project/team cũng báo không có quyền vào account. Vì vậy chưa kiểm chứng được SHA đang chạy, lịch sử redeploy, alias đang trỏ đến deployment nào hoặc tên env Production thực tế. Không được diễn giải lỗi truy vấn logs thành “không có lỗi runtime”.
- HTTP GET đến `https://aven-furniture.vercel.app`: `/` và `/products` trả 200 nhưng HTML stream có RSC error; trang chủ thiếu hero. `/admin/login`, `/sitemap.xml`, `/products/aven-diagnostic-missing-product` trả 500.

## Nguyên nhân xác định được và phần còn thiếu

Thông báo người dùng cung cấp phát sinh ở `lib/supabase/config.ts`, trong `getSupabaseConfig()`, khi URL hoặc publishable key rỗng/không có. Đây là lỗi cấu hình trước khi gọi Supabase; thay đổi RLS, database hay Supabase Auth không giải quyết điều kiện này.

Trang chủ gọi `listPublishedProducts()` → `publicClient()` → `getSupabaseConfig()`. Proxy của admin và trang chi tiết sản phẩm cũng gọi cùng hàm. Các trang động không bắt buộc chạy lúc build, nên build có thể READY rồi mới lỗi khi nhận request. Trước bản sửa, `next.config.ts` không kiểm tra cấu hình Supabase khi build.

Chưa xác định được nguyên nhân vận hành cụ thể khiến lần cập nhật env/redeploy trước không có tác dụng vì quyền đọc bị chặn. Cần kiểm chứng các khả năng sau, không coi chúng là kết luận:

1. Sai tên biến, giá trị rỗng, sai project/team hoặc chỉ đặt ở Preview/Development.
2. Redeploy dùng source hoặc cấu hình build khác với checkout hiện tại; domain vẫn trỏ vào deployment cũ.
3. Dùng artifact prebuilt hoặc promote một build được tạo trước khi có đúng public env.

`NEXT_PUBLIC_*` được Next.js nhúng khi build; đổi giá trị runtime không thay thế giá trị đã nhúng. Code hiện dùng truy cập tĩnh `process.env.NEXT_PUBLIC_...` đúng quy ước. Không có bằng chứng lỗi do dynamic lookup. Không tự thêm fallback sang secret/service-role key.

## Tên Environment Variables trong source

| Tên | Nơi dùng | Production thực tế |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase config, cả server/browser/proxy | Chưa đọc được: 403 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase config, cả server/browser/proxy | Chưa đọc được: 403 |
| `SUPABASE_SECRET_KEY` | Client đặc quyền, server-only | Chưa đọc được: 403 |
| `NEXT_PUBLIC_SITE_URL` | Canonical/sitemap, auth redirect | Chưa đọc được: 403 |
| `CLOUDINARY_CLOUD_NAME` | Media và Next image remotePatterns | Chưa đọc được: 403 |
| `CLOUDINARY_API_KEY` | Media, server-only | Chưa đọc được: 403 |
| `CLOUDINARY_API_SECRET` | Media, server-only | Chưa đọc được: 403 |

`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL` và `SUPABASE_ANON_KEY` không thay thế các tên source đang đọc. Validator hiện chỉ chấp nhận đúng Supabase project đã cấu hình trong source và key có dạng `sb_publishable_`. `SUPABASE_ACCESS_TOKEN` chỉ dành cho script quản trị, không phải runtime app. Không đưa secret key vào biến public.

## Bản sửa local

- `lib/supabase/config.ts`: lỗi thiếu cấu hình ghi rõ tên biến cần bổ sung, không ghi giá trị.
- `next.config.ts`: gọi cùng validator trong `PHASE_PRODUCTION_BUILD`, chặn build trước khi đóng gói nếu thiếu/sai public config.
- `tests/supabase-config.test.mjs`: kiểm tra build từ chối cấu hình thiếu/sai, không dùng key đặc quyền làm fallback, không lộ giá trị và vẫn nhận cấu hình public hợp lệ.

Bản sửa giúp chặn tái diễn deployment sai cấu hình; nó không tự bổ sung env trên Vercel và chưa sửa website đang chạy.

Đã pass: 16 tests config/auth-session/storefront, lint, typecheck, production build với `.env.local`. Build thử với hai public env rỗng thất bại đúng mong đợi. Bản build local chạy HTTP GET chỉ đọc: `/`, `/products`, `/admin/login`, `/sitemap.xml` trả 200 không có RSC error; trang sản phẩm không tồn tại trả 404. Catalog không có link sản phẩm trong lần kiểm tra nên chưa xác minh trang sản phẩm có thật hoặc ảnh Cloudinary. Chưa kiểm tra login có credentials, upload hay mutation.

## Trước khi phát hành

1. Cấp quyền đọc đúng team cho MCP/CLI; lấy env metadata (tên/target/thời điểm cập nhật), runtime logs và deployment SHA/alias. Không pull/decrypt secrets để chẩn đoán tên biến.
2. Đối chiếu đủ bảy biến trên đúng project và target Production. Hai public Supabase env phải có lúc build; kiểm tra `NEXT_PUBLIC_SITE_URL` dùng domain Production. Chủ project xác minh giá trị qua giao diện bảo mật, không gửi vào chat.
3. Đối chiếu source revision và Build Command/Root Directory. Bản sửa local phải nằm trong source được deploy. Kiểm tra Node version tương thích `package.json` (22.x); metadata project hiện báo 24.x, nhưng chưa đọc được runtime version của deployment.
4. Tạo build mới từ source với env Production, kiểm tra URL riêng rồi mới chuyển domain.

## Vercel CLI đề xuất — chưa thực thi deploy

MCP có công cụ deploy; trở ngại quan sát được là quyền truy cập, không phải thiếu công cụ. CLI cũng cần credentials có quyền đúng team. Nếu dùng CLI đã cài, thay `npx vercel` bằng `vercel`.

```sh
# Chỉ liệt kê metadata, không dùng --json hay env pull để đọc giá trị.
npx vercel env list production \
  --project prj_PyRDr0N6RUnKTeKWaum17vWfkmkY \
  --scope team_TNVd8B1HyqiU94SchwMOUvBO

# Chạy từ root repository sau khi source/env đã được kiểm chứng.
# Build từ source bằng env Production, không chuyển domain ngay.
npx vercel deploy --prod --skip-domain --force \
  --project prj_PyRDr0N6RUnKTeKWaum17vWfkmkY \
  --scope team_TNVd8B1HyqiU94SchwMOUvBO
```

Kiểm tra URL deployment trả về qua quyền truy cập Vercel hiện có: trang chủ/catalog có nội dung, không có RSC error; login render được; sitemap hợp lệ; sản phẩm published có thật trả 200 và ảnh hiển thị; slug không tồn tại trả 404. Đọc runtime logs sau các request. Không tắt Deployment Protection để test.

Sau khi đạt các kiểm tra trên, dùng `npx vercel promote <deployment-url-đã-kiểm-tra> --scope team_TNVd8B1HyqiU94SchwMOUvBO`, rồi lặp lại kiểm tra trên domain Production. Không coi READY hoặc HTTP 200 đơn lẻ là đạt nghiệm thu.

Tham khảo: [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables), [Vercel deploy](https://vercel.com/docs/cli/deploy), [Vercel promote](https://vercel.com/docs/cli/promote).

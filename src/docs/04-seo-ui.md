# SEO, giao diện và hiệu năng

## SEO kỹ thuật

- Nội dung sản phẩm/danh mục có trong HTML server; metadata cùng nguồn dữ liệu với nội dung.
- Title, description, canonical riêng cho trang có thể index; Open Graph dùng ảnh phù hợp.
- Sitemap tự động chỉ chứa URL canonical đã xuất bản; robots được cấu hình theo môi trường.
- Admin/auth/trang riêng tư và search nội bộ có chính sách noindex phù hợp. Không dùng robots/noindex làm cơ chế bảo mật; không robots-block URL cần crawler đọc noindex một cách máy móc.
- Draft không nằm trong sitemap, API public hoặc trang chi tiết công khai.
- URL không tồn tại trả HTTP 404 thật; đổi slug có 301, không tạo redirect chain/vòng lặp.
- URL danh mục/bộ sưu tập riêng. Chốt canonical/noindex cho filter/sort để tránh vô hạn trang trùng; phân trang vẫn phải crawl được sản phẩm cần index.
- Internal link từ trang chủ → danh mục/bộ sưu tập → sản phẩm; breadcrumb rõ ràng.
- Schema Organization, BreadcrumbList, Product; LocalBusiness nếu thông tin showroom có thật.
- Chỉ khai báo giá/tồn kho/review thực tế và hiện trên trang. Không tạo giá hoặc đánh giá giả để đủ điều kiện rich result.
- Xác minh Search Console, gửi sitemap và theo dõi lỗi index sau launch.

## Nội dung

- Chốt ngôn ngữ và thị trường; hiện `lang="en"`. Nếu làm tiếng Việt phải đồng bộ UI, metadata và nội dung.
- Nếu song ngữ, có cấu trúc URL và hreflang đúng; tránh xuất bản bản dịch thiếu hoặc trùng hàng loạt.
- Mô tả sản phẩm riêng: chất liệu, kích thước, hoàn thiện, bối cảnh sử dụng và bảo quản.
- Xác minh địa chỉ, giờ mở cửa, điện thoại, tên miền và các tuyên bố chứng nhận trong dữ liệu mẫu.
- Có chính sách riêng tư/liên hệ và thông tin giao nhận phù hợp mô hình nhận báo giá.
- Chỉ bổ sung blog SEO khi có nội dung hữu ích và khả năng duy trì.

## Định hướng thiết kế

Giữ phong cách nội thất cao cấp: nền kem, màu gỗ, ảnh lớn, typography thanh lịch. Chuẩn hóa design tokens cho màu, khoảng cách, typography, border và trạng thái.

- Storefront ưu tiên sản phẩm, chất liệu, thông số và CTA yêu cầu báo giá.
- Mobile: menu/drawer bộ lọc dễ dùng, CTA dễ chạm, gallery và form không tràn ngang.
- Admin có navigation mobile thực sự; không chỉ ẩn sidebar.
- Bảng dữ liệu có cách đọc trên màn hình nhỏ: card hoặc cuộn trong vùng phù hợp, giữ thao tác chính dễ tìm.
- Font hỗ trợ tiếng Việt; ảnh dùng tỷ lệ nhất quán và crop phù hợp từng thiết bị.
- Đầy đủ loading, empty, error, success, disabled và pending.
- Modal có focus trap/restore focus, Escape, tên accessible; form có label và lỗi gắn với trường.
- Hỗ trợ bàn phím, focus rõ, độ tương phản và reduced motion. Mục tiêu WCAG 2.2 AA cho luồng chính.

Kiểm tra 360, 390, 768, 1024, 1440px và màn hình lớn hơn; zoom 200%, bàn phím và thiết bị cảm ứng. Không che lỗi layout bằng overflow-x hidden toàn trang.

## Hiệu năng

- Dùng ảnh responsive, kích thước phù hợp, WebP/AVIF khi phù hợp và CDN Cloudinary.
- Chốt một chiến lược tối ưu ảnh để tránh biến đổi/lưu cache dư thừa giữa Cloudinary và Next.js.
- Lưu width/height hoặc aspect ratio để giảm CLS; chỉ ưu tiên ảnh đầu trang quan trọng, lazy-load phần dưới.
- Giảm client bundle, tránh tải toàn bộ sản phẩm vào context, phân trang và index truy vấn.
- Tối ưu font, hạn chế script bên thứ ba và animation nặng.
- Theo dõi chi phí biến đổi ảnh, băng thông và truy vấn theo lưu lượng thật.

Mục tiêu dữ liệu thực tế tại phân vị 75: LCP ≤ 2,5s, INP ≤ 200ms, CLS ≤ 0,1. Trước launch kiểm tra lab/mobile, sau launch đo field data khi đủ mẫu. Điểm Lighthouse đơn lẻ không chứng minh trải nghiệm thực tế hoặc thứ hạng SEO.

## Tham chiếu

- [Next.js metadata](https://nextjs.org/learn/dashboard-app/adding-metadata)
- [Google Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet?hl=en)

SEO kỹ thuật tạo điều kiện crawl/index tốt; không cam kết vị trí tìm kiếm.

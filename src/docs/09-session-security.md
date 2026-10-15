# Chính sách phiên quản trị

Trạng thái mới nhất và bằng chứng: [Phase 0 acceptance](11-phase0-acceptance.md).

JWT Supabase 900 giây đã áp dụng và kiểm thử. Refresh rotation bật, reuse 10 giây; nhiều phiên/thiết bị được giữ. Không tự tạo/ký JWT hoặc lưu token trong bảng nghiệp vụ.

Project Free: dùng RLS/server giới hạn quyền quản trị 604800 giây từ auth.sessions.created_at. session_id trong JWT phải khớp user_id/auth.uid, phiên còn tồn tại, not_after chưa tới, profile active và chưa bị cutoff do khóa. Refresh không đổi deadline. Public catalog vẫn truy cập được. Đây không phải native timebox: Supabase có thể cấp refresh nhưng quyền quản trị bị từ chối khi quá 7 ngày.

Logout xóa phiên hiện tại, RLS từ chối JWT cũ. Đổi/reset mật khẩu yêu cầu global sign-out. Khóa profile lưu cutoff để mở khóa không phục hồi phiên cũ; workflow thu hồi refresh token mọi thiết bị khi khóa còn thuộc quản lý tài khoản tương lai.

Reuse test phải tính cả khoảng grace sau thu hồi token legacy. Thử immediate từng trả 200; ngoài grace, token bị từ chối 400. Parent token exception và concurrent refresh được kiểm thử riêng. Không tự thay thuật toán Supabase.

Server actions/DAL xác minh phiên độc lập với proxy. Lỗi mạng/rate limit trả lỗi tạm thời, không xóa phiên vô cớ. Cookie Secure trong production, SameSite=Lax, tương thích SSR/browser; không bật HttpOnly mù quáng. Headers phiên production private/no-store/no-referrer.

MFA optional TOTP; khi đã enroll, đổi password và thêm/gỡ factor yêu cầu AAL2 phía server. Chưa bật bắt buộc toàn hệ thống trước khi nghiệm thu QR/recovery vận hành. User metadata không có quyền cấp role hay AAL2.

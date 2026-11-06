# Bắt đầu nhanh – tạo bộ cài Truyện Audio trên Windows

## Cách khuyến nghị: GitHub Desktop (không cần biên dịch trên máy 4 GB RAM)

### 1. Chuẩn bị
- Tạo hoặc đăng nhập tài khoản GitHub.
- Cài GitHub Desktop từ https://desktop.github.com/.
- Giải nén thư mục `TruyenAudioDesktop` từ ZIP.

### 2. Tạo repository
1. Mở GitHub Desktop → **File → Add Local Repository**.
2. Chọn thư mục `TruyenAudioDesktop` vừa giải nén. Nếu GitHub Desktop báo chưa phải repository, chọn **create a repository**.
3. Đặt tên repository, ví dụ `truyen-audio-desktop`.
4. Chọn **Initialize this repository with a README** nếu được hỏi thì bỏ chọn (dự án đã có README).
5. Chọn **Create Repository**.
6. Chọn **Publish repository**. Có thể bật **Keep this code private** để giữ mã nguồn riêng.

### 3. Chạy build trên máy chủ Windows của GitHub
1. Mở repository trên GitHub bằng nút **View on GitHub**.
2. Chọn tab **Actions**. Nếu GitHub hỏi xác nhận sử dụng Actions, chọn cho phép workflow.
3. Chọn workflow **Build Truyen Audio for Windows** ở cột bên trái.
4. Chọn **Run workflow** → **Run workflow**.
5. Mở lần chạy mới nhất và đợi các bước hoàn tất với dấu tích xanh.

### 4. Tải bộ cài
1. Trong trang kết quả chạy workflow, kéo xuống phần **Artifacts**.
2. Tải `Truyen-Audio-Windows-Installer`.
3. Giải nén tệp ZIP vừa tải để lấy `Truyen-Audio-Setup-1.1.0.exe`.
4. Chạy file `.exe` trên Windows và làm theo trình cài đặt.

## Nếu workflow lỗi
Mở lần chạy bị lỗi → chọn bước có dấu X đỏ → sao chép log lỗi gửi lại để kiểm tra. Không gửi token, mật khẩu hoặc khóa bí mật GitHub.

## Kiểm tra trước khi sử dụng
- Đây là ứng dụng Electron; lần đầu cài đặt và build cần Internet.
- Chế độ Windows dùng Speech Synthesis có trên máy và có thể hoạt động offline.
- Google truyền thống và Google AI cần cấu hình Google Cloud, đăng nhập tài khoản và Internet; nội dung truyện được gửi lên Google để tạo âm thanh.
- Google Cloud yêu cầu bật billing; hạn mức miễn phí và giá được Google công bố thay đổi theo thời điểm. Chủ tài khoản/người giám hộ nên quản lý phần thanh toán.
- Chưa hỗ trợ PDF/EPUB; nhập URL có thể không hoạt động với website yêu cầu đăng nhập hoặc chống bot.
- Bản mã nguồn đã qua kiểm tra cú pháp JavaScript; phần Google Cloud cần tài khoản/project riêng để kiểm tra kết nối thực tế. Cần chạy thử bộ cài trên Windows trước khi coi là bản phát hành ổn định.


### Đồng bộ Android qua Wi-Fi (Desktop 1.3)
- Hai thiết bị phải dùng cùng mạng Wi-Fi.
- Trên Desktop: Cài đặt → Đồng bộ với Android qua Wi-Fi → Bật máy chủ Wi-Fi.
- Dùng địa chỉ IP và mã PIN đang hiển thị để ghép nối trên Android.
- Tắt máy chủ sau khi hoàn tất đồng bộ.

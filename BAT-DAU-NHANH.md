# Bắt đầu nhanh – Truyện Audio Desktop 1.4.5

## Build bằng GitHub Actions

1. Giải nén `TruyenAudioDesktop`.
2. Đưa toàn bộ nội dung thư mục vào repository GitHub (nên để Private nếu muốn giữ mã nguồn riêng).
3. Giữ nguyên thư mục `.github/workflows` và file `package.json` ở thư mục gốc.
4. Mở **Actions** → **Build Truyen Audio for Windows** → **Run workflow**.
5. Khi hoàn tất, tải artifact `Truyen-Audio-Windows-Installer`, giải nén và chạy `Truyen-Audio-Setup-1.4.5.exe`.

## Tính năng trong bản 1.4.5

- Lấy nội dung URL theo hai cụm điều hướng “Chương trước – Mục lục – Chương sau”: chỉ lấy phần ở giữa hai cụm, không lấy nội dung bên trên, bên dưới hoặc bên cạnh. Nếu không tìm đủ hai cụm thì báo lỗi, không quét cả trang.
- Tốc độ đọc tối đa 2.5×.
- Sửa toàn bộ truyện, sửa từng đoạn, tìm/thay toàn truyện hoặc chương đang chọn, hoàn tác.
- Từ điển thay thế tự áp dụng cho truyện mới được thêm.
- Xuất ZIP sao lưu và TXT: mỗi truyện một file hoặc gộp thư viện; TXT lấy văn bản đã chỉnh sửa, UTF-8, không gồm audio.
- Luồng nghe: thư viện → danh sách chương → xem nội dung chương → nhấn Phát. Có tua 10/30 giây, hẹn giờ, lưu tiến độ, tự chuyển chương và hàng đợi.
- Trong luồng chọn TXT có sẵn, chọn Tạo truyện mới hoặc Bổ sung chương vào truyện đã có; xem trước chương mới/trùng, mặc định bỏ qua chương trùng, có tùy chọn thay thế chương cùng tên.

## Giới hạn và lưu ý

- Website cần công khai và trả về HTML. Một số trang chống bot hoặc dựng nội dung bằng JavaScript có thể không hỗ trợ.
- PC chỉ xuất ZIP/TXT; không có nhập ZIP, đồng bộ Wi-Fi hay đồng bộ Cloud trong bản này.
- Google TTS cần cấu hình Google Cloud riêng; Windows TTS có thể hoạt động offline.
- Nguồn đã qua kiểm tra cú pháp JavaScript, nhưng phải build trên GitHub Actions và thử trên Windows thực tế trước khi sử dụng lâu dài.

Nếu Actions báo lỗi, mở bước bị lỗi và gửi log màu đỏ (không gửi token hay thông tin bí mật).

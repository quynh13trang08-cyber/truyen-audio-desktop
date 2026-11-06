# Truyện Audio Desktop

Ứng dụng Windows nghe truyện văn bản, thiết kế theo bản Truyện Audio trên trình duyệt đã trao đổi. Sau khi cài đặt, thư viện và trình phát hoạt động không cần Internet. Chỉ chức năng lấy nội dung từ website cần mạng.

## Chức năng trong bản 1.0

- Nhập truyện từ tệp TXT, MD hoặc TEXT; dán văn bản; hoặc thử lấy văn bản từ URL website công khai.
- Đọc bằng Speech Synthesis tích hợp trong Chromium/Electron, sử dụng các giọng hệ thống mà Windows cung cấp.
- Chọn giọng đọc, điều chỉnh tốc độ 0.6×–1.8×, phát, tạm dừng, tiếp tục.
- Tua trước/lùi khoảng 10 giây bằng ước lượng ký tự/giây. Web Speech/Speech Synthesis không cung cấp timeline âm thanh chính xác, nên thao tác này là gần đúng chứ không phải tua âm thanh tuyệt đối.
- Tự nhận diện các tiêu đề theo mẫu “Chương”, “Chapter”, “Hồi”, “Phần”, “Quyển”, “Tập” để nhảy chương nếu văn bản có tiêu đề riêng dòng.
- Lưu thư viện, cài đặt và vị trí nghe trong thư mục dữ liệu người dùng Windows; dữ liệu còn sau khi đóng ứng dụng.
- Giao diện tối/sáng và chế độ nghe tập trung.

## Giới hạn cần biết

- Đây là bộ đọc giọng nói có sẵn của Windows/Chromium, không phải dịch vụ giọng AI đám mây. Chất lượng và việc có tiếng Việt hay không phụ thuộc gói giọng Windows được cài trên máy.
- Nếu danh sách giọng không có tiếng Việt, vào **Cài đặt Windows → Thời gian & ngôn ngữ → Ngôn ngữ & khu vực → Tùy chọn ngôn ngữ** và cài thành phần giọng nói tiếng Việt nếu Windows cung cấp cho phiên bản của bạn. Khởi động lại ứng dụng sau khi cài.
- Nhập URL chỉ hoạt động với trang công khai trả về HTML/văn bản. Website yêu cầu đăng nhập, chống bot hoặc dựng nội dung hoàn toàn bằng JavaScript có thể không lấy được.
- Chỉ nhập TXT/MD/TEXT ở bản này. PDF/EPUB chưa được tích hợp trong bản Desktop này.
- Không có OCR cho tài liệu scan/ảnh.

## Tạo file cài đặt Windows bằng GitHub Actions (không cần biên dịch trên PC 4 GB RAM)

1. Tạo một repository GitHub mới, để ở chế độ **Private** nếu muốn giữ mã nguồn riêng.
2. Giải nén ZIP dự án này trên máy.
3. Đưa toàn bộ nội dung thư mục vào repository, bao gồm cả thư mục ẩn `.github/workflows` và tệp `package.json` ở thư mục gốc. Có thể dùng GitHub Desktop hoặc Git để tải mã nguồn lên repository.
4. Mở thẻ **Actions** của repository. Workflow **Build Truyen Audio for Windows** sẽ tự chạy khi có commit lên nhánh `main`/`master`; cũng có thể chọn **Run workflow** để chạy thủ công.
5. Chờ workflow chạy xong với trạng thái dấu tích xanh. Mở lần chạy đó, kéo xuống **Artifacts**, tải `Truyen-Audio-Windows-Installer.zip` và giải nén.
6. Chạy file `Truyen-Audio-Setup-1.0.0.exe` trên Windows để cài. Sau khi cài, ứng dụng nghe truyện offline; không cần GitHub hay Internet khi sử dụng hàng ngày.

Nếu workflow báo lỗi, mở lần chạy → bước bị lỗi → sao chép phần log màu đỏ để kiểm tra. File `.exe` chưa nằm sẵn trong ZIP mã nguồn; nó được tạo ở bước build trên GitHub Actions.

GitHub Actions sẽ tải các gói Electron cần thiết khi biên dịch. Không cần cài Android Studio. Không nên cố biên dịch Electron trên máy chỉ có 4 GB RAM.

## Chạy thử khi có Node.js

Yêu cầu Node.js 22 trở lên và kết nối Internet trong lần cài thư viện đầu tiên:

```bash
npm install
npm start
```

Tạo bộ cài Windows trên máy Windows:

```bash
npm run dist:win
```

File cài đặt được tạo trong thư mục `dist/`.

## Dữ liệu được lưu ở đâu?

Ứng dụng ghi `library.json` trong thư mục dữ liệu riêng của Truyện Audio dưới hồ sơ người dùng Windows (Electron `app.getPath('userData')`). Sao lưu thư mục này để giữ thư viện khi cài lại Windows.

## Trạng thái kiểm tra của gói mã nguồn

- Đã kiểm tra cú pháp JavaScript bằng `node --check` cho `main.js`, `preload.js` và `renderer.js`.
- Đã rà soát cấu hình đóng gói Windows và workflow GitHub Actions.
- Chưa thể xác nhận chạy thực tế hoặc tạo bộ cài `.exe` trong môi trường hiện tại vì bước tải thư viện npm bị hết thời gian chờ. Cần chạy workflow trên GitHub để tạo và kiểm thử bộ cài trên Windows.

## Ghi chú kỹ thuật

- Electron + HTML/CSS/JavaScript thuần.
- Tách tiến trình giao diện và tiến trình chính bằng preload, `contextIsolation` bật, `nodeIntegration` tắt.
- Phiên bản Electron được ghim ở 45.2.3; electron-builder 26.18.0.

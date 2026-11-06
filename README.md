# Truyện Audio Desktop

Ứng dụng Windows nghe truyện văn bản, thiết kế theo bản Truyện Audio trên trình duyệt đã trao đổi. Thư viện và chế độ đọc Windows hoạt động cục bộ. Chế độ Google TTS và chức năng lấy nội dung từ website cần Internet.

## Chức năng trong bản 1.3

- Nhập truyện từ tệp TXT, MD hoặc TEXT; dán văn bản; hoặc thử lấy văn bản từ URL website công khai.
- Đọc bằng Speech Synthesis tích hợp trong Chromium/Electron, sử dụng các giọng hệ thống mà Windows cung cấp.
- Chọn giọng đọc, điều chỉnh tốc độ 0.6×–1.8×, phát, tạm dừng, tiếp tục.
- Tua trước/lùi khoảng 10 giây bằng ước lượng ký tự/giây. Web Speech/Speech Synthesis không cung cấp timeline âm thanh chính xác, nên thao tác này là gần đúng chứ không phải tua âm thanh tuyệt đối.
- Tự nhận diện các tiêu đề theo mẫu “Chương”, “Chapter”, “Hồi”, “Phần”, “Quyển”, “Tập” để nhảy chương nếu văn bản có tiêu đề riêng dòng.
- Lưu thư viện, cài đặt và vị trí nghe trong thư mục dữ liệu người dùng Windows; dữ liệu còn sau khi đóng ứng dụng.
- Giao diện tối/sáng và chế độ nghe tập trung.
- Tự động chuyển sang chương tiếp theo sau khi hết chương, nghỉ 2 giây; có thể bật/tắt trong Cài đặt.

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
6. Chạy file `Truyen-Audio-Setup-1.3.0.exe` trên Windows để cài. Chế độ Windows có thể nghe offline; hai chế độ Google cần Internet.

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

Ứng dụng ghi `library.json`, thông tin xác thực Google đã mã hóa và bộ nhớ đệm âm thanh trong thư mục dữ liệu riêng của Truyện Audio dưới hồ sơ người dùng Windows (Electron `app.getPath('userData')`). Sao lưu thư mục này để giữ thư viện khi cài lại Windows.

## Trạng thái kiểm tra của gói mã nguồn

- Đã kiểm tra cú pháp JavaScript bằng `node --check` cho `main.js`, `preload.js` và `renderer.js`.
- Đã kiểm thử API đồng bộ cục bộ: ghép nối PIN, xác thực token, lấy danh sách truyện, tải nội dung và ngắt máy chủ.
- Đã rà soát cấu hình đóng gói Windows và workflow GitHub Actions.
- Chưa thể xác nhận chạy thực tế hoặc tạo bộ cài `.exe` trong môi trường hiện tại vì bước tải thư viện npm bị hết thời gian chờ. Cần chạy workflow trên GitHub để tạo và kiểm thử bộ cài trên Windows.

## Ghi chú kỹ thuật

- Electron + HTML/CSS/JavaScript thuần.
- Tách tiến trình giao diện và tiến trình chính bằng preload, `contextIsolation` bật, `nodeIntegration` tắt.
- Phiên bản Electron được ghim ở 45.2.3; electron-builder 26.18.0.

## Google Text-to-Speech (giữ nguyên từ bản 1.2)

Ứng dụng có ba chế độ đọc:
- **Windows**: dùng giọng đã cài trên Windows, chạy ngoại tuyến.
- **Google truyền thống**: Google Cloud Standard (tiếng Việt A/B/C/D).
- **Google AI**: Google Cloud Chirp 3 HD (nhiều giọng nam/nữ tiếng Việt).

### Kết nối Google Cloud

1. Tạo hoặc chọn một Google Cloud project.
2. Bật **Cloud Text-to-Speech API** và bảo đảm project có cấu hình thanh toán. Google có hạn mức miễn phí theo tháng, nhưng vẫn yêu cầu bật billing; phần vượt hạn mức sẽ bị tính phí.
3. Tạo OAuth Client ID loại **Desktop app** trong phần Credentials của Google Cloud. Cấu hình màn hình đồng ý OAuth theo yêu cầu của Google. Nếu ứng dụng OAuth đang ở trạng thái thử nghiệm, tài khoản đăng nhập cần được thêm vào danh sách test users của project.
4. Ghi lại **OAuth Client ID** và **Project ID**.
5. Trong Truyện Audio → Cài đặt → Giọng đọc, nhập hai giá trị trên, nhấn **Kết nối tài khoản Google**, sau đó đăng nhập và cấp quyền trong trình duyệt.
6. Chọn **Google truyền thống** hoặc **Google AI** ở bộ chọn giọng trong màn hình Đang nghe. Có thể đổi lại Windows bất cứ lúc nào.

Thông tin xác thực được mã hóa bằng Windows DPAPI thông qua Electron `safeStorage`, không lưu access token dạng văn bản thuần. Ứng dụng tự làm mới access token bằng refresh token. Âm thanh Google đã tạo được lưu bộ nhớ đệm cục bộ để hạn chế gọi lại và phát sinh chi phí khi nghe lại cùng đoạn. Khi chọn Google, văn bản truyện được gửi từng đoạn đến Google Cloud để tổng hợp giọng; cần Internet. Khi chọn Windows, văn bản được xử lý bằng giọng cục bộ.

Google Cloud yêu cầu billing được bật. Hạn mức miễn phí và giá có thể thay đổi; kiểm tra trang giá chính thức trước khi sử dụng dài ngày: https://cloud.google.com/text-to-speech/pricing. Việc thiết lập tài khoản thanh toán nên được chủ tài khoản hoặc người giám hộ quản lý.

Tài liệu chính thức:
- https://docs.cloud.google.com/text-to-speech/docs/get-started
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- https://docs.cloud.google.com/text-to-speech/docs/authentication


## Đồng bộ Wi-Fi với Android (v1.3)

1. Cài và mở Truyện Audio Desktop trên Windows.
2. Mở **Cài đặt → Đồng bộ với Android qua Wi-Fi** và chọn **Bật máy chủ Wi-Fi**.
3. Kết nối điện thoại và máy tính vào cùng một mạng Wi-Fi.
4. Trên Android, nhập một địa chỉ IP hiển thị trên Desktop, cổng `38741` và mã PIN 6 chữ số.
5. Sau khi ghép nối, Android có thể xem danh sách và tải từng truyện về thiết bị. (Ứng dụng Android cần bản có hỗ trợ đồng bộ tương ứng.)

Máy chủ chỉ lắng nghe trong mạng nội bộ, yêu cầu mã PIN để ghép nối, cấp token phiên ngẫu nhiên và giới hạn thử PIN. Máy chủ tự tắt khi ứng dụng Desktop thoát. Không chia sẻ mã PIN cho người lạ; chỉ bật máy chủ khi cần đồng bộ. Tính năng này không chia sẻ thông tin đăng nhập Google TTS.

Nếu Windows Firewall hỏi quyền mạng, chỉ cho phép trên mạng riêng (Private network), không bật cho mạng công cộng. Nếu không thấy IP, kiểm tra máy tính đã kết nối Wi-Fi/LAN.

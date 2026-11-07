# Truyện Audio Desktop 1.4.3

Ứng dụng Electron nghe truyện văn bản trên Windows. Thư viện lưu cục bộ trên máy; không yêu cầu máy chủ riêng, đồng bộ Wi-Fi hay dịch vụ Cloud để dùng các chức năng cơ bản.

## Chức năng trong bản 1.4.3

- Nhập truyện từ TXT/MD/TEXT, dán văn bản hoặc nhập từ URL website công khai. Trong luồng chọn TXT hiện có, có thể chọn **Tạo truyện mới** hoặc **Bổ sung chương vào truyện có sẵn**.
- Khi bổ sung chương: chọn truyện đích, xem trước số chương mới/trùng/thay thế; mặc định giữ chương cũ và bỏ qua chương trùng. Có thể chọn thay chương cũ nếu cùng tên nhưng nội dung khác. Các chương có tiêu đề đánh số được tự sắp xếp theo số chương; nếu file không có tiêu đề chương nhận diện được, app nối nguyên khối và cảnh báo rằng không thể kiểm tra trùng.
- Khi nhập URL, ứng dụng tìm hai cụm điều hướng lặp lại theo thứ tự **Chương trước → Mục lục → Chương sau**. Chỉ lấy phần DOM nằm sau cụm đầu tiên và trước cụm thứ hai; các nội dung nằm ngoài hai mốc không được lấy. Nếu không tìm đủ hai cụm hoặc phần ở giữa quá ngắn, ứng dụng báo lỗi, tuyệt đối không chuyển sang lấy toàn trang.
- Đọc bằng giọng Windows có sẵn hoặc Google Cloud TTS (Google Standard / Chirp 3 HD).
- Tốc độ đọc 0.6×–2.5×; lưu mức tốc độ đã chọn.
- Nhảy chương, tua tương đối, lưu tiến độ và tự chuyển chương sau 2 giây.
- Chỉnh sửa toàn bộ truyện hoặc riêng từng đoạn văn.
- Tìm và thay thế không phân biệt hoa/thường trên toàn bộ truyện hoặc chương đang chọn; có xem trước số vị trí bị ảnh hưởng.
- Từ điển thay thế hỗ trợ thêm/sửa/xóa nhiều quy tắc; tự áp dụng cho truyện mới và có thể xem trước số vị trí rồi áp dụng tất cả quy tắc cho truyện đang mở.
- Lưu lịch sử chỉnh sửa tối đa 30 bước cho mỗi truyện và hỗ trợ hoàn tác.
- Xuất bản sao lưu ZIP cục bộ, gồm `backup.json` chứa thư viện, nội dung, lịch sử sửa, cài đặt và quy tắc thay thế. ZIP không chứa file audio/cache.
- Xuất TXT mã hóa UTF-8: mỗi truyện một file (mặc định) hoặc gộp toàn bộ thư viện; nội dung lấy từ bản đã chỉnh sửa và giữ nguyên các tiêu đề chương có trong văn bản.
- Giao diện tối/sáng và chế độ nghe tập trung.

## Lưu ý khi nhập website

- Trang cần công khai và trả về HTML có thể đọc. Trang yêu cầu đăng nhập, chống bot hoặc dựng nội dung hoàn toàn bằng JavaScript có thể không lấy được.
- Trang phải có hai cụm liên kết nhận diện được theo thứ tự **Chương trước – Mục lục – Chương sau**: một cụm ở trước nội dung chương và một cụm ở sau nội dung chương.
- App chỉ trích xuất phần nằm giữa hai cụm đó. Nếu tên liên kết của website khác cách gọi trên hoặc website không có đủ hai cụm, app sẽ báo không nhận diện được; không lấy toàn trang làm phương án dự phòng.
- Vẫn cần thử trên các website bạn thường đọc để điều chỉnh cách nhận diện tên liên kết nếu website dùng nhãn khác.

## Tạo file cài đặt Windows bằng GitHub Actions

1. Giải nén thư mục `TruyenAudioDesktop` và đưa toàn bộ nội dung vào repository GitHub riêng (có thể để Private).
2. Giữ thư mục ẩn `.github/workflows` và file `package.json` ở thư mục gốc.
3. Mở tab **Actions** → workflow **Build Truyen Audio for Windows** → **Run workflow**, hoặc đẩy commit lên `main`/`master` để workflow tự chạy.
4. Khi build thành công, tải artifact `Truyen-Audio-Windows-Installer`, giải nén và chạy `Truyen-Audio-Setup-1.4.3.exe`.
5. Workflow cài các dependency trong `package.json`, kiểm tra cú pháp JavaScript rồi đóng gói NSIS.

## Chạy thử khi có Node.js

Yêu cầu Node.js 22 trở lên và kết nối Internet trong lần cài thư viện:

```bash
npm install
npm start
```

Tạo bộ cài Windows trên Windows:

```bash
npm run dist:win
```

## Dữ liệu và sao lưu

Ứng dụng lưu `library.json`, thông tin xác thực Google đã mã hóa và bộ nhớ đệm âm thanh trong thư mục dữ liệu riêng của Truyện Audio dưới hồ sơ người dùng Windows (`app.getPath('userData')`). Dùng **Cài đặt → Xuất dữ liệu** để tạo ZIP (khôi phục trên Android) và/hoặc TXT (đọc, lưu trữ). Khi chọn TXT, có thể xuất mỗi truyện thành một file hoặc gộp tất cả truyện. Nội dung TXT là bản đang lưu trong thư viện sau chỉnh sửa, UTF-8; không kèm audio.

Bản 1.4.2 chỉ triển khai xuất dữ liệu; không có chức năng nhập ZIP, đồng bộ Wi-Fi hoặc đồng bộ Cloud tự động. Tích hợp Google Drive API có thể bổ sung sau khi app ổn định.

## Google Text-to-Speech

- **Windows**: dùng giọng hệ thống, có thể hoạt động offline.
- **Google truyền thống**: Google Cloud Standard.
- **Google AI**: Google Cloud Chirp 3 HD.

Kết nối Google TTS cần một Google Cloud project, bật Cloud Text-to-Speech API và OAuth Client ID loại Desktop. Google Cloud có thể yêu cầu billing; hãy kiểm tra hạn mức và giá hiện hành trước khi dùng dài ngày. Nội dung truyện được gửi tới Google khi chọn bộ đọc Google.

## Trạng thái kiểm tra của gói nguồn 1.4.3

- Đã chạy `node --check` cho `src/main.js`, `src/preload.js`, `src/renderer.js` và `src/export-utils.js`.
- Đã chạy `npm test`: kiểm tra xuất TXT, nhận diện tiêu đề chương ở đầu file, bổ sung chương, bỏ qua chương trùng, thay chương trùng theo lựa chọn và sắp xếp theo số chương.
- Đã tạo ZIP mẫu bằng hàm đóng gói của ứng dụng và kiểm tra thành công bằng Python `zipfile`.
- Chưa chạy được ứng dụng Electron/đóng gói `.exe` trong môi trường này vì chưa có môi trường Windows để kiểm tra UI, TTS hoặc website thật. Cần build qua GitHub Actions và thử trên PC Windows trước khi coi là đã hoàn tất.

## Ghi chú kỹ thuật

- Electron + HTML/CSS/JavaScript thuần; trích xuất HTML với Cheerio.
- `contextIsolation: true`, `nodeIntegration: false`, preload chỉ expose các IPC được cho phép.
- Electron 45.2.3 và electron-builder 26.18.0; Cheerio là dependency runtime.



# SANGDEV BOT

Zalo Bot ES Module cho Node.js (>=20), đăng nhập bằng cookie + IMEI, lưu dữ liệu trên Firebase Realtime Database / Local JSON và tạo mọi phản hồi quan trọng dưới dạng ảnh.

> `zca-js` là API Zalo cá nhân không chính thức. Tài khoản có thể bị giới hạn hoặc khóa; hãy dùng tài khoản bot riêng và tự chịu trách nhiệm.

## Cài đặt & Hướng dẫn Render.com

### Triển khai trên Render.com (Cloud Deployment)

1. Đăng ký tài khoản trên [Render.com](https://render.com).
2. Tạo mới một **Web Service** kết nối với repository chứa source code này.
3. Trong mục **Environment Variables**, cấu hình các biến sau:
   - `PORT`: `10000` (Render tự động cấp cổng)
   - `ZALO_COOKIE`: Chuỗi mảng JSON Cookie từ phiên Zalo Web
   - `ZALO_IMEI`: IMEI Zalo của bạn
   - `ZALO_USER_AGENT`: User-Agent trình duyệt
   - `OWNER_ID`: Zalo UID của Owner
   - `GEMINI_API_KEY`: API Key lấy từ Google AI Studio
   - `FIREBASE_DATABASE_URL`: (Tùy chọn) URL Firebase Realtime Database
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: (Tùy chọn) Nội dung file `service-account.json` dán trực tiếp dạng chuỗi JSON
4. Render sẽ tự động build và chạy dịch vụ (`npm install` và `npm start`).

---

## Danh sách Lệnh

Prefix mặc định là `'`:

### Mệnh Lệnh Trí Tuệ Nhân Tạo AI (Master Command)
- `'ml <mệnh lệnh>`: AI phân tích và thực thi mệnh lệnh quản trị của Admin:
  - **Kích thành viên**: `'ml kích @Tên` hoặc `'ml xóa @Nguyễn Văn A ra khỏi nhóm`
  - **Xem thời tiết**: `'ml kiểm tra dự báo thời tiết Hà Nội`
  - **Ghi nhớ mệnh lệnh thời gian**: `'ml kiểm tra dự báo thời tiết hằng ngày` (Tự động gửi thông tin thời tiết mỗi ngày)
  - **Đóng / Mở nhóm chat**: `'ml khóa nhóm` hoặc `'ml mở nhóm`
- `'de-ml`: Hiển thị danh sách các mệnh lệnh tự động lặp lại đang ghi nhớ.
- `'de-ml <số>`: Hủy mệnh lệnh ghi nhớ theo số thứ tự (Ví dụ: `'de-ml 1`).

### Lệnh Quản Trị & Hệ Thống
- `'menu`: Xem danh sách tất cả câu lệnh
- `'tl nội dung cần hỏi`: Trò chuyện giải đáp với Gemini AI
- `'admin add @Tên` • `'admin remove @Tên` • `'admin list`: Quản lý danh sách Admin
- `'boton` • `'botoff`: Bật / Tắt hoạt động của Bot
- `'oday` • `'offday`: Cấp phép / Tắt phép bot trong nhóm hiện tại
- `'antisp on/off` • `'antilink on/off`: Bật / Tắt bảo vệ chống spam và chống link
- `'offgr 2:00` • `'ongr`: Hẹn giờ khóa chat nhóm / Mở chat nhóm
- `'welcome on/off`: Bật / Tắt ảnh chào mừng thành viên mới
- `'railink nội dung 3d 12h` • `'railinkoff`: Cấu hình tự động rải tin định kỳ
- `'sp nội dung số_lượng`: Gửi lặp tin nhắn (Tối đa 30 tin)

---

## Dữ liệu

Các nhánh được sử dụng: `users/`, `groups/`, `admins/`, `settings/`, `warnings/`, `permissions/`, `scheduled_tasks/`, `logs/`. Mệnh lệnh lặp được lưu tại `scheduled_tasks/` và duy trì ngay cả khi bot khởi động lại.

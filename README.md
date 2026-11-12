# Zalo AI Bridge

Cầu nối Zalo cá nhân với AI: đăng nhập tài khoản **gửi** bằng QR, chọn tài khoản **nhận** từ danh sách bạn bè hoặc nhập Zalo user ID, gửi ngay hoặc lên lịch một lần / hằng ngày. Hệ thống có trang quản trị và API để AI hoặc ứng dụng bên ngoài điều khiển. Không cần Chatwoot.

> Sử dụng `zca-js`, một thư viện không chính thức. Tài khoản Zalo có thể bị hạn chế hoặc khóa; nên thử bằng tài khoản phụ. Chưa có xác nhận gửi thực tế cho đến khi kết nối tài khoản và tự thử.

## Cài đặt trên máy

Yêu cầu Node.js 22.13 trở lên (khuyến nghị Node 24). Trong thư mục dự án:

```powershell
npm ci
npm run setup
```

Lệnh setup tạo file `.env` với hai khóa ngẫu nhiên, không ghi đè file đã có. Mở `.env`:

1. Điền `AI_API_KEY` bằng khóa hợp lệ của bạn. Không chia sẻ hoặc đưa file này lên Git. Nếu khóa đã bị tiết lộ, hãy thu hồi và tạo khóa mới.
2. Kiểm tra `AI_BASE_URL` và `AI_MODEL`. Mặc định là địa chỉ 9Router và model đã chọn; endpoint phải hỗ trợ OpenAI Chat Completions.
3. Giữ `BRIDGE_API_KEY` để gọi API từ ứng dụng bên ngoài. Khóa này **khác** khóa AI.
4. Giữ an toàn và sao lưu `CREDENTIALS_KEY`; đổi khóa khiến phiên Zalo đã lưu không giải mã được.

```powershell
npm start
```

Mở http://127.0.0.1:4000, kết nối tài khoản gửi bằng QR rồi chọn người nhận. Dashboard mở trực tiếp, không có màn hình đăng nhập. Lịch được tính theo giờ Việt Nam (`Asia/Ho_Chi_Minh`). Cầu nối phải đang chạy để gửi đúng giờ. Nếu ứng dụng dừng hoặc Zalo mất kết nối, lịch đến hạn được xử lý sau khi khởi động và kết nối lại; lịch hằng ngày chỉ gửi một lần cho kỳ đã bỏ lỡ, sau đó lên lịch lần tiếp theo. Không gửi lại tự động nếu trạng thái gửi không chắc chắn: hãy kiểm tra trong Zalo và nhật ký.

`data/` chứa phiên đã mã hóa, lịch và nhật ký tin nhắn. Cần sao lưu `data/` cùng `CREDENTIALS_KEY` ở nơi an toàn. Nội dung lịch và nhật ký không được mã hóa trong SQLite. Dashboard không yêu cầu đăng nhập: bất kỳ ai truy cập được giao diện đều có thể gửi tin và quản lý lịch. Mặc định server chỉ lắng nghe trên localhost; nếu đưa lên mạng cần bảo vệ truy cập bằng lớp xác thực và HTTPS ở proxy. Chạy một instance duy nhất trên mỗi thư mục dữ liệu.

## API

Mọi endpoint `/api/*` yêu cầu `Authorization: Bearer <BRIDGE_API_KEY>`. Ví dụ gửi ngay nội dung do hệ thống bên ngoài cung cấp:

```http
POST /api/messages
Content-Type: application/json
Authorization: Bearer <BRIDGE_API_KEY>

{"recipient":"123456789", "mode":"text", "content":"Chào buổi sáng!"}
```

Gửi theo nội dung AI sinh: đặt `mode` thành `ai`, `content` là yêu cầu viết tin. AI được gọi tại thời điểm gửi; sử dụng có thể phát sinh chi phí nhà cung cấp. `recipient` là ID Zalo dạng số, không phải số điện thoại. Lấy ID từ trang quản trị hoặc `GET /api/contacts` sau khi kết nối.

Tạo lịch hằng ngày:

```http
POST /api/schedules
Content-Type: application/json
Authorization: Bearer <BRIDGE_API_KEY>

{"recipient":"123456789", "label":"Bạn An", "mode":"ai", "content":"Viết lời chào buổi sáng ngắn gọn", "recurrence":"daily", "time":"07:00"}
```

Lịch một lần dùng `"recurrence":"once"` và `"datetime":"2027-01-01T07:00"`, tính theo giờ Việt Nam. Endpoint khác: `GET /api/status`, `POST /api/zalo/login`, `GET /api/contacts`, `GET /api/schedules`, `PATCH /api/schedules/:id` với `{"active":false}`, `DELETE /api/schedules/:id`, `GET /api/messages`, và `POST /api/ai/generate` với `{"prompt":"..."}`. Mỗi lần gọi AI có thể tính phí.

## Docker

Sau khi đã chạy `npm run setup` và điền `.env`:

```powershell
docker compose up -d --build
```

Compose chỉ xuất cổng trên localhost và lưu dữ liệu trong volume `bridge_data`.

## Kiểm thử

```powershell
npm test
```

Test sử dụng Zalo và AI giả lập, không gửi tin thật. Kiểm thử tích hợp đầy đủ cần quét QR, cấu hình AI và xác nhận tin nhận trên một tài khoản Zalo khác.

## Bản quyền

Repo mới, Git riêng, không fork. Phần thiết kế kết nối Zalo được điều chỉnh từ `zca-bridge`, Copyright 2026 Tom, theo Apache License 2.0; xem [NOTICE](NOTICE) và [LICENSE](LICENSE). Giao diện dùng các component và hệ thống màu từ [NextAdmin](https://github.com/NextAdminHQ/nextjs-admin-dashboard); bản nguồn được tham khảo không có file giấy phép cụ thể, cần xác minh điều khoản trước khi phân phối.

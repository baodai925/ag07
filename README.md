# CamVision – Chấm công bằng camera

Ứng dụng chấm công nhận diện khuôn mặt chạy trên trình duyệt, xây dựng bằng **Express + Pug** và **face-api.js** (TensorFlow.js).

## Tính năng

- **Chấm công (kiosk)** – `/cham-cong`: camera quét liên tục, tự nhận diện nhân viên.
  Lần đầu trong ngày = giờ vào, các lần sau (cách ≥ 60 giây) = cập nhật giờ ra.
- **Nhân viên** – `/nhan-vien`: đăng ký khuôn mặt (chụp 5 mẫu), xoá nhân viên.
- **Tổng quan** – `/`: số người đã chấm, đi muộn, chưa chấm hôm nay.
- **Báo cáo** – `/bao-cao`: lọc theo khoảng ngày, xuất CSV mở bằng Excel.

## Chạy thử

```bash
npm install
npm start          # hoặc: npm run dev (tự reload với nodemon)
```

Mở http://localhost:3000. Trình duyệt chỉ cho dùng camera trên `localhost` hoặc **HTTPS**
— nếu đặt máy chấm công ở máy khác trong mạng LAN, cần cấu hình HTTPS (vd. qua nginx/Caddy).

Chạy test: `npm test`

## Cách hoạt động

```
Trình duyệt (face-api.js)                         Server (Express)
camera → phát hiện mặt → vector 128 chiều ──POST /api/attendance──▶ so khớp với mẫu đã lưu
                                                                  (khoảng cách Euclid ≤ 0.5)
                                         ◀── tên NV + giờ vào/ra ── ghi vào data/db.json
```

- Server **chỉ lưu vector đặc trưng khuôn mặt**, không lưu ảnh.
- Mô hình và thư viện được phục vụ từ `node_modules` nên chạy được không cần Internet.
- Dữ liệu lưu ở `data/db.json` (đã bỏ qua trong git).

## Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng server |
| `WORK_START` / `WORK_END` | `08:00` / `17:00` | Giờ vào ca / tan ca (tính đi muộn, về sớm) |
| `TZ_ATTENDANCE` | `Asia/Ho_Chi_Minh` | Múi giờ tính ngày công |
| `MATCH_THRESHOLD` | `0.5` | Ngưỡng so khớp, nhỏ hơn = chặt hơn |
| `COOLDOWN_SECONDS` | `60` | Bỏ qua nhận diện lặp lại trong khoảng này |
| `DATA_FILE` | `data/db.json` | Đường dẫn file dữ liệu |

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/employees` | Danh sách nhân viên |
| `POST` | `/api/employees` | `{ code, name, department, descriptors: number[128][] }` |
| `DELETE` | `/api/employees/:id` | Xoá nhân viên |
| `POST` | `/api/attendance` | `{ descriptor: number[128] }` → `checked_in` / `checked_out` / `already` / `unknown` |
| `GET` | `/api/attendance?from=&to=&format=csv` | Dữ liệu chấm công (JSON hoặc CSV) |
| `GET` | `/api/summary` | Thống kê hôm nay |

## Hạn chế & hướng phát triển

- **Chưa chống giả mạo (liveness)**: có thể đánh lừa bằng ảnh/video. Nên bổ sung kiểm tra nháy mắt/quay đầu, hoặc camera có cảm biến độ sâu.
- **Chưa có đăng nhập**: ai mở được trang đều thêm/xoá được nhân viên. Cần thêm tài khoản quản trị trước khi dùng thật.
- Dữ liệu khuôn mặt là dữ liệu sinh trắc học — cần sự đồng ý của nhân viên và bảo mật server.
- File JSON phù hợp vài trăm nhân viên; quy mô lớn hơn nên chuyển sang SQLite/PostgreSQL.
- Có thể mở rộng: nhiều ca làm việc, nghỉ phép, camera IP (RTSP) xử lý phía server.

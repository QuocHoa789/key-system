# KeyForge — Secure License Infrastructure

KeyForge là hệ thống quản lý license key trên React/Express/tRPC với MongoDB Atlas, public activation gate và dashboard admin dark premium.

## Tính năng

- Tạo key duy nhất gồm 24 ký tự chữ thường và số (`a-z`, `0-9`), kèm nhãn, giới hạn lượt dùng và thời hạn.
- Kích hoạt công khai theo fingerprint thiết bị, có audit activation.
- Dashboard admin với thống kê, tìm kiếm, lọc trạng thái, blacklist/unblacklist, reset HWID, chỉnh sửa và xóa key.
- Đăng nhập admin bằng `ADMIN_PASSWORD` runtime secret; session được ký bằng `MANUS_JWT_SECRET`.
- MongoDB indexes tự tạo khi app khởi động hoặc chạy `pnpm db:setup`.
- Security headers bằng Helmet, CSP/HSTS ở production, CORS allowlist, request ID, body-size limits và rate limiting cho API/login/activation.

## Chạy local

```bash
pnpm install
pnpm db:setup
pnpm dev
```

Ứng dụng chạy tại `http://localhost:3000`. Health check: `GET /api/health`.

## Environment

Copy `.env.example` thành `.env` trong môi trường local. Không commit `.env` hoặc secret thật.

- `MONGODB_URI`: MongoDB Atlas connection string.
- `MONGODB_DB_NAME`: tên database, khuyến nghị `keyforge`.
- `ADMIN_PASSWORD`: mật khẩu dashboard admin.
- `MANUS_JWT_SECRET`: secret random dùng để ký session cookie.
- `CORS_ORIGINS`: danh sách origin cách nhau bằng dấu phẩy; chỉ thêm domain tin cậy.
- `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `OWNER_OPEN_ID`: chỉ cần khi dùng Manus OAuth.

## Raw file hosting

Admin có thể mở tab **Raw files** trong dashboard để upload file text/code (`txt`, `lua`, `js`, `ts`, `json`, `css`, `html`, `md`, `xml`, `yml`, `yaml`) tối đa 10 MB. File được lưu trực tiếp bằng MongoDB GridFS, không cần `MANUS_API_URL` hoặc `MANUS_API_KEY`. Route upload trả về `rawPath` dạng `/api/files/raw/<fileId>` để ghép với domain Render và dùng như GitHub Raw.

```http
POST /api/files/upload
Content-Type: text/plain
X-File-Name: loader.lua
```

Server không nhận file thực thi hoặc phần mở rộng ngoài whitelist.

Ví dụ MongoDB URI:

```text
mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/keyforge?retryWrites=true&w=majority
```

Password có ký tự đặc biệt phải URL-encode. Database user nên chỉ có quyền `readWrite` trên database `keyforge`.

## Render Docker deployment

- Language: `Docker`
- Dockerfile Path: `Dockerfile`
- Health Check Path: `/api/health`
- Pre-Deploy Command: `pnpm db:setup`
- Environment: `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_PASSWORD`, `MANUS_JWT_SECRET`, và `CORS_ORIGINS` nếu cần.

Render tự cấp `PORT`; server bind trên `0.0.0.0` và không hard-code port production.

## License REST API

## Bootstrap loader

`bootstrapper.lua` là loader mẫu cho file đã upload. Thay `PASTE_FILE_ID_HERE` bằng ID file trong dashboard rồi chạy bootstrapper. Loader gọi `POST /api/v1/loader/session`, nhận session token sống 90 giây, sau đó gọi `/api/v1/loader/payload`. Chỉ file đang bật mới được cấp payload; file tắt trả về `disabled`. Raw source public đã bị khóa và trả `410`, chỉ admin đã đăng nhập mới xem được raw route.

Bootstrapper giúp ngăn việc mở raw URL để lấy source và giới hạn replay bằng token ngắn hạn/rate limit. Vì payload cuối cùng vẫn phải được nạp trên máy client, không thể cam kết chống tuyệt đối dump hoặc hook sau khi script đã chạy.

Ba endpoint dành cho ứng dụng client/desktop/game:

```text
POST /api/v1/license/verify
POST /api/v1/license/activate
POST /api/v1/license/heartbeat
```

Request verify/activate dùng `{ "key": "...", "deviceId": "..." }`. `verify` chỉ cho phép key đã redeem trên đúng device và không trừ lượt; key `unactivated` trả `not_redeemed`. `activate` là bước redeem, bind key với device, ghi audit và trả `licenseToken` signed có thời hạn 30 phút. Nếu cùng key và cùng device gọi lại, server cấp token mới nhưng không tăng `usedCount`; device khác vẫn bị chặn. Heartbeat dùng `{ "licenseToken": "...", "deviceId": "..." }` để kiểm tra token, trạng thái blacklist/expiry và device binding. Các endpoint có rate limit riêng.

## Kiểm tra

```bash
pnpm check
pnpm test
pnpm build
```

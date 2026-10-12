# KeyForge — Secure License Infrastructure

KeyForge là hệ thống quản lý license key trên React/Express/tRPC với MongoDB Atlas, public activation gate và dashboard admin dark premium.

## Tính năng

- Tạo key duy nhất gồm 24 ký tự chữ in hoa và số (`A-Z`, `0-9`), kèm nhãn, giới hạn lượt dùng và thời hạn.
- Kích hoạt công khai theo fingerprint thiết bị, có audit activation.
- Dashboard admin với thống kê, tìm kiếm, lọc trạng thái, chỉnh sửa, revoke và xóa key.
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

## Kiểm tra

```bash
pnpm check
pnpm test
pnpm build
```

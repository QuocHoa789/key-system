# KeyForge — Secure License Infrastructure

KeyForge là hệ thống quản lý license key hoạt động trên React/Express/tRPC/Drizzle, có database MySQL managed, public activation gate và dashboard admin dark premium.

## Tính năng

- Tạo key duy nhất với nhãn, giới hạn lượt dùng và thời hạn.
- Kích hoạt công khai theo fingerprint thiết bị, trả kết quả rõ ràng cho key không hợp lệ, hết hạn, hết lượt hoặc bị thu hồi.
- Dashboard admin với thống kê, tìm kiếm, lọc trạng thái, chỉnh sửa, revoke, xóa key và audit activation.
- Đăng nhập admin bằng **ADMIN_PASSWORD runtime secret**; mật khẩu không nằm trong source code, `.env`, commit hoặc lịch sử Git.
- Manus OAuth vẫn được hỗ trợ cho tài khoản admin đã được provision qua role trong database.

## Chạy local

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Ứng dụng chạy tại `http://localhost:3000`. Health check: `GET /api/health`.

## Environment

Copy `.env.example` thành `.env` trong môi trường local và điền các giá trị secret. Không commit `.env` hoặc secret thật.

- `DATABASE_URL`: MySQL connection string.
- `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`: giá trị do Manus runtime cung cấp.
- `ADMIN_PASSWORD`: mật khẩu đăng nhập khu vực admin, chỉ cấu hình qua secret manager hoặc environment runtime.

Trong môi trường WebDev managed, `ADMIN_PASSWORD` đã được khai báo dưới dạng protected secret. Session admin dùng cookie `HttpOnly`, `Secure`, `SameSite=None`, tự hết hạn sau 8 giờ và được ký bằng `MANUS_JWT_SECRET`.

## Kiểm tra

```bash
pnpm check
pnpm test
pnpm build
```

## GitHub

Repository này giữ lại một số file legacy từ các phiên bản key-system trước để bảo toàn lịch sử. Runtime hiện tại dùng entrypoint trong `server/_core/index.ts`, frontend trong `client/` và schema/migration trong `drizzle/`.

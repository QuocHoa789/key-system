# Roblox Key System — Self-contained

Toàn bộ backend, schema SQLite và Admin UI nằm trong **một file `app.js` duy nhất**. Chỉ cần Node.js 20+, npm và file `.env` là chạy được.

## Chạy ngay

```bash
cp .env.example .env
# thay ba secret và ADMIN_PASSWORD trong .env
npm install
npm start
```

Mở `http://localhost:3000/admin`.

## API chính

- `POST /api/admin/login` — `{username,password}`
- `GET /api/admin/overview`
- `GET /api/admin/keys?search=&status=`
- `POST /api/admin/keys` — `{prefix,expiresAt,note}`
- `PATCH /api/admin/keys/:id` — `{status,note,expiresAt}`
- `POST /api/admin/keys/:id/reset-hwid` — `{reason}`
- `POST /api/admin/blacklist` — `{hwid,reason}`
- `POST /api/gate/start` — `{hwid}`
- `POST /api/client/validate` — request HMAC theo canonical string trong code

## VPS

Dùng PM2: `pm2 start app.js --name roblox-key-system && pm2 save`.
Đặt Nginx reverse proxy vào `127.0.0.1:3000` và bật HTTPS bằng Certbot. Không commit `.env`, không nhúng `HMAC_SECRET` vào Luau/executor.

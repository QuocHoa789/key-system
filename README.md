# Roblox Script Hub Key System

Production-ready license server cho Roblox Script Hub: key bind cứng vào HWID, JWT admin, HMAC-SHA256 client protocol, rate limit, audit logs, IP anomaly detection, SQLite mặc định và PostgreSQL adapter.

## Chạy nhanh

```bash
cp .env.example .env
# bắt buộc đổi JWT_SECRET, HMAC_SECRET, KEY_SALT, ADMIN_PASSWORD
npm ci
npm start
```

Mở `http://localhost:3000/admin`. Admin mặc định lấy từ `ADMIN_USERNAME`/`ADMIN_PASSWORD`; ở lần khởi động đầu, tài khoản được hash bcrypt cost 12 vào DB.

## API client

1. `POST /api/gate/start` với header `X-Client-Id` và body `{ "hwid": "..." }`.
2. Ký request bằng HMAC-SHA256 hex: `HMAC_SECRET` không bao giờ đưa vào executor. Với client thật, gọi endpoint gate/loader của bạn để nhận challenge rồi proxy ký server-side; `client/loader.lua` minh họa protocol không chứa secret.
3. `POST /api/client/validate` body `{sessionId,key,hwid,userId,ts,nonce}` và headers `X-Client-Id`, `X-Signature`. Canonical string: `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(JSON_BODY)`.

> Không có cơ chế client-side nào chống tuyệt đối executor bị sửa. Thiết kế này giảm share key bằng bind bất biến, blacklist, replay protection, rate limit, anomaly checks và audit trail; secret HMAC phải ở server, không nhúng vào Luau.

## Admin API

- `POST /api/admin/login`
- `GET /api/admin/overview`
- `GET /api/admin/keys?status=active&search=`
- `POST /api/admin/keys` `{prefix,expiresAt,note}`
- `PATCH /api/admin/keys/:id` `{status,note,expiresAt}`
- `POST /api/admin/keys/:id/reset-hwid` `{reason}`
- `POST /api/admin/blacklist` `{hwid,reason}`
- `GET /api/admin/audit`

## Deploy Ubuntu 22.04

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
npm ci --omit=dev
cp .env.example .env && chmod 600 .env
npx pm2 start ecosystem.config.cjs && npx pm2 save && npx pm2 startup
sudo cp deploy/nginx.conf /etc/nginx/sites-available/key-system
sudo ln -s /etc/nginx/sites-available/key-system /etc/nginx/sites-enabled/key-system
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d keys.example.com
```

Before public deployment: set a random secret, change admin password, use HTTPS, restrict `/admin` with VPN/IP allowlist if possible, and back up SQLite or use PostgreSQL.

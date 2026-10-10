# Key System Control Center

Hệ thống cấp key server-authoritative cho game, gồm admin panel, one-user/one-HWID/one-key binding, gate claim và API verify.

## Chạy

Project dùng managed MySQL qua `DATABASE_URL`. Các secret protected cần có trên runtime: `ADMIN_PASSWORD`, `JWT_SECRET`, `HMAC_SECRET`, `KEY_SALT`. Không commit `.env` hoặc giá trị secret. Tài khoản admin cố định là `quochoa`; mật khẩu không nằm trong source.

```bash
npm ci
npm start
```

Mở `/admin`. Endpoint `/healthz` dùng cho readiness.

## API

- `POST /api/admin/login` — `{ username, password }`
- `GET /api/admin/overview`, `GET /api/admin/keys?search=&status=`
- `POST /api/admin/keys` — `{ prefix, expiresAt, note }`
- `PATCH /api/admin/keys/:id` — `{ status, note, expiresAt }`
- `DELETE /api/admin/keys/:id` — revoke mềm, giữ audit trail
- `POST /api/admin/keys/:id/reset-hwid`
- `POST /api/admin/blacklist` — `{ hwid, reason }`
- `POST /api/gate/start` — `{ hwid, userId }`
- `POST /api/gate/claim` — `{ sessionId }`; cấp key active chưa bind, ngẫu nhiên, đúng một lần
- `POST /api/client/validate` — cần sessionId, key, hwid, userId và HMAC headers

## HMAC relay

`HMAC_SECRET` là server secret, không được nhúng vào Luau/executor/client. Vì vậy client game phải gọi backend relay của chính bạn; relay đọc secret từ secret manager, tạo canonical string và forward request đến endpoint verify. Canonical:

```text
METHOD + "\\n" + PATH + "\\n" + X-Timestamp + "\\n" + X-Nonce + "\\n" + sha256(JSON.stringify(body))
signature = hex(hmac_sha256(HMAC_SECRET, canonical))
```

Server cũng kiểm tra nonce unique, timestamp lệch tối đa 120 giây, IP gate, session, key hash, expiry, blacklist, HWID và userId. Database chỉ lưu hash/masked key. Raw key chỉ xuất hiện khi admin tạo hoặc gate claim, không thể lấy lại từ database.

## Chống bypass — giới hạn thực tế

Quyền load script được quyết định bởi server, không phải một boolean tin cậy từ client. Tuy nhiên, không có cách chống tuyệt đối việc patch một client/executor mà người dùng kiểm soát: họ có thể giả lập request hoặc sửa script cục bộ. Không gửi secret server cho client, bắt relay ký, giữ script nhạy cảm ở server và kiểm tra lại định kỳ để giảm rủi ro.

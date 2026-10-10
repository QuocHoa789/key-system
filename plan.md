# Kế hoạch triển khai Key System Control Center

## Phạm vi đã chốt

- Một key chỉ được bind với một HWID; một userId chỉ được dùng một key duy nhất.
- Admin đăng nhập bằng tài khoản `quochoa`; mật khẩu chỉ được nạp từ protected secret, không commit vào Git.
- Admin panel riêng để tạo, xem, tìm kiếm, vô hiệu hóa, thu hồi, xóa key, reset HWID, blacklist HWID và xem audit log.
- Luồng gate/link tạo phiên ngắn hạn, chọn một key ngẫu nhiên đang khả dụng và trả raw key đúng một lần.
- API client verify server-authoritative: kiểm tra chữ ký HMAC, timestamp, nonce chống replay, phiên gate, key, hạn dùng, HWID, userId, blacklist và trạng thái.
- Managed server + managed MySQL database; không dùng SQLite trong runtime production.
- Preview chạy trên port 3000; `/healthz` không yêu cầu đăng nhập.

## Kiến trúc triển khai

- `src/server.js`: Express server, middleware bảo mật, route web/API, startup migration và seed admin.
- `src/db.js`: MySQL pool, migration schema, transaction helper và prepared queries.
- `src/security.js`: hash key, bcrypt password, timing-safe compare, HMAC canonical request, nonce replay guard và token helpers.
- `src/admin.html`: giao diện admin dark control-room, dùng vanilla JS và CSS nội bộ, không tải CDN runtime.
- `public/manus-routes.json`: manifest route `/` và `/admin`.
- `Dockerfile`: cài dependencies và chạy Node 20+ cho published container.
- `app.config.ts`: logo URL literal theo yêu cầu WebDev.

## Bảo mật và giới hạn thực tế

- Secrets server (`DATABASE_URL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `HMAC_SECRET`, `KEY_SALT`) không xuất hiện trong frontend, log hoặc repository.
- Admin session dùng JWT trong cookie HttpOnly, `SameSite=None; Secure` cho Preview HTTPS và token CSRF riêng cho mutation.
- Client verify không nhận secret HMAC; bên tích hợp phải gọi gateway/relay server của mình để ký request. Một script client bị người dùng kiểm soát vẫn có thể bị patch, nên không thể cam kết chống crack tuyệt đối ở phía client; hệ thống sẽ làm cho mọi quyết định cấp quyền nằm ở server.
- Key raw chỉ trả lúc claim một lần; database chỉ lưu hash và masked key.
- Atomic claim với row lock tránh cấp trùng; unique constraint trên `user_id` và partial-equivalent guard trong transaction giữ một user một key.
- Rate limit theo nhóm endpoint, giới hạn body, Helmet/CSP, no-store cho API nhạy cảm, audit log và cleanup session/nonce hết hạn.

## Luồng dữ liệu

1. User gửi HWID đến `POST /api/gate/start`; server kiểm tra blacklist và tạo gate session 10 phút.
2. User hoàn thành link rồi gọi `POST /api/gate/claim` với session; transaction chọn key active chưa bind, bind `gate_session`, trả raw key một lần.
3. Client tạo canonical request từ method/path/timestamp/nonce/body hash và gửi `POST /api/client/validate` cùng chữ ký HMAC do server relay tạo.
4. Server xác minh replay guard, session, key hash, hạn dùng, userId/HWID/blacklist và đánh dấu phiên đã validate; chỉ khi hợp lệ mới trả `valid:true`.
5. Admin sử dụng `/admin` và các `/api/admin/*` route để quản lý key, HWID và audit.

## Phong cách giao diện

- **Design movement:** cyber-operations control room, ưu tiên tín hiệu trạng thái và khả năng quét nhanh hơn trang marketing.
- **Core principles:** rõ trạng thái, mật độ thông tin có kiểm soát, thao tác nguy hiểm có xác nhận, mọi thay đổi có dấu vết.
- **Color philosophy:** nền graphite giúp dashboard ít mỏi mắt; cyan là tín hiệu hệ thống; emerald là hợp lệ; amber là cần chú ý; rose là nguy hiểm.
- **Layout paradigm:** rail thông tin bên trái + vùng làm việc phân tầng, không dùng hero/grid marketing trung tâm.
- **Signature elements:** đường lưới mờ, status dots, card viền sáng nhẹ và nhãn monospace cho ID/key.
- **Interaction:** filter phản hồi nhanh, mutation báo toast, confirm cho xóa/thu hồi/reset, trạng thái loading rõ ràng.
- **Animation:** chỉ dùng fade/slide rất ngắn cho panel và toast; tôn trọng `prefers-reduced-motion`.
- **Typography:** Inter/system sans cho nội dung, JetBrains Mono fallback cho dữ liệu kỹ thuật.
- **Brand essence:** “Control issuance before it reaches the client” — chính xác, kín đáo, kiểm soát.
- **Brand voice:** tiêu đề ngắn, trực tiếp; ví dụ “Cấp quyền có kiểm soát”, “Mọi lần bind đều được ghi log”.
- **Wordmark/mark:** biểu tượng lỗ khóa hình lục giác với một đường xác thực cyan.
- **Signature brand color:** cyan `#22d3ee` trên graphite `#07111f`.

## Build và delivery

- Dùng `npm ci` và `npm start`; Dockerfile lắng nghe `PORT` mặc định 3000.
- Khai báo server/database đã bật; route published sẽ chuyển `/api/*` và `/healthz` vào server.
- Chạy diagnostics JavaScript, test logic security/route bằng Node test, kiểm tra HTTP health và manifest.
- Commit checkpoint vào Managed by Manus, sau đó commit/push bản tương tự lên repository GitHub `QuocHoa789/key-system` theo yêu cầu người dùng.
- Chỉ công bố URL published nếu publish thành công; nếu chưa publish, cung cấp Preview URL và nêu rõ đó là preview.

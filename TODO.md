# TODO — Key System Control Center

- [ ] **Managed web server và database hoạt động:** project chạy trên port 3000, dùng managed MySQL `DATABASE_URL`, có migration repeatable và endpoint `/healthz` trả 2xx không cần đăng nhập.
- [ ] **Admin authentication an toàn:** tài khoản `quochoa` được seed từ protected secret, mật khẩu hash bcrypt, cookie session HttpOnly/Secure/SameSite phù hợp Preview, CSRF token cho mutation và rate limit login.
- [ ] **Admin panel quản lý key:** admin tạo key ngẫu nhiên, xem bảng/filter/search, chỉnh hạn dùng/ghi chú, enable/disable/revoke, xóa key, reset HWID và xem thống kê/audit log.
- [ ] **Gate/link cấp key ngẫu nhiên:** user bắt đầu gate bằng HWID, sau khi hoàn thành link claim một key active chưa bind; key raw chỉ trả một lần, không cấp trùng trong transaction và session hết hạn sau thời gian ngắn.
- [ ] **API verify HWID và user:** endpoint verify yêu cầu HMAC timestamp/nonce/body canonical hợp lệ, chống replay, kiểm tra session/key/hạn dùng/blacklist, enforce một HWID và một userId cho mỗi key, chỉ trả `valid:true` khi mọi điều kiện hợp lệ.
- [ ] **Audit và hardening:** Helmet/CSP, rate limit theo endpoint, giới hạn JSON body, no-store API, timing-safe compare, cleanup session/nonce, ràng buộc IP gate và audit các mutation/mismatch.
- [ ] **Route manifest và published container:** có `public/manus-routes.json`, Dockerfile production, config routing server và app metadata/logo hợp lệ.
- [ ] **Validation và delivery:** diagnostics/checks sạch, preview phản hồi, checkpoint được ghi nhận, mã nguồn được push lên GitHub `QuocHoa789/key-system`, và giao URL preview/published chính xác.

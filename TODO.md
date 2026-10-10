# KeyForge — Outcome checklist

- Tạo key mới với mã duy nhất, nhãn tùy chọn, giới hạn số lượt sử dụng và thời hạn tùy chọn; key được lưu bền vững trong database.
- Kích hoạt key công khai bằng mã key và fingerprint thiết bị; phản hồi rõ key không hợp lệ, bị vô hiệu hóa, hết hạn, hết lượt, kích hoạt mới hoặc thiết bị đã kích hoạt.
- Theo dõi và cập nhật trạng thái `chưa kích hoạt`, `đang hoạt động`, `hết lượt`, `hết hạn` hoặc `bị vô hiệu hóa` theo dữ liệu sử dụng và thời hạn.
- Khu vực quản trị yêu cầu Manus OAuth và kiểm tra role admin; người chưa đăng nhập không được truy cập dữ liệu quản trị.
- Dashboard quản trị hiển thị tổng key, phân bố trạng thái, tổng lượt đã dùng, tỷ lệ sử dụng và activation gần đây.
- Danh sách quản trị hỗ trợ tìm kiếm theo mã/nhãn, lọc theo trạng thái, sao chép key, thu hồi key, chỉnh sửa giới hạn/thời hạn và xóa key cùng lịch sử activation.
- Lưu lịch sử activation gồm key, fingerprint, địa chỉ IP, user-agent và thời điểm để quản trị viên tra cứu.
- Giao diện responsive dark premium với sidebar, thẻ số liệu, bảng key, form activation công khai và phản hồi trạng thái dễ hiểu.

# Hệ thống agent

PluginCore dùng manifest trong `registry/agents/` để mô tả vai trò, chuyên môn, tín hiệu kích hoạt, thư mục phụ trách, lệnh kiểm tra và quyền review. Project type khai báo vai trò mặc định và host adapter. Registry đi kèm có Architect, Frontend, Backend, Data, Testing, Security, Reviewer và Shared.

## Chọn agent khi tạo project

Wizard hỏi `Agent setup` với Web, API và Monorepo. Khi chạy không tương tác, mặc định là `automatic`:

```sh
repo create platform --type monorepo --agents automatic --yes
repo create platform --type monorepo --agents custom --agent backend,reviewer --yes
repo create platform --type monorepo --agents none --yes
```

| Mode | Kết quả khi tạo project |
| --- | --- |
| `automatic` | Chọn bộ vai trò từ metadata của project type. |
| `recommended` | Ghi bộ vai trò đề xuất và lý do vào bản xem trước. |
| `custom` | Chỉ chọn ID trong `--agent` hoặc danh sách nhập trong wizard; ID phải có manifest tương thích. |
| `none` | Không tạo file agent nếu project không khai báo vai trò bắt buộc. |

`repo.config.yaml` lưu mode, `enabled` dưới dạng `id@version` và ID adapter. Codex adapter tạo `AGENTS.md` và một file `agents/<id>.toml` cho mỗi vai trò đã chọn. `review_only = true` giữ Reviewer và Security ở vai trò tư vấn, không giao việc sửa source cho chúng. Các file này là hướng dẫn cho AI host; CLI không tự chạy agent.

## Giải thích lựa chọn theo tác vụ

Trong project đã tạo, chạy:

```sh
repo agents explain --target apps/web/src/App.tsx --text "Change button padding"
repo agents explain --target apps/api/src/auth/router.ts --text "Fix login authorization"
```

Nếu gọi ngoài thư mục project, thêm `--root /absolute/path/to/project`. Có thể truyền `--intent feature|bugfix|refactor|design|review|test|security`; nếu bỏ qua, resolver suy luận intent từ mô tả và đường dẫn. Kết quả hiển thị vai trò được bật, lý do và vai trò được đề xuất thêm. Với thay đổi liên quan xác thực, Security là vai trò bắt buộc kể cả khi mode của project là `none`.

Resolver dùng đường dẫn phụ trách, tín hiệu trong yêu cầu và gợi ý từ manifest. Ví dụ, thay đổi giao diện trong `apps/web` chỉ chọn Frontend; thay đổi đăng nhập trong `apps/api` chọn Backend và Security, đồng thời đề xuất Reviewer. `repo agents explain` chỉ tính và in lựa chọn; nó không sửa cấu hình hay chạy tác vụ.

Flow tự động điều phối nhiều giai đoạn thuộc Phase 6 của roadmap. Phase 5 cung cấp catalog, resolver, mode, giải thích và Codex adapter cho file vai trò.

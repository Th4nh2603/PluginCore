# Luồng `repo create`

Trong terminal, dùng **↑/↓** để di chuyển và **Enter** để chọn. Tên repository được nhập bằng chữ. Tham số đã truyền trên lệnh sẽ bỏ qua câu hỏi tương ứng.

## 1. Tên và loại project

CLI hỏi `Repository name` nếu chưa có tên trên lệnh. Tên hợp lệ dùng chữ, số và dấu `-`; thư mục đích phải chưa tồn tại. Sau đó CLI hỏi `Project type` nếu không có `--type`.

| Lựa chọn | ID |
| --- | --- |
| API / Backend Service | `api` |
| Empty / Custom | `empty` |
| Monorepo | `monorepo` |
| Web | `web` |

## 2. Chọn agent setup

Với Web, API và Monorepo, CLI hỏi `Agent setup` trước khi chọn stack. Automatic dùng các vai trò mặc định từ project manifest; Recommended hiển thị bộ vai trò được đề xuất; Custom yêu cầu danh sách ID phân tách bằng dấu phẩy; None không tạo file agent khi tạo project. Nếu đã truyền `--agents`, CLI dùng mode đó mà không hỏi lại. Empty không có bước này.

## 3. Monorepo: chọn điểm bắt đầu

Menu `Start from` có hai lựa chọn:

| Lựa chọn | Giá trị ban đầu |
| --- | --- |
| Recommended Monorepo | React, Express, Prisma, Custom Authentication |
| Custom | Chưa chọn Frontend, Backend, ORM, Authentication |

Preset là điểm bắt đầu, không phải một nhánh tách khỏi Custom. Nếu truyền `--preset`, CLI đi thẳng vào màn chỉnh cấu hình với giá trị từ preset đó. Nếu registry không có preset Monorepo phù hợp, menu chỉ có Custom.

## 4. Monorepo: chỉnh cấu hình

Menu `Configure stack` luôn hiện giá trị hiện tại của **Frontend**, **Backend**, **ORM** và **Authentication**. Chọn một dòng để đổi giá trị, rồi quay lại menu này. Các lựa chọn lấy từ registry và có thể khác nếu dùng `--registry`:

| Nhóm | Lựa chọn trong registry đi kèm |
| --- | --- |
| Frontend | React, Vue |
| Backend | Express, Fastify |
| ORM | Prisma, Drizzle |
| Authentication | Custom Authentication, Clerk Authentication |

Vite, TypeScript, pnpm workspace, PostgreSQL và Vitest là các thành phần cố định. Chúng được nhắc ở dòng `Continue` và trong bản xem lại. Nếu một nhóm chỉ có một giá trị, CLI tự chọn giá trị đó, không mở menu một lựa chọn. `Continue` chỉ hoạt động sau khi đủ các nhóm. `--auth custom` hoặc `--auth clerk` giữ Authentication cố định, không hỏi lại.

## 5. Monorepo: xem lại và cài

CLI hiện tên project, điểm bắt đầu (và trạng thái đã chỉnh nếu khác preset), stack, Authentication, thành phần cố định và thư mục đích. Menu `Review` có:

Trước menu Review, CLI in các agent đã chọn và lý do từ resolver. `repo.config.yaml` lưu mode, ID vai trò kèm phiên bản và adapter được chọn.

| Lựa chọn | Kết quả |
| --- | --- |
| Install | Tạo project theo cấu hình đang xem. |
| Edit stack | Quay lại `Configure stack`, giữ các giá trị đã chọn. |
| Cancel | Dừng mà không tạo file. |

Nếu chỉnh preset, `repo.config.yaml` vẫn lưu ID preset cùng các giá trị stack đã ghi đè. Nếu bắt đầu từ Custom thì không có preset. CLI chỉ ghi file sau khi chọn **Install**.

Với Monorepo dùng Custom Authentication, sau **Install** CLI hiển thị `Admin username: admin`, rồi hỏi mật khẩu và xác nhận mật khẩu bằng ô nhập ẩn. Mật khẩu dài 12–128 ký tự. Nếu mật khẩu không hợp lệ hoặc xác nhận không khớp, CLI báo lỗi và hỏi lại cả hai trường; project chỉ được tạo sau khi nhập hợp lệ. Mật khẩu không được ghi vào cấu hình hoặc managed state. File `.repo-standard/initial-user.json` chứa hash scrypt, có quyền `0600` và nằm trong `.gitignore` của project. Sau khi chạy PostgreSQL và `pnpm --filter ./apps/api db:push`, API tạo user `admin` một lần trước khi lắng nghe rồi xóa file. Khi DB lỗi, file được giữ để thử lại. Clerk và chế độ không tương tác không hỏi và không tạo user ban đầu.

Lựa chọn Authentication được lưu thành `auth-custom` hoặc `auth-clerk` trong `composition.capabilities`. Trường `composition.authentication` cũng được ghi để giữ tương thích với cấu hình cũ. CLI kiểm tra capability có executor trước khi tạo thư mục project.

## 6. Web, API và Empty

Các loại project này giữ luồng hiện tại: `Setup` → Recommended preset hoặc Custom → xem stack → `Install stack`. Custom Web hỏi Frontend; Custom API hỏi Backend và ORM. Empty không có thành phần stack để chọn.

## 7. Tham số và chế độ không tương tác

| Tham số | Tác dụng |
| --- | --- |
| `repo create <name>` | Truyền trước tên. |
| `--type <id>` | Truyền trước loại project. |
| `--preset <id>` | Truyền trước preset; Monorepo vẫn có thể chỉnh từng mục khi tương tác. |
| `--auth <provider>` | Giữ cố định Authentication cho Monorepo. |
| `--agents <mode>` | Chọn `automatic`, `recommended`, `custom` hoặc `none`. |
| `--agent <ids>` | Chọn vai trò bằng danh sách ID, chỉ dùng với `--agents custom`. |
| `--target <path>` | Đổi thư mục đích. |
| `--registry <path>` | Dùng registry khác. |
| `--yes` | Cho phép tạo file khi stdin không tương tác. |

Khi stdin không tương tác, cần truyền tên và `--type`. Nếu không có `--yes`, CLI chỉ hiện preview rồi thoát với mã `2`. Chế độ này không vào màn chỉnh stack. `--yes` trong terminal tương tác không bỏ qua `Review`.

Sau khi tạo, CLI ghi `repo.config.yaml` và `.repo-standard/managed-state.yaml`, rồi hiện lệnh `cd` vào project. Với Monorepo, phần **Next steps** lần lượt hiện `docker compose up -d`, `pnpm --filter ./apps/api db:push`, `pnpm dev`. Với API, lệnh tạo schema là `pnpm db:push`. Nếu dùng PostgreSQL có sẵn thay cho Docker, kiểm tra `DATABASE_URL` trong `.env` và bỏ qua lệnh `docker compose up -d`. Project chỉ có Web không cần lệnh Docker hoặc `db:push`.

Chạy `repo agents explain --root <project> --target apps/api/src/auth/router.ts --text "Fix login"` để xem lựa chọn theo tác vụ. Xem [hướng dẫn agent](agents.md) để biết các mode và vai trò.

# PluginCore — Repository Standard CLI

CLI tạo project và quản lý cấu hình tiêu chuẩn repository thông qua registry, preset và capability.

## Yêu cầu

- Git và Node.js >=20; nên dùng Node.js 24.
- pnpm có trong PATH; generator gọi pnpm để tạo project và cài dependencies.
- Internet khi cài dependencies hoặc chạy generator bên ngoài.

## Cài đặt từ source

Package hiện đặt `private: true`. Clone và build từ source:

```sh
git clone https://github.com/Th4nh2603/PluginCore.git
cd PluginCore
npm install --global pnpm@10
pnpm install --frozen-lockfile
pnpm build
npm link
repo --help
```

`npm link` đăng ký lệnh `repo` và liên kết với checkout này. Giữ thư mục source sau khi cài; build lại sau mỗi lần thay đổi code.

Không cần đăng ký global nếu chạy trực tiếp tại thư mục PluginCore:

```sh
node ./bin/repo.cjs --help
node ./bin/repo.cjs create
```

## Tạo project

Chuyển đến thư mục cha muốn chứa project mới rồi chạy:

```sh
repo create
```

Wizard hỏi tên repository, loại project và cách thiết lập. Dùng phím ↑/↓ để di chuyển, rồi nhấn Enter để chọn:

1. Chọn loại project được generator hỗ trợ: `web`, `api`, `monorepo` hoặc `empty`.
2. Nếu loại project có vai trò agent trong registry, chọn **Agent setup**: Automatic, Recommended, Custom hoặc None. Automatic là mặc định khi chạy bằng tham số.
3. Với Monorepo, chọn **Recommended Monorepo** hoặc **Custom** làm điểm bắt đầu. Preset điền sẵn React, Express, Prisma và Custom Authentication; bạn có thể đổi từng mục ngay tại menu **Configure stack**. Sau đó chọn **Review** → **Install**, **Edit stack** hoặc **Cancel**. Tham số `--preset recommended-monorepo-clerk` vẫn điền sẵn Clerk.
4. Với Web/API/Empty, chọn **Recommended** hoặc **Custom** theo luồng hiện tại. Các nhóm có thể chọn gồm:

| Nhóm | Lựa chọn | Loại project |
| --- | --- | --- |
| Frontend | React / Vue (Vite + TypeScript) | Web, Monorepo |
| Backend | Express / Fastify (TypeScript) | API, Monorepo |
| ORM | Prisma / Drizzle (PostgreSQL) | API, Monorepo |
| Authentication | Custom / Clerk | Monorepo |

CLI hiển thị bảng tóm tắt cấu hình trước khi tạo. Với Monorepo, có thể quay lại chỉnh một mục mà vẫn giữ preset đã chọn. Các lựa chọn được lưu vào `repo.config.yaml` và dùng để sinh source, dependencies và schema tương ứng.

Custom monorepo có `apps/web`, `apps/api`, `packages/shared`. Với Custom Authentication trong wizard tương tác, sau **Install** CLI hỏi username và mật khẩu hai lần. Username dài 3–32 ký tự, được chuẩn hóa thành chữ thường; mật khẩu dài 12–128 ký tự và được nhập ẩn. CLI ghi hash scrypt vào `.repo-standard/initial-user.json` với quyền `0600`; file được Git bỏ qua và API dùng đúng một lần để tạo user sau khi database/schema sẵn sàng. Chạy `docker compose up -d`, `pnpm --filter ./apps/api db:push`, rồi `pnpm dev`. Nếu database chưa sẵn sàng, giữ file và chạy lại API sau khi sửa lỗi. Luồng `--yes` không tạo user ban đầu; form đăng ký/đăng nhập vẫn có thể dùng để tạo tài khoản. Với Clerk, điền API keys theo README của project. ORM vẫn được tạo khi dùng Clerk để quản lý dữ liệu ứng dụng.

Authentication của Monorepo được lưu trong `composition.capabilities` của `repo.config.yaml` dưới ID `auth-custom` hoặc `auth-clerk`. `--auth` và lựa chọn trong wizard cùng chọn capability này; `composition.authentication` vẫn được ghi để tương thích với cấu hình cũ. Khi tạo project, executor của capability được chọn sinh phần web/API và cấu hình xác thực. Một capability có manifest trong registry nhưng chưa có executor sẽ bị từ chối trước khi tạo thư mục đích.

## Luồng tạo project và file được quản lý

`repo create` phân giải lựa chọn từ registry thành cấu hình và execution plan trước khi ghi file. Executor lần lượt chạy generator của project type, capability và agent adapter, ghi `repo.config.yaml`, xác minh các file được báo cáo, ghi `.repo-standard/managed-state.yaml`, rồi xác minh state lần cuối. Nếu một bước thất bại sau khi CLI tạo thư mục đích, CLI xóa toàn bộ thư mục đó; thư mục đã tồn tại từ trước không bị xóa.

Managed state ghi `path`, `owner`, `version` của extension (nếu có) và SHA-256 của từng file do pipeline tạo. File bị capability thay đổi được gán cho capability; `agents/<id>.toml` thuộc `agent:<id>`, còn `AGENTS.md` thuộc `adapter:codex`. `repo.config.yaml` thuộc `core`. CLI không ghi `node_modules`, `.git`, `dist`, `coverage` hoặc chính thư mục `.repo-standard` vào danh sách file được quản lý. State này là dữ liệu để phát hiện thay đổi về sau; lệnh cập nhật và xử lý xung đột thuộc Phase 8.

Màu CLI: cyan cho tiêu đề, tím cho lựa chọn, xanh lá cho thành công, vàng cho cảnh báo. Đặt biến môi trường `NO_COLOR` để tắt màu; output được chuyển hướng mặc định không có màu.

Tên project chỉ dùng chữ, số và dấu gạch ngang. Thư mục đích phải chưa tồn tại; mặc định là thư mục mang tên project trong thư mục hiện tại.

Có thể truyền trước tên, loại project và preset:

```sh
repo create my-web --type web --preset recommended-web
repo create my-api --type api --preset recommended-api
repo create my-platform --type monorepo --preset recommended-monorepo
repo create my-platform-clerk --type monorepo --preset recommended-monorepo-clerk
```

Sau khi tạo, đọc README của project và hướng dẫn CLI in ra. Custom Web/API/Monorepo và Recommended API tự cài dependencies. Với Recommended Web, chạy `pnpm install` trong project trước khi chạy `pnpm dev`. Monorepo có bước cài dependencies tự động. Với API/Monorepo, khởi động PostgreSQL, kiểm tra `.env` và chạy `db:push` theo README của project trước khi sử dụng database. CLI không tự thay đổi schema trong database.

`cli` và `library` vẫn có manifest trong registry để dùng cho việc mở rộng sau này, nhưng không xuất hiện trong wizard vì chưa có generator. Gọi chúng trực tiếp sẽ dừng trước khi tạo file.

## Lệnh và tùy chọn

| Lệnh | Chức năng |
| --- | --- |
| `repo --help` | Hiển thị trợ giúp |
| `repo info` | Hiển thị tên và phiên bản CLI |
| `repo create [name]` | Tạo project bằng wizard hoặc tham số |
| `repo doctor` | Kiểm tra `repo.config.yaml` và registry được chỉ định, chỉ đọc |
| `repo agents explain` | Giải thích lựa chọn agent cho một tác vụ trong project đã tạo |
| `repo flows explain` | Chọn flow và giải thích các bước cho một tác vụ trong project đã tạo |

`doctor` kiểm tra cấu hình, không kiểm tra toàn bộ môi trường hay ứng dụng. Thiếu file cấu hình trong thư mục project có sẵn sẽ tạo cảnh báo; đường dẫn project không tồn tại là lỗi. Dùng `--project-root <path>` để kiểm tra project khác thư mục hiện tại và `--registry <path>` để xác thực manifest trong registry; lỗi manifest chỉ rõ trường không hợp lệ. Kết quả gồm mã diagnostic và số lượng passed/warning/error.

```sh
repo doctor --project-root ./my-platform --registry ./registry
```

| Tùy chọn của `create` | Ý nghĩa |
| --- | --- |
| `--type <type>` | Loại project |
| `--preset <id>` | Preset, ví dụ `recommended-web`, `recommended-monorepo` |
| `--target <path>` | Thư mục đích; đặt đường dẫn có khoảng trắng trong ngoặc kép |
| `--auth <provider>` | `custom` hoặc `clerk`; hiện chỉ hỗ trợ cho `monorepo` |
| `--agents <mode>` | `automatic`, `recommended`, `custom` hoặc `none` |
| `--agent <ids>` | Danh sách ID ngăn bằng dấu phẩy khi dùng `--agents custom`, ví dụ `backend,reviewer` |
| `--registry <path>` | Registry thay thế |
| `--yes` | Cho phép ghi file khi chạy không có terminal tương tác |

Trong CI hoặc khi stdin không phải TTY, cần tên, `--type` và `--yes`:

```sh
repo create my-web --type web --preset recommended-web --yes
```

Ở chế độ không tương tác, bỏ `--yes` để xem preview mà chưa ghi file (exit code `2`). `--yes` hiện không tắt wizard trong terminal tương tác.

Agent được chọn từ manifest trong registry và ghi vào `agents.enabled` của `repo.config.yaml`. Codex adapter tạo `AGENTS.md` cùng các file `agents/*.toml`; `none` không tạo các file này khi tạo project. Các vai trò chỉ là hướng dẫn làm việc, không tự khởi chạy agent. Xem [hệ thống agent](docs/agents.md) để dùng mode và lệnh giải thích theo tác vụ.

Flow mặc định của project gồm `feature`, `bugfix`, `design`, `review`. Chạy `repo flows explain --text "Fix broken login"` trong project để xem flow được chọn và từng bước. Dùng `--flow design` để chọn trực tiếp, hoặc `--requires-review` để thêm bước review có điều kiện. `repo agents explain` nhận cùng các tùy chọn và tính thêm agent cần cho flow. Các lệnh giải thích là chỉ đọc; xem [hướng dẫn flow và agent](docs/agents.md).

## Windows / PowerShell

Nếu PowerShell chặn `npm.ps1`, `pnpm.ps1` hoặc `repo.ps1`, dùng launcher `.cmd`:

```powershell
npm.cmd install --global pnpm@10
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
npm.cmd link
repo.cmd create
```

Hoặc cho phép script local đối với tài khoản hiện tại, không cần quyền Administrator:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Nếu không tìm thấy `node` hoặc `repo`, mở lại terminal sau khi cài. Kiểm tra `node --version` và `npm.cmd prefix -g`; thư mục prefix global cần có trong PATH để gọi `repo`.

Nếu thiếu `dist/src/cli/main.js`, chạy `pnpm build` tại thư mục PluginCore.

## Cập nhật và phát triển

Tại thư mục PluginCore:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

Kiểm tra source:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CLI hiện có `create`, `info`, `doctor`, `agents explain`, `flows explain` và trợ giúp. Các tính năng trong tài liệu thiết kế không đồng nghĩa đã được triển khai thành lệnh CLI.

## Tài liệu thiết kế

- [Trạng thái thực tế và checklist Phase 1–6](docs/roadmap-status.md)
- [Các bước và lựa chọn hiện tại của `repo create`](docs/cli-create-wizard.md)
- [Architecture specification](docs/superpowers/specs/2026-09-10-repository-standard-plugin-design.md)
- [CLI and create flow](docs/superpowers/plans/2026-09-11-cli-and-create-flow.md)
- [Extension-driven create pipeline](docs/superpowers/specs/2026-09-17-extension-driven-create-pipeline-design.md)

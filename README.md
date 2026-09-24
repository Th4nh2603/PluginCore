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
2. Với Monorepo, chọn **Recommended Monorepo** hoặc **Custom** làm điểm bắt đầu. Preset điền sẵn React, Express, Prisma và Custom Authentication; bạn có thể đổi từng mục ngay tại menu **Configure stack**. Sau đó chọn **Review** → **Install**, **Edit stack** hoặc **Cancel**. Tham số `--preset recommended-monorepo-clerk` vẫn điền sẵn Clerk.
3. Với Web/API/Empty, chọn **Recommended** hoặc **Custom** theo luồng hiện tại. Các nhóm có thể chọn gồm:

| Nhóm | Lựa chọn | Loại project |
| --- | --- | --- |
| Frontend | React / Vue (Vite + TypeScript) | Web, Monorepo |
| Backend | Express / Fastify (TypeScript) | API, Monorepo |
| ORM | Prisma / Drizzle (PostgreSQL) | API, Monorepo |
| Authentication | Custom / Clerk | Monorepo |

CLI hiển thị bảng tóm tắt cấu hình trước khi tạo. Với Monorepo, có thể quay lại chỉnh một mục mà vẫn giữ preset đã chọn. Các lựa chọn được lưu vào `repo.config.yaml` và dùng để sinh source, dependencies và schema tương ứng.

Custom monorepo có `apps/web`, `apps/api`, `packages/shared`. Với Custom authentication, web có form đăng ký/đăng nhập; với Clerk, điền API keys theo README của project. ORM vẫn được tạo khi dùng Clerk để quản lý dữ liệu ứng dụng.

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
| `repo doctor` | Kiểm tra `repo.config.yaml` trong thư mục hiện tại |

`doctor` kiểm tra cấu hình, không kiểm tra toàn bộ môi trường hay ứng dụng. Thiếu file cấu hình sẽ tạo cảnh báo.

| Tùy chọn của `create` | Ý nghĩa |
| --- | --- |
| `--type <type>` | Loại project |
| `--preset <id>` | Preset, ví dụ `recommended-web`, `recommended-monorepo` |
| `--target <path>` | Thư mục đích; đặt đường dẫn có khoảng trắng trong ngoặc kép |
| `--auth <provider>` | `custom` hoặc `clerk`; hiện chỉ hỗ trợ cho `monorepo` |
| `--registry <path>` | Registry thay thế |
| `--yes` | Cho phép ghi file khi chạy không có terminal tương tác |

Trong CI hoặc khi stdin không phải TTY, cần tên, `--type` và `--yes`:

```sh
repo create my-web --type web --preset recommended-web --yes
```

Ở chế độ không tương tác, bỏ `--yes` để xem preview mà chưa ghi file (exit code `2`). `--yes` hiện không tắt wizard trong terminal tương tác.

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

CLI hiện có `create`, `info`, `doctor` và trợ giúp. Các tính năng trong tài liệu thiết kế không đồng nghĩa đã được triển khai thành lệnh CLI.

## Tài liệu thiết kế

- [Các bước và lựa chọn hiện tại của `repo create`](docs/cli-create-wizard.md)
- [Architecture specification](docs/superpowers/specs/2026-09-10-repository-standard-plugin-design.md)
- [CLI and create flow](docs/superpowers/plans/2026-09-11-cli-and-create-flow.md)
- [Extension-driven create pipeline](docs/superpowers/specs/2026-09-17-extension-driven-create-pipeline-design.md)

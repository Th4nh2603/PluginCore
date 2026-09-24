# MCP trong project do PluginCore tạo

PluginCore có thể sinh một MCP server **ngay trong project API hoặc Monorepo**. Server này chạy bằng stdio khi một MCP host (ví dụ Codex) khởi động lệnh `pnpm mcp`. Nó không cần HTTP API đang chạy và không mở cổng mạng. Bản mẫu có một tool chỉ đọc: `get_health`, trả về `{"status":"ok"}` từ cùng hàm `getHealth()` mà route HTTP `GET /health` dùng.

## Bật MCP khi tạo project

Trong wizard, dùng phím ↑/↓ và Enter. API hỏi **Include MCP server?**; Monorepo có dòng **MCP: Off/On** ở **Configure stack**. Giá trị mặc định là Off, kể cả khi dùng Recommended. Muốn tạo bằng lệnh:

```sh
repo create my-api --type api --preset recommended-api --capability mcp-server --yes
repo create my-platform --type monorepo --preset recommended-monorepo --capability mcp-server --yes
```

Tham số `--capability mcp-server` chỉ hỗ trợ `api` và `monorepo`. Với Monorepo, capability xác thực (`auth-custom` hoặc `auth-clerk`) vẫn được giữ. Kiểm tra `composition.capabilities` trong `repo.config.yaml`: nó phải có `id: mcp-server`, `version: 1.0.0`. Project không bật MCP không có tiến trình hoặc dependency MCP.

## File và lệnh được sinh

| API | Monorepo | Vai trò |
| --- | --- | --- |
| `src/health.ts` | `apps/api/src/health.ts` | Hàm `getHealth()` dùng chung cho HTTP và MCP |
| `src/mcp/server.ts` | `apps/api/src/mcp/server.ts` | Đăng ký tool, chạy MCP stdio |
| `package.json` | `apps/api/package.json` | Dependency MCP và script `mcp` chạy file đã build |
| — | `package.json` ở root | Script `mcp` gọi workspace API |
| `README.md` | `README.md`, `AGENTS.md`, `agents/backend.toml`, `agents/reviewer.toml` | Hướng dẫn kết nối và làm việc |

Sau khi tạo, chạy tại **root của project mới**:

```sh
cd my-api                 # hoặc my-platform
pnpm build
pnpm mcp
```

`pnpm mcp` là tiến trình stdio chờ MCP host; chạy riêng trong terminal sẽ không hiện menu hay giao diện. Khi thử thủ công, nhấn Ctrl+C để dừng. Sau khi sửa `src/mcp/server.ts` hoặc `src/health.ts`, chạy lại `pnpm build` trước khi host kết nối lại.

## Kết nối Codex

Thêm cấu hình sau vào `config.toml` của Codex. Thay `cwd` bằng **đường dẫn tuyệt đối** đến root của project vừa tạo, không phải thư mục PluginCore:

```toml
[mcp_servers.project_app]
command = "pnpm"
args = ["mcp"]
cwd = "/absolute/path/to/generated-project"
```

Chạy `pnpm build` trong project trước. Sau khi khởi động lại phiên Codex, dùng `codex mcp list` hoặc `/mcp` để kiểm tra server `project_app`. Có thể hỏi agent: “Dùng tool `get_health` của `project_app` và cho tôi biết trạng thái ứng dụng.” Kết quả mẫu là `{"status":"ok"}`. Bạn có thể đặt cấu hình ở cấp người dùng hoặc trong cấu hình project được Codex tin cậy; PluginCore không tự sửa cấu hình host.

## Agent trong Monorepo sử dụng MCP thế nào

`AGENTS.md` và các file `agents/*.toml` là **hướng dẫn công việc**, không phải tiến trình MCP client. MCP host đọc cấu hình trên, khởi chạy `pnpm mcp`, nhận danh sách tool và quyết định khi nào cho agent gọi chúng. Backend/reviewer agent có thể dùng `get_health` sau khi host đã kết nối, nhưng file role không tự cấp quyền hay khởi chạy server. Tool đầu tiên không truy cập xác thực, database, secret hoặc filesystem.

## Thêm tool ứng dụng

Đặt logic cần dùng chung vào một module service và import module đó từ cả HTTP route lẫn `src/mcp/server.ts` (Monorepo: `apps/api/src/mcp/server.ts`). Ví dụ, nếu `../services/status.js` xuất `getPublicStatus()` chỉ trả dữ liệu công khai, đăng ký thêm ngay sau `get_health`:

```ts
server.registerTool("get_public_status", {
  description: "Read public application status",
  inputSchema: z.object({})
}, async () => ({
  content: [{ type: "text", text: JSON.stringify(getPublicStatus()) }]
}));
```

Thêm import `getPublicStatus` tương ứng, chạy `pnpm build`, rồi kết nối lại host. Tool xử lý dữ liệu riêng tư hoặc thay đổi trạng thái cần tự thiết kế kiểm soát quyền và xác nhận phù hợp; bản mẫu chỉ chứng minh đường kết nối với tool chỉ đọc.

## Xử lý lỗi thường gặp

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không tìm thấy `dist/mcp/server.js` | Chạy `pnpm build` tại root project sau khi tạo hoặc sửa source. |
| Host không khởi chạy được | Kiểm tra `cwd` là đường dẫn tuyệt đối đến đúng project và `pnpm` có trong PATH của môi trường host. |
| `codex mcp list` không thấy server | Kiểm tra nơi đặt `config.toml`, độ tin cậy/cấu hình project, rồi mở phiên Codex mới. |
| Lỗi parse giao thức stdio | Không ghi log ra stdout trong `server.ts` hay module được import; dùng stderr cho chẩn đoán. |
| Tool chưa có sau khi thêm code | Build lại và kết nối lại host; kiểm tra tên tool trong `registerTool`. |

MCP server trong bản này chỉ chạy cục bộ qua stdio. Nó không thay thế API HTTP, không tự tạo endpoint MCP từ xa và không làm các agent nhìn thấy tool nếu host chưa cấu hình kết nối.

Tham khảo thêm: [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/) và [Codex MCP](https://developers.openai.com/codex/mcp).

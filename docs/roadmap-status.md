# Trạng thái roadmap Phase 1–6

Đối chiếu ngày 2026-09-29 với `main` sau khi merge Phase 4, Phase 6 và phần khép kín Phase 1–4. Dấu `[x]` trong plan nghĩa là có bằng chứng từ code, kiểm thử hoặc commit; bước yêu cầu kiểm thử RED lịch sử vẫn để `[ ]` nếu không tìm được bằng chứng về đúng trình tự đó. Điều này không phủ nhận chức năng hiện đang chạy.

| Phase | Trạng thái chức năng | Bằng chứng | Phần chưa khép kín trong tài liệu/plan |
| --- | --- | --- | --- |
| 1 — Architecture | Đặc tả kiến trúc đã có và được dùng cho các phase sau; đã có technical review. | [Architecture spec](superpowers/specs/2026-09-10-repository-standard-plugin-design.md), [review](superpowers/reviews/2026-09-28-phase-1-architecture-review.md) | Quyết định approve của chủ repo vẫn đang chờ; technical review không thay thế quyết định đó. |
| 2 — Core scaffold | Hoàn thành. Tooling, typed contracts, config parser, registry loader, resolver contracts, validation và path guard đều có test. | [Core scaffold plan](superpowers/plans/2026-09-11-core-scaffold.md), commit `32312eb` | Không thấy đầu việc chức năng còn mở trong phạm vi Phase 2. |
| 3 — CLI foundation | Help, `info`, read-only `doctor`, diagnostics và fixtures đã có; `doctor` nhận `--project-root` và `--registry`, kiểm tra độc lập và in summary. | `src/cli/`, `src/application/doctor-service.ts`, `tests/cli/`, `tests/application/doctor-service.test.ts` | Các bước RED lịch sử ban đầu chưa được xác minh; thay đổi doctor mới có RED→GREEN được ghi trong kiểm thử. |
| 4 — Create flow | Đã merge. Interactive/non-interactive create, preview, generator, atomic config/state writes, verification, rollback và managed-file hashes có test. | [Create pipeline plan](superpowers/plans/2026-09-17-extension-driven-create-pipeline.md), [Monorepo generator](superpowers/plans/2026-09-14-monorepo-generator.md), [auth core](superpowers/plans/2026-09-14-auth-core.md), [auth web](superpowers/plans/2026-09-14-auth-web.md), [wizard](superpowers/plans/2026-09-24-unified-create-wizard.md); commits `c8cbdec`, `365ce93` | PTY Cancel/Install và build API/Web mới sinh đã được xác minh ở phần dưới. Các bước RED lịch sử và sai khác tên module so với plan vẫn được ghi nhận. |
| 5 — Agent system | Catalog, resolver, bốn mode, Codex adapter và `agents explain` đã có. | [Agent guide](agents.md), `src/core/resolver/agent-resolver.ts`, commit `6c86e99` | Chạy agent tự động không thuộc Phase 5. |
| 6 — Flow system | Đã merge. Bốn manifest flow, selection, giải thích bước và tích hợp agent expertise có test. | [Flow plan](superpowers/plans/2026-09-28-flow-system.md), merge commit `98af304` | Flow hiện lập kế hoạch và giải thích, chưa thực thi agent; đó là giới hạn thiết kế Phase 6. |

Kiểm tra trên bản `main` sau phần mở rộng tạo user ban đầu: lint, typecheck, build và 209 test qua. Bản vá an toàn khi tạo repo và spec/plan username đã được merge trước đó; luồng username được triển khai tiếp trực tiếp trên `main` theo yêu cầu ngày 2026-09-29.

Các mục Phase 7 trở đi trong [roadmap gốc](superpowers/specs/2026-09-10-repository-standard-plugin-design.md#19-implementation-roadmap) là phạm vi tiếp theo, không được tính là thiếu của Phase 1–6.

## Xác minh bổ sung cho Phase 3–4

- `repo doctor --project-root <generated-project> --registry registry`: `CONFIG_VALID`, `REGISTRY_VALID`, summary 2 passed/0 warnings/0 errors.
- `repo doctor --project-root <missing>` trả `CONFIG_INVALID` và exit 1; manifest registry sai nêu rõ trường không hợp lệ trong diagnostic. Hai trường hợp có kiểm thử RED→GREEN.
- PTY với `node bin/repo.cjs`: Recommended → Frontend Vue → Review → Cancel trả mã 2 và không tạo thư mục.
- PTY với `runCli` thật và generator runner giả lập: cùng lựa chọn → Install trả mã 0, `repo.config.yaml` giữ preset và ghi Vue; managed state được tạo.
- Monorepo Custom Authentication tạo thật với Node 22.22.1 và pnpm 10.34.5; `pnpm --filter ./apps/api build`, `pnpm --filter ./apps/web build` và API test 2/2 đều qua sau khi cài dependencies.

## Mở rộng sau Phase 1–6: initial username account

Wizard Monorepo với Custom Authentication hỏi username và mật khẩu ẩn sau Install. File hash scrypt dùng một lần nằm ngoài config và managed state, được Git bỏ qua; API tạo user trước khi lắng nghe. [Plan triển khai](superpowers/plans/2026-09-28-initial-username-account.md) ghi các ca kiểm thử và xác minh PostgreSQL thật trên cả generator Recommended lẫn Custom. Các project đã sinh trước thay đổi này không được di trú tự động.

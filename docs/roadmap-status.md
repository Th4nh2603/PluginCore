# Trạng thái roadmap Phase 1–6

Đối chiếu ngày 2026-09-28 với `main` sau khi merge Phase 4 và Phase 6. Dấu `[x]` trong plan nghĩa là có bằng chứng từ code, kiểm thử hoặc commit; bước yêu cầu kiểm thử RED lịch sử vẫn để `[ ]` nếu không tìm được bằng chứng về đúng trình tự đó. Điều này không phủ nhận chức năng hiện đang chạy.

| Phase | Trạng thái chức năng | Bằng chứng | Phần chưa khép kín trong tài liệu/plan |
| --- | --- | --- | --- |
| 1 — Architecture | Đặc tả kiến trúc đã có và được dùng cho các phase sau. | [Architecture spec](superpowers/specs/2026-09-10-repository-standard-plugin-design.md) | Không tìm thấy biên bản hoặc commit ghi rõ quyết định review/approve Phase 1. |
| 2 — Core scaffold | Hoàn thành. Tooling, typed contracts, config parser, registry loader, resolver contracts, validation và path guard đều có test. | [Core scaffold plan](superpowers/plans/2026-09-11-core-scaffold.md), commit `32312eb` | Không thấy đầu việc chức năng còn mở trong phạm vi Phase 2. |
| 3 — CLI foundation | Help, `info`, read-only `doctor`, diagnostics và fixtures đã có. | `src/cli/`, `src/application/doctor-service.ts`, `tests/cli/`, `tests/application/doctor-service.test.ts` | Plan chi tiết còn yêu cầu `doctor --project-root`, `--registry`, registry diagnostics và summary counts; CLI hiện chỉ kiểm tra config ở thư mục hiện hành. Các bước RED lịch sử chưa được xác minh. |
| 4 — Create flow | Đã merge. Interactive/non-interactive create, preview, generator, atomic config/state writes, verification, rollback và managed-file hashes có test. | [Create pipeline plan](superpowers/plans/2026-09-17-extension-driven-create-pipeline.md), [Monorepo generator](superpowers/plans/2026-09-14-monorepo-generator.md), [auth core](superpowers/plans/2026-09-14-auth-core.md), [auth web](superpowers/plans/2026-09-14-auth-web.md), [wizard](superpowers/plans/2026-09-24-unified-create-wizard.md); commits `c8cbdec`, `365ce93` | Các bước RED lịch sử và bài thử PTY thủ công chưa được xác minh. Chưa có bằng chứng trong audit này về build sau cài dependencies của API/Web mới sinh; tên module thực tế khác tên dự kiến trong plan. |
| 5 — Agent system | Catalog, resolver, bốn mode, Codex adapter và `agents explain` đã có. | [Agent guide](agents.md), `src/core/resolver/agent-resolver.ts`, commit `6c86e99` | Chạy agent tự động không thuộc Phase 5. |
| 6 — Flow system | Đã merge. Bốn manifest flow, selection, giải thích bước và tích hợp agent expertise có test. | [Flow plan](superpowers/plans/2026-09-28-flow-system.md), merge commit `98af304` | Flow hiện lập kế hoạch và giải thích, chưa thực thi agent; đó là giới hạn thiết kế Phase 6. |

Kiểm tra trên bản `main` vừa merge: lint, typecheck, build và 185 test qua. Sau khi khôi phục 8 file chỉnh sửa cục bộ có từ trước, checkout hiện tại qua 191 test cùng các kiểm tra trên. Các file cục bộ đó chưa được commit; `main` cũng chưa được push lên `origin/main`.

Các mục Phase 7 trở đi trong [roadmap gốc](superpowers/specs/2026-09-10-repository-standard-plugin-design.md#19-implementation-roadmap) là phạm vi tiếp theo, không được tính là thiếu của Phase 1–6.

# Claude Code built-in design skills (xuất từ v2.1.226; `design/` xuất từ v2.1.247)

Các skill built-in của Claude Code được nhúng trong binary, không có file rời trên đĩa.
Thư mục này là bản xuất nguyên văn để đọc và tham khảo.

## Nội dung

- `artifact-design.md` — Nguyên tắc thiết kế nền tảng cho Artifacts: đọc yêu cầu để chọn mức treatment, typography, palette, dark/light theme tokens, layout/spacing, tránh "AI-generated look", viết copy, và quy trình lập design plan trước khi code.
- `artifact-diagramming.md` — Khi nào một diagram đáng vẽ, vẽ cơ chế thay vì cái tên, và kỹ thuật inline SVG (viewBox, currentColor, marker, grid, accessibility).
- `dataviz/` — Skill trực quan hóa dữ liệu đầy đủ:
  - `SKILL.md` — quy trình 7 bước (chọn form → gán màu theo vai trò → validate palette → mark specs → hover layer → accessibility → render và nhìn lại) + các quy tắc bất di bất dịch.
  - `references/` — 7 file tham khảo chi tiết: chọn loại chart, công thức màu, mark specs, tương tác, components, anti-patterns, và palette mẫu đã validate.
  - `scripts/validate_palette.js` / `validate_palette.py` — script kiểm tra palette (colorblind-safety, contrast, lightness band) chạy được bằng Node hoặc Python.
- `design/` — Skill `/design` (Claude Design canvas editor, bản preview trong Claude Code):
  - `SKILL.md` — quy trình 6 bước (match app hiện có pixel-perfect → viết artboard `.dc.html` → seed payload bằng helper → `--check` → publish Artifact với `contract: "0.1.31"` → bàn giao), cấu trúc `canvas.json` (artboards, annotations, pages, launch), format Design Component (`<x-dc>`, `{{holes}}`, `<sc-for>`/`<sc-if>`, `data-props` tweaks, `DCLogic`), craft (chốt aesthetic với user, variations, landing page, print, mobile), Quick syntax card, Known limits, cách nói chuyện với user, và Foundation (no-egress iframe, save = publish, CAS conflict, untrusted state, content rules, AI-slop tropes).
  - `seed-canvas.mjs` — helper Node/Bun: seed artboards + images + canvas.json vào bản copy payload (`--template … --out … --title … --artboard … --image … --canvas …`), kiểm tra file đã seed (`--check`), và trích ngược artboards từ canvas đã publish (`--extract … --to …`).
  - `payload.template.html` — editor payload đã precompile (~2.4 MiB, minified). **Không đọc vào context**; chỉ dùng làm `--template` cho helper.
  - `LOCAL-EDIT.md` + `make-local.mjs` — **bổ sung của team, không thuộc skill gốc**: cách chạy canvas đã seed ở local với chế độ edit đầy đủ bằng shim `window.claude.self.publish`, hợp đồng `publish(page)` để tự làm tính năng lưu.

## Skill design khác trên máy (không nằm trong thư mục này)

- `frontend-design` (plugin chính thức của Anthropic):
  `~/.claude/plugins/cache/claude-plugins-official/frontend-design/236752ad9ab3/skills/frontend-design/SKILL.md`

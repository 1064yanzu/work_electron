# Web Prototype Layouts

## Hero 模式

- **Editorial Hero**：左大字标题（serif） + 右产品截图，参考 Stripe / Anthropic
- **Tight Manifesto**：纯文字 hero，center align，参考 Linear / Cursor
- **Split Demo**：左文案右交互 demo（CSS only），参考 Vercel

## Section 节奏

- 章节之间 `padding-block: clamp(64px, 8vw, 128px)`
- 重要 section 用 `<section data-style="manifesto">` 标注 + 左/右 boundary 线
- 数据 section 用 monospace 数字 + 渐增高亮

## Grid 系统

- 桌面 12 列，sidebar 2-3 列 + main 9-10 列
- 卡片网格：`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`

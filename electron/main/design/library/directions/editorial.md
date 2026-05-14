# Direction: editorial

杂志式编辑，叙事性强，留白慷慨。

## Mood

像 The New Yorker × Bloomberg Businessweek × 一份精装期刊。重度排印（typography-led），文字本身是主角；用栅格 + 大留白让重要内容自带仪式感。

## Palette (OKLch)

- `--bg`: `oklch(0.97 0.005 90)`   — 米白纸
- `--fg`: `oklch(0.20 0.02 80)`    — 深炭墨
- `--accent`: `oklch(0.55 0.18 25)` — 编辑红 (用于副标 / 引文 / 序号)
- `--muted`: `oklch(0.55 0.01 90)` — 灰

## Typography

- Display: **"Tiempos Headline"** / fallback `Georgia, "Source Serif Pro", serif`
- Body: **"Tiempos Text"** / fallback `Georgia, "Source Serif Pro", serif`
- 等宽: `JetBrains Mono`，用于注脚 / 引用 / 数据

H1 用 64–96px，行高 1.05；正文用 16–18px，行高 1.6，最大宽 65ch。

## Posture (做什么 / 不做什么)

- ✅ 大首字下沉（drop cap）、栏内引文、罗马数字编号
- ✅ 慷慨的章节间距（mt-32），让内容自然呼吸
- ✅ 黑白 + 1 个强调色，避免多色干扰
- ❌ 不做卡片、不做 hover 浮起、不做渐变背景
- ❌ 不要 sans-serif 主标题（除非用作 Eyebrow）

## References

- The New Yorker, Bloomberg Businessweek, Aesop, MacKenzie-Childs, Slowdown 杂志

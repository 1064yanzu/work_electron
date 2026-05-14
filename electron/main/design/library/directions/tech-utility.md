# Direction: tech-utility

机器界面、密集数据、终端美学。Bloomberg Terminal × IDE × 控制台。

## Mood

「这是给专业用户的工作工具」。深色背景 + 等宽字 + 表格 + 高密度信息 + 状态徽章。审美来自 IDE / 系统监控 / 量化金融终端，不为美而美。

## Palette (OKLch)

- `--bg`: `oklch(0.13 0.01 250)`    — 深炭
- `--fg`: `oklch(0.92 0.003 250)`   — 米雾
- `--accent`: `oklch(0.72 0.18 145)` — 信号绿（终端经典）
- `--muted`: `oklch(0.50 0.01 250)` — 中性
- `--warning`: `oklch(0.75 0.17 70)`  — 琥珀
- `--error`: `oklch(0.65 0.22 25)`    — 警示红

## Typography

- Display & Body: **"JetBrains Mono"** / fallback `ui-monospace, "SF Mono", monospace`
- 偶尔混搭 sans：`"Inter"` for 标题 + 注解

字号一律 13–15px；行高 1.4；title 用 16–20px。

## Posture

- ✅ 网格 + 表格主导布局；用 ASCII box drawing `─│┌┐└┘` 做分割也行
- ✅ 状态徽章短而硬：`[ READY ]` `[ ERROR ]` `[ 12.3K req/s ]`
- ✅ 数字单位严格；千分位、缩写（K/M/B）、单位（ms / req/s）
- ✅ Hover / focus 用 1px 强调色边框 + 微闪烁
- ❌ 不做圆角 > 4px，不做柔和阴影，不做"友好"插画
- ❌ 不要装饰性 emoji

## References

- Bloomberg Terminal, htop, Sentry, Datadog, GitHub Actions logs, Cursor command palette

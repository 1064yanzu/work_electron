---
title: Linear
category: SaaS
swatches: ["#5E6AD2", "#0D0D0D", "#F4F5F8", "#9E9EA8"]
summary: 工程师工作管理工具的设计语言：紫色锚点 + Inter + 严格 8px 网格 + 深色优先
---

# Linear DESIGN.md

## 调色板

- `--bg-light`: `#FFFFFF` 雾白
- `--bg-dark`: `oklch(0.13 0.005 268)` 深炭
- `--fg-light`: `oklch(0.20 0.01 268)`
- `--fg-dark`: `oklch(0.96 0.003 268)`
- `--accent`: **`#5E6AD2`**（Linear 紫，主品牌色，仅用于 CTA / 链接 / focus / 关键操作）
- `--surface-light`: `#F4F5F8`
- `--surface-dark`: `oklch(0.16 0.005 268)`
- `--border-light`: `oklch(0.92 0.005 268)`
- `--border-dark`: `oklch(0.22 0.005 268)`
- `--muted`: `#9E9EA8`

支持深色模式默认（`prefers-color-scheme: dark`）；深色模式更"Linear"。

## 字体

- Display & Body: `"Inter"`, `-apple-system`, sans-serif
- 等宽: `"Berkeley Mono"`, `"JetBrains Mono"`, monospace
- H1: `clamp(36px, 5vw, 56px)` weight 600 tracking -0.02em
- Body: 14-15px line-height 1.5

## 间距 & 形状

- 严格 8px 网格：spacing 用 `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`
- 圆角：按钮 6px / 卡片 8px / 模态 12px（**不要 16px+**）
- 边框：1px solid border-light/dark
- 阴影：极克制，只一档 `0 1px 2px rgba(0,0,0,0.04)`

## 组件态度

- 按钮：方块 + 内边距 8/16 + 1px border + hover 加深 4% 亮度（不浮起）
- 输入框：1px border + focus 时 ring `0 0 0 2px var(--accent)` 30%
- 表格：行高 36px，hover 行变浅；不要 stripe
- 命令面板：⌘K 唤起；ESC 关闭；箭头键导航

## 反 AI Slop（专属）

- ❌ 不要紫色渐变（这是 Linear 紫的固定单色）
- ❌ 不要圆角胶囊按钮（这是 Claude/Vercel 风）
- ❌ 不要 emoji 装饰；用 lucide-style stroke 1.5px icon

## References

linear.app / Plan & Track / Cycles UI / Pulse 仪表板

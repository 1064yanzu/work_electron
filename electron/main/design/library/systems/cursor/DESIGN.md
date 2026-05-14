---
title: Cursor
category: DevTool
swatches: ["#000000", "#FFFFFF", "#7C5CFF", "#9F9F9F"]
summary: AI Code Editor 深色 + 紫色 accent + 等宽细节
---

# Cursor DESIGN.md

## 调色板

- `--bg`: `#000000` 默认深色
- `--fg`: `#FFFFFF`
- `--accent`: `#7C5CFF` Cursor 紫
- `--accent-soft`: `oklch(0.45 0.1 290)`
- `--surface`: `oklch(0.10 0.005 290)`
- `--border`: `oklch(0.22 0 0)`
- `--muted`: `#9F9F9F`

## 字体

- Display: `"Inter"`, sans-serif
- Body: `"Inter"`, sans-serif
- 等宽: `"JetBrains Mono"`, monospace
- H1: `clamp(40px, 6vw, 72px)` weight 600 tracking -0.02em

## 间距 & 形状

- 8px 网格
- 圆角：按钮 8px / 卡片 12px / 输入 8px
- 阴影：`0 0 60px rgba(124, 92, 255, 0.15)` 在重点区域（光晕感）
- 边框：1px subtle，颜色 muted

## 组件态度

- 代码块占主导：浅紫色高亮 + 行号 + diff 着色
- 终端 / chat：等宽字 + 紫色光标
- 按钮：圆角 + 渐变（紫到深紫的 subtle）+ 白字
- 在 hero 用 video / WebGL 演示而非静态图

## 反 AI Slop

- ✅ Cursor 风允许 subtle 渐变（紫到深紫，黑到深灰）
- ❌ 但不要紫色全屏 hero（已经过时）
- ❌ 不要 sparkle emoji（避免 AI cliché）

## References

cursor.com / Code editor screenshots / Composer demo

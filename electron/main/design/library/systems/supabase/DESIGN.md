---
title: Supabase
category: DevTool
swatches: ["#3ECF8E", "#1C1C1C", "#FFFFFF", "#A0A0A0"]
summary: 绿色霓虹 + 深色 + Open Source 的 indie hacker 美学
---

# Supabase DESIGN.md

## 调色板

- `--bg`: `#1C1C1C` 默认深色
- `--fg`: `#FFFFFF`
- `--accent`: `#3ECF8E` Supabase 绿
- `--accent-glow`: `rgba(62, 207, 142, 0.4)`
- `--surface`: `oklch(0.16 0.005 160)`
- `--border`: `oklch(0.22 0.005 160)`
- `--muted`: `#A0A0A0`

## 字体

- Display & Body: `"Inter"`, sans-serif
- 等宽: `"JetBrains Mono"`, monospace
- H1: 48-72px weight 700

## 间距 & 形状

- 4-8px 网格
- 圆角：按钮 6px / 卡片 8-12px
- 阴影：用绿色光晕 `0 0 40px rgba(62, 207, 142, 0.2)`
- 边框：1px subtle

## 组件态度

- 数据库表 UI 是核心：表格 + 行编辑 + SQL editor
- 按钮：绿色实心 + 黑字（高对比）
- 代码块：等宽 + 行号 + 复制按钮
- Sparkle / glow 用得克制，仅在 hero CTA

## 反 AI Slop

- ❌ 不要紫色（与 Linear 区分开）
- ❌ 不要 SaaS hero gradient
- ✅ Supabase 允许绿色光晕作为品牌识别

## References

supabase.com / Dashboard / Database UI / Vector docs

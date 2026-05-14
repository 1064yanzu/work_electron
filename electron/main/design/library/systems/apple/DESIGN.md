---
title: Apple (Human Interface)
category: OS
swatches: ["#007AFF", "#1D1D1F", "#F5F5F7", "#86868B"]
summary: SF Pro + Apple 蓝 + 系统模糊 + 极致圆润
---

# Apple HIG DESIGN.md

## 调色板

- `--bg`: `#FFFFFF` / `#000000` 深色
- `--fg`: `#1D1D1F` / `#F5F5F7`
- `--accent`: `#007AFF` iOS 蓝（System Blue）
- `--surface`: `#F5F5F7`
- `--border`: `oklch(0.93 0.003 250)`
- `--muted`: `#86868B`

支持系统色 token：System Red / Green / Orange / Yellow 等用于状态。

## 字体

- Display & Body: `"SF Pro Display"`, `"SF Pro Text"`, `-apple-system`, sans-serif
- 数字字: 用 SF Pro 自带的 tabular nums
- H1: 用 `font-weight: 700` + 拉到 56-80px

## 间距 & 形状

- 8px / 4px 网格
- 圆角：按钮 8-12px / 卡片 14-20px / 模态 24px
- 阴影：`0 4px 16px rgba(0,0,0,0.08)`
- 边框：1px hairline border

## 组件态度

- 按钮：圆角 + filled / tinted / plain 三种态度，filled 用 accent
- 列表：iOS 风分组列表（圆角组）+ 行间淡分隔线
- Modal：底部 sheet 或居中 modal，圆角 24px + 模糊背景
- 大量使用 `backdrop-filter: blur(20px) saturate(180%)` 做毛玻璃
- 微动效：transition 0.3s cubic-bezier(0.4, 0, 0.2, 1)

## 反 AI Slop

- ❌ 不要 Material Design 元素（涟漪 / FAB）
- ❌ 不要 web design tropes（巨 hero CTA）
- ❌ 不要 emoji 当 icon；用 SF Symbols 风格 SVG

## References

apple.com / iOS 17 / macOS Sonoma / Final Cut Pro UI / Human Interface Guidelines

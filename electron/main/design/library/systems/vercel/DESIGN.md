---
title: Vercel
category: DevTool
swatches: ["#000000", "#FFFFFF", "#0070F3", "#666666"]
summary: 极简黑白 + Inter + 严格栅格；DevOps 工具的克制美学
---

# Vercel DESIGN.md

## 调色板

- `--bg`: `#000000`（深色模式默认）或 `#FFFFFF`
- `--fg`: `#FFFFFF` / `#000000`
- `--accent`: `#0070F3`（Vercel 蓝，仅用于链接 / focus / 关键 CTA）
- `--border`: `oklch(0.22 0 0)` 深色 / `oklch(0.92 0 0)` 浅色
- `--muted`: `#666666` / `#999999`

> Vercel 的本质是「无色」：黑白是主色，蓝色非常稀缺。

## 字体

- Display & Body: `"Inter"`, `-apple-system`, sans-serif
- 等宽: `"Geist Mono"`, `"JetBrains Mono"`, monospace
- H1: `clamp(48px, 8vw, 96px)` weight 700 tracking -0.03em
- Body: 16px line-height 1.5

## 间距 & 形状

- 8px 网格但更松（垂直留白慷慨）
- 圆角：按钮 6px / 卡片 6-8px / 模态 12px
- 边框：1px，颜色 muted
- 阴影：**不用**；用 border 替代

## 组件态度

- 按钮：黑底白字（或反之）+ hover 变 #333；CTA 用蓝
- 表格：纯线条 + 等宽数据列
- 图表：极简，黑白线条 + 蓝色折线
- 代码块：等宽 + 浅灰背景 + 行号

## 反 AI Slop

- ❌ 不要任何渐变
- ❌ 不要 hero 大图
- ❌ 不要彩色装饰，蓝色仅服务功能

## References

vercel.com / Dashboard / Analytics / Edge Functions docs

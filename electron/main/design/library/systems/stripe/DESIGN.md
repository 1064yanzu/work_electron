---
title: Stripe
category: SaaS
swatches: ["#635BFF", "#0A2540", "#FFFFFF", "#425466"]
summary: 金融级精致：靛紫品牌色 + Sohne / Inter 字体 + 严谨数据呈现
---

# Stripe DESIGN.md

## 调色板

- `--bg`: `#FFFFFF` / `#0A2540`（深色）
- `--fg`: `#0A2540` / `#FFFFFF`
- `--accent`: `#635BFF`（Stripe 靛紫，主品牌色）
- `--accent-soft`: `#A4ABFF`
- `--surface`: `#F6F9FC`（极浅蓝灰）
- `--border`: `#E3E8EE`
- `--muted`: `#425466`

## 字体

- Display: `"Sohne"`, `"Inter"`, sans-serif
- Body: `"Sohne"`, `"Inter"`, sans-serif
- 数字字: 用 `font-variant-numeric: tabular-nums` 保证对齐
- H1: `clamp(40px, 5.5vw, 64px)` weight 500 tracking -0.02em

## 间距 & 形状

- 4px 微网格（比 Linear / Vercel 更精细）
- 圆角：按钮 4px / 卡片 8px / 输入 4px
- 阴影：极柔和 + 微蓝色调 `0 4px 12px rgba(50, 50, 93, 0.08)`
- 边框：1px solid border，hover 时深一档

## 组件态度

- 按钮：圆角 4px + 紫色 + 微微 gradient（顶部亮 2% 底部暗 2%）
- 数据卡片：白底 + 1px border + 4px 圆角；数字超大（48-64px）weight 500
- 表单：清晰分组 + 浮动标签
- 图表：折线柔和（stroke 2px）+ 区域填充用 accent 10% 透明
- 代码：用浅蓝高亮关键字

## 反 AI Slop

- ❌ 不要 web design tropes 大 hero
- ❌ 不要红色（除非是 error）；Stripe 不用 red 做品牌色
- ❌ 不要 emoji；用细线 icon

## References

stripe.com / Dashboard / Atlas / Billing docs / Connect onboarding

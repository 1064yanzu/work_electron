---
title: Claude (Anthropic)
category: AI
swatches: ["#D96C46", "#F7F3EE", "#1A1A19", "#7C7C75"]
summary: 奶油 + 赤陶橙；克制、人文、像翻一本书
---

# Claude DESIGN.md

## 调色板

- `--bg`: `#F7F3EE` 奶油（Claude.ai / Anthropic 官网底色）
- `--fg`: `#1A1A19` 暖墨
- `--accent`: **`#D96C46`** 赤陶橙（Anthropic 品牌色）
- `--accent-hover`: `#C75A35`
- `--surface`: `#FFFEFB`（比 bg 略浅；浮层 / 卡片）
- `--border`: `oklch(0.92 0.01 60)`
- `--muted`: `#7C7C75`

## 字体

- Display & Body: `"Inter"`, `system-ui`, sans-serif（or `"Source Serif Pro"` 衬线变体）
- 等宽: `"JetBrains Mono"`, ui-monospace
- H1: `clamp(32px, 4vw, 48px)` weight 500 tracking -0.01em
- Body: 16px line-height **1.65**（比 SaaS 行高更松，书卷气）

## 间距 & 形状

- 8px 网格但偏松（间距偏向 16 / 24 / 32）
- 圆角：按钮全圆 (pill, border-radius: 9999px) / 卡片 12-16px / 输入 8-12px
- 阴影：柔和 `0 4px 12px 0 rgb(26 26 25 / 0.06)`
- 边框：1px solid border，颜色低对比

## 组件态度

- 按钮：pill 形状（rounded-full）+ accent 背景 + hover 加深
- 输入框：12px 圆角 + 浅灰底（surface）+ focus 时 1px accent border
- 卡片：圆角 12-16px + 极浅阴影 + 不要 stripe
- 引文：左侧 3px accent border + italic + 浅灰背景

## 反 AI Slop

- ❌ 不要除赤陶橙外的强色；其余一律走 fg/muted
- ❌ 不要尖角（圆角是标志）
- ❌ 不要密集网格；要慷慨留白
- ❌ 不要 emoji（除了用户内容引用）

## 关键参考语句

"克制、精准、有呼吸感。" "审美是用户体验的一部分。"

## References

claude.ai / anthropic.com / Constitutional AI 论文 / Acceptable Use

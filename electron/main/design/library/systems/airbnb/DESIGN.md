---
title: Airbnb
category: Consumer
swatches: ["#FF385C", "#222222", "#F7F7F7", "#717171"]
summary: Rausch 红 + Cereal 字体 + 圆润卡片 + 高清照片驱动
---

# Airbnb DESIGN.md

## 调色板

- `--bg`: `#FFFFFF`
- `--fg`: `#222222`
- `--accent`: `#FF385C` Airbnb Rausch 红
- `--accent-2`: `#FF5A5F` 旧 Rausch（已少用）
- `--surface`: `#F7F7F7`
- `--border`: `#DDDDDD`
- `--muted`: `#717171`

## 字体

- Display & Body: `"Airbnb Cereal"`, `"Inter"`, sans-serif（自家定制字体；fallback Inter）
- H1: 32-48px weight 700 tracking -0.01em
- Body: 16px line-height 1.5

## 间距 & 形状

- 8px 网格
- 圆角：卡片 12-16px / 按钮 8-12px / 图片大块 16-24px
- 阴影：`0 6px 16px rgba(0,0,0,0.12)`（hover 时）
- 边框：1px border 用于分隔

## 组件态度

- Listing card：大图 + 圆角 12px + 收藏 ❤️ 在右上 + 多图卡片轮播
- 按钮：圆角 8-12px + 黑底白字主按钮 + Rausch 红作为 "Reserve" 主 CTA
- 评分：1-5 星 + 数字（带 1 位小数）
- 大量使用 `<img>` 高质图，aspect-ratio 严格

## 反 AI Slop

- ❌ 不要 SaaS 风落地页
- ❌ 不要紫色 / 蓝色（Airbnb 是 Rausch 红的世界）
- ❌ 不要 emoji；除非用户内容里的 host name

## References

airbnb.com / Listings / Wishlists / Experiences page / Trips

# Web Prototype Checklist

## P0 — 必查（违反必须重做）
- 禁紫色渐变 hero (`linear-gradient(135deg, #6366f1, #a855f7)` 之流)
- 禁客户 logo 灰阶矩阵（除非用户明确要求 "logo wall"）
- 禁 sparkle / star-burst icon 装饰
- 禁 Bootstrap card / Material card 的"卡片堆叠"布局
- 三个断点必须分别重新组织信息层级（不是简单堆叠）

## P1 — 应查（违反需要修复）
- 焦点环、键盘可达、对比度 ≥ 4.5:1
- 字体走 system stack，不要 Google Fonts CDN
- 流式排版使用 `clamp(min, vw, max)`
- 主品牌色用 OKLch 而非 HSL/RGB（更准确）
- 数据相关元素使用 `tabular-nums`


## P2 — 可选优化

- 字体使用 system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`)
- 数值使用 `tabular-nums` 确保等宽
- 微动效用 `prefers-reduced-motion` 防晕动症
- 暗色模式从 brand-spec 推导，不硬编码 `#000`/`#fff`

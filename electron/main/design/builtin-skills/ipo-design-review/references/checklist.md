# Design Review Checklist

## P0
- 必须按 5 维度评分：philosophy / hierarchy / execution / functional / innovation 各 1-10
- 任何 <3 的维度必须写"为什么 + 怎么修"
- 输出格式必须包含 <self-critique> JSON 块给 critic engine 解析

## P1
- 修复清单按"血量"分级：critical / major / minor
- 引用原文截图 / 选择器位置

## P2
- 给 3 个对照样本（"如果按 Stripe / Linear / Anthropic 会怎么改"）


## P2 — 可选优化

- 字体使用 system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`)
- 数值使用 `tabular-nums` 确保等宽
- 微动效用 `prefers-reduced-motion` 防晕动症
- 暗色模式从 brand-spec 推导，不硬编码 `#000`/`#fff`

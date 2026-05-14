# Pitch Deck Checklist

## P0 — 必查
- 使用 `library/frames/deck-framework.html` 作为外壳（导航 + 页码 + 打印）
- 每张幻灯片 16:9，单一 idea per slide
- 首页/尾页必有；中间章节有过渡页
- 不要逐字朗读式的"段落 slide"，要"标题 + 视觉证据"

## P1 — 应查
- 数字加粗、引语下沉、章节用全屏色块过渡
- 字体大小：标题 ≥ 40px，正文 ≥ 18px
- 任何图表必须有 unit、source、conclusion 三件

## P2 — 可选
- 加 speaker notes（隐藏 `<aside data-notes>`）
- 可导出 PPTX（在 M3 接入 pptxgenjs）


## P2 — 可选优化

- 字体使用 system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`)
- 数值使用 `tabular-nums` 确保等宽
- 微动效用 `prefers-reduced-motion` 防晕动症
- 暗色模式从 brand-spec 推导，不硬编码 `#000`/`#fff`

# Direction: brutalist

刻意粗粝、反精致、强对比。瑞士设计的反面教材，但有意为之。

## Mood

`<table border="1">` 复古 + 90 年代 GeoCities × 当代实验设计师（David Carson / Sagmeister）。规则被故意打破：错位、超大字、毛边、网格 hold 不住。可读性让位给冲击力，但**仍要可读**。

## Palette (OKLch)

- `--bg`: `oklch(1.00 0 0)`       — 纯白
- `--fg`: `oklch(0.05 0 0)`       — 纯黑
- `--accent`: `oklch(0.70 0.30 25)` — 警告橙红
- `--secondary`: `oklch(0.60 0.30 290)` — 电子紫（用作意外撞色）

## Typography

- Display: 任何**怪字体** — `"Space Grotesk"` / `"Archivo Black"` / `"Anton"` / `"Bebas Neue"` 都可以混
- Body: `"Inter"` or `"Helvetica Neue"`，但用偏小字号制造对比

Hero 字号巨大（120–240px）；字距 -0.05em；偶尔用 ALL CAPS。

## Posture

- ✅ 错位 / 撞文字 / 故意压低对比；用 `transform: rotate(-2deg)` 之类的小破坏感
- ✅ 大方块色 + 描边粗到 3–6px
- ✅ 网格存在但被刻意打破一次（一个元素脱离网格）
- ✅ 字体作为图像本身使用（typography as image）
- ❌ 不做平滑圆角；不做阴影；不做"友好"
- ❌ 不要把所有元素都歪掉——破坏要稀有才有效

## References

- David Carson, Stefan Sagmeister, Hassan Rahim, 90s zine, Pentagram (实验作品), Wieden+Kennedy

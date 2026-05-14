# Web Prototype Themes

## Light（默认）
- bg: `#ffffff` 或方向中性色
- fg: `#0a0a0a`
- surface: bg + 1.5% darken（warm-tinted）

## Dark
- bg: `#0a0a0a` 或 OKLch `oklch(15% 0.005 280)`
- fg: `oklch(95% 0.005 90)`（暖白）

## brand-spec 注入优先

若 `brand-spec.md` 存在，`--accent` 必须用其中的 `--brand-primary`。

# Direction: modern-minimal

Linear / Vercel / Stripe / Apple 风：冷静、克制、信息密度高。

## Mood

精致的 SaaS / 工程产品调性。深色背景 + 中性灰阶 + 一个克制的高饱和强调色；版式严格 8/4 网格；icon 用 stroke 1.5px lucide 风。

## Palette (OKLch)

- `--bg`: `oklch(0.98 0.003 250)`   — 雾白（亮色模式默认）
- `--fg`: `oklch(0.20 0.01 250)`    — 石墨灰
- `--accent`: `oklch(0.58 0.18 268)` — Linear 紫 #5E6AD2 风
- `--muted`: `oklch(0.65 0.005 250)` — 中性灰

支持深色模式：`@media (prefers-color-scheme: dark)` 时 bg → `oklch(0.13 0.01 250)`，fg → `oklch(0.96 0.003 250)`。

## Typography

- Display & Body: **"Inter"** / fallback `-apple-system, "SF Pro Text", system-ui, sans-serif`
- 等宽: **"JetBrains Mono"** / fallback `ui-monospace, "SF Mono", monospace`

H1 用 `clamp(40px, 6vw, 64px)` weight 600 tracking -0.02em；正文 15–16px 行高 1.55。

## Posture

- ✅ 严格 8px 网格（spacing 用 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64）
- ✅ 圆角统一 8–12px；分隔线 1px 中性灰
- ✅ 阴影只用一档：`0 1px 2px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.04)`
- ✅ 一个强调色贯穿全场（按钮 / 链接 / focus ring）
- ❌ 不做 emoji，不做 sparkle，不做拟物
- ❌ 不要紫粉渐变 hero（已成 AI slop 重灾区）

## References

- Linear, Vercel, Stripe Atlas, Resend, Cursor, Raycast

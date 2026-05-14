# Mobile Mockup Checklist

## P0 — 必查
- 触控目标最小 44×44pt
- iOS：圆角 12–16px、模糊背景 (`backdrop-filter: blur(20px)`)、半透明 tab bar
- Android：Material 3 配色、tonal surface
- 状态栏 / 导航栏 / tab bar 三件套必须齐
- 多屏并列时画布之间至少 48px 间距

## P1 — 应查
- 字体：iOS 走 SF Pro / system，中文走 PingFang
- 字号：标题 17-22 / body 15-17 / caption 12
- 安全区：刘海 / Dynamic Island / home indicator 占位

## P2 — 可选
- 用 `library/frames/iphone-15-pro.html` 套真实物理边框
- 多屏 demo 可加 anchor 切换实现"原型联动"


## P2 — 可选优化

- 字体使用 system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`)
- 数值使用 `tabular-nums` 确保等宽
- 微动效用 `prefers-reduced-motion` 防晕动症
- 暗色模式从 brand-spec 推导，不硬编码 `#000`/`#fff`

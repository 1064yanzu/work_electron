# Mode: mobile-mockup

你正在为「移动应用 Mockup」生成 HTML。

## 范围

- iOS / Android 应用界面的 hi-fi mockup（不是真实可运行的应用）
- 默认渲染在 390×844（iPhone 15）或 412×892（Pixel 8 Pro）画布
- 可以是单屏（一个界面）或多屏（首页 + 详情 + 设置 等并排展示）

## 设备框架建议

Phase 3 会提供真实设备物理边框（Dynamic Island / 状态栏 SVG）。本期请用以下简化方案：

```html
<div class="device-frame iphone">
  <div class="device-bezel">
    <div class="device-notch"></div>
    <div class="device-status-bar">
      <span class="time">9:41</span>
      <span class="signal">●●●● 5G</span>
      <span class="battery">100%</span>
    </div>
    <div class="device-content"> ... </div>
    <div class="device-home-indicator"></div>
  </div>
</div>
```

CSS 上：device-frame 用纯黑边框 + 圆角 48px 模拟 iPhone；状态栏 14sp；底部 home indicator 4px 圆角。

## 守则

- 触控目标最小 44×44pt
- 字体走 SF Pro / system；中文 PingFang
- iOS 17 设计语言：圆角 12–16px、模糊背景（backdrop-filter）、半透明 tab bar
- 状态栏 / 导航栏 / tab bar 三件套要齐
- 多屏并列时画布之间至少 48px 间距

## 输出文件

- `index.html` 主文件（一个或多个 device-frame）
- 可选 `screens/` 目录放各屏 HTML（如做多屏导航 demo 可以用 anchor 切换）

---
name: ipo-mobile-mockup
description: Build iOS / Android hi-fi mobile mockups with realistic device frames (iPhone 15 Pro Dynamic Island / Pixel 9 / iPad Pro), status bar, home indicator, and properly tuned touch targets. Use for app screen mockups, single-screen or multi-screen flows.
version: 1.0.0
license: MIT
author: IPO Workbench
od:
  group: mobile
  default_frame: iphone-15-pro
  tweaks:
    - { name: device, type: select, values: [iphone-15-pro, android-pixel, ipad-pro], default: iphone-15-pro }
    - { name: screen_count, type: number, min: 1, max: 6, step: 1, default: 3 }
    - { name: corner_radius, type: number, min: 0, max: 32, step: 2, default: 16 }
---

# IPO Mobile Mockup Skill

You are generating a **hi-fi mobile app mockup** as a single `index.html` file.

## Canvas

- Single screen: 1 device frame
- Multi screen: 2-4 device frames arranged horizontally (gap >= 48px)
- Default device: iPhone 15 Pro (390 × 844 logical, scale 1)
- User can override via brief (Pixel 9, iPad Pro 11, MacBook Air 13)

## Device Frame Templates

Reference shapes (re-implement inline; do not load external):

### iPhone 15 Pro
- Bezel: 12px black border, border-radius 48px
- Dynamic Island: top-center 125 × 36, border-radius 18
- Status bar: 14sp time-left / battery+signal-right, padding 24/16
- Home indicator: bottom-center 134 × 4, border-radius 2

### Pixel 9
- Bezel: 8px black, border-radius 36px
- Punch-hole camera: top-center 14 dia
- Three-button nav: bottom 144 × 6

## Output

```html
<div class="device device-iphone-15-pro">
  <div class="bezel">
    <div class="dynamic-island"></div>
    <div class="status-bar">
      <span class="time">9:41</span>
      <span class="signals">
        <svg><!-- 5G --></svg>
        <svg><!-- battery --></svg>
      </span>
    </div>
    <div class="screen">...</div>
    <div class="home-indicator"></div>
  </div>
</div>
```

## Critical Rules

- ❌ Don't use Material Design (FAB, ripple) unless designing for Pixel
- ❌ Don't use rounded square iOS icons unless designing for iOS home
- ✅ iOS 17 / Android 14 design tokens
- ✅ Touch targets ≥ 44×44 pt (iOS) / 48×48 dp (Android)
- ✅ Use SF Symbols style SVG for iOS, Material Symbols for Android

## References Required

Include reference notes in HTML comment at top:
```html
<!--
References:
- iOS 17 HIG: https://developer.apple.com/design/human-interface-guidelines/
- Material You: https://m3.material.io/
-->
```

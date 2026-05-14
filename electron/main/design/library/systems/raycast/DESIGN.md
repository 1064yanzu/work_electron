---
title: Raycast
category: DevTool
swatches: ["#FF6363", "#191919", "#FFFFFF", "#8E8E8E"]
summary: 命令面板原生美学：深色 + 红色 accent + 高密度键盘第一
---

# Raycast DESIGN.md

## 调色板

- `--bg`: `#191919` 默认深色
- `--fg`: `#FFFFFF`
- `--accent`: `#FF6363` Raycast 红
- `--accent-bg`: `rgba(255, 99, 99, 0.1)`
- `--surface`: `#222222`
- `--border`: `oklch(0.22 0 0)`
- `--muted`: `#8E8E8E`

## 字体

- Display & Body: `"Inter"`, sans-serif
- 等宽: `"JetBrains Mono"`, monospace
- 命令项: 13-14px（高密度）
- 标题: 16-20px weight 600

## 间距 & 形状

- 4px 网格（最密）
- 圆角：命令项 6px / 模态 12px / 按钮 6px
- 阴影：`0 8px 32px rgba(0,0,0,0.4)`（命令面板浮起）
- 边框：1px subtle

## 组件态度

- 命令面板（核心）：搜索输入 + 列表 + 键盘 shortcut 标签（⌘1 ⏎ 等）
- 列表项：左侧 16px icon + 标题 + 右侧 metadata + shortcut
- 浮窗：圆角 12px + drop shadow + 模糊背景
- 键盘提示：每个操作旁边显示 kbd

## 反 AI Slop

- ❌ 不要 web design tropes 落地页
- ❌ 不要鼠标 hover 浮起；要键盘选中 highlight
- ✅ 鼓励显示键盘快捷键（kbd 元素）

## References

raycast.com / Store / Window manager / Extensions Hub

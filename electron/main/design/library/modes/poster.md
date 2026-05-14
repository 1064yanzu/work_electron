# Mode: poster

你正在生成「海报 / 社交卡片」。

## 范围

- 单张视觉，1080×1080（Instagram 方版）或 1080×1920（Stories 9:16）或 1200×630（OG image）
- 用户答卷的 scale 字段决定具体尺寸：
  - `single-screen` → 1080×1080
  - `landing-page` → 1200×630
  - `multi-page` → 1080×1920（Stories 风）

## 结构

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; }
    .poster {
      width: 1080px; height: 1080px;  /* 按 scale 调整 */
      display: flex; flex-direction: column;
      box-sizing: border-box;
      padding: 80px;
    }
  </style>
</head>
<body>
  <div class="poster">
    <!-- 主视觉 -->
  </div>
</body>
</html>
```

> 截图导出时，`webContents.capturePage` 会按 viewport 尺寸截图；建议把 `<body>` 设成与海报相同尺寸。

## 守则

- 主视觉占满画布；不要四边都是 white space
- 字号梯度极端：标题 200px+ / 副标 80px / body 40px（视画布尺寸缩放）
- 1 个主视觉元素 + 1 个 supporting 元素，不要堆砌
- 颜色对比强烈；用 OKLch 算保证对比度 ≥ 7:1（海报需要远距离可读）
- 不需要响应式；这是固定画布

## 输出文件

- `index.html` 单文件

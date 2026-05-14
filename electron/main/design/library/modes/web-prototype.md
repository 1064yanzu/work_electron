# Mode: web-prototype

你正在为「网页原型 / 落地页」生成 HTML。

## 范围

- 单页或多 section 的桌面优先响应式页面
- 包含 hero、核心特性、定价 / FAQ / footer 等典型 section 组合（按用户答卷调整）
- 默认覆盖三个断点：desktop ≥ 1024 / tablet 768–1023 / mobile < 768

## 结构建议

```html
<!DOCTYPE html>
<html lang="zh-Hans">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ 标题 }}</title>
  <style> /* inline CSS, 用 :root 定义 OKLch tokens */ </style>
</head>
<body>
  <header> ... </header>
  <main>
    <section class="hero"> ... </section>
    <section class="features"> ... </section>
    <!-- 依用户答卷 must_haves 增减 -->
  </main>
  <footer> ... </footer>
</body>
</html>
```

## 守则

- 移动端**不要**简单堆叠：考虑信息优先级重排（hero 简化、导航收汉堡、网格 → 1 列）
- 字体一律走 system font stack（**禁止** Google Fonts CDN）
- 图片用 SVG / emoji / CSS 渐变（**禁止** unsplash 远程链接）
- focus 状态可见；按钮 / 链接键盘可达
- 用 `clamp(min, vw, max)` 做流式排版
- 不要 web design tropes：三栏 features / 客户 logo 矩阵 / 紫色渐变 hero

## 输出文件

- `index.html` 主文件
- 可选 `assets/` 目录放图标 / 字体 / 局部图片

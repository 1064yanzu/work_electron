# Mode: pitch-deck

你正在生成「演示稿（Pitch Deck）」HTML。

## 范围

- 16:9 多页演示稿，键盘 ← / → 切页，Esc 退出
- 每页是一个 `<section class="slide">`，初始只显示第一张
- 默认 10–20 页之间，按用户答卷的 scale 字段决定

## 框架最小骨架

Phase 3 会提供完整 deck-framework.html 模板。本期请按以下骨架写：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>{{ deck title }}</title>
  <style>
    :root { --bg: ...; --fg: ...; --accent: ...; }
    html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); overflow: hidden; }
    .slide {
      position: absolute; inset: 0;
      display: none;
      padding: 5vw;
      box-sizing: border-box;
      animation: fade .4s ease;
    }
    .slide.active { display: flex; flex-direction: column; justify-content: center; }
    @keyframes fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; } }
    .deck-counter {
      position: fixed; bottom: 24px; right: 32px;
      font-size: 12px; opacity: 0.5;
    }
  </style>
</head>
<body>
  <section class="slide active" data-index="1"> ... </section>
  <section class="slide" data-index="2"> ... </section>
  <!-- ... -->
  <div class="deck-counter"><span id="cur">1</span> / <span id="total">N</span></div>
  <script>
    const slides = document.querySelectorAll('.slide');
    let idx = 0;
    document.getElementById('total').textContent = slides.length;
    function go(next) {
      slides[idx].classList.remove('active');
      idx = Math.max(0, Math.min(slides.length - 1, next));
      slides[idx].classList.add('active');
      document.getElementById('cur').textContent = idx + 1;
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
    });
  </script>
</body>
</html>
```

## 守则

- 每页只讲一个观点；标题 + 一句 takeaway + 数据 / 图 / 引文
- 字号大：H1 用 7vw，body 用 2.5vw（演示稿离观众远）
- 行高紧 1.1（不是 1.5），让信息更紧凑
- 不要超过 3 个色（bg / fg / accent），accent 仅用于关键数据
- 任何图表用 SVG inline；不要嵌图片
- 留白比常规网页多一倍

## 输出文件

- `index.html` 单文件演示稿

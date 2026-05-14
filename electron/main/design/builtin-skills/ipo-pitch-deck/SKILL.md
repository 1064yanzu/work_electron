---
name: ipo-pitch-deck
description: Build 16:9 multi-slide HTML presentation decks with keyboard navigation (← →), slide counter, and proper aspect-ratio handling for export to PDF or screenshots. Use for pitch decks, demo days, product launches, internal reviews.
version: 1.0.0
license: MIT
author: IPO Workbench
od:
  group: deck
  default_frame: deck-framework
  tweaks:
    - { name: slide_count, type: number, min: 5, max: 30, step: 1, default: 12 }
    - { name: density, type: select, values: [minimal, balanced, dense], default: balanced }
    - { name: tone, type: select, values: [serious, energetic, editorial], default: serious }
---

# IPO Pitch Deck Skill

You are generating a **16:9 multi-slide HTML presentation** as a single `index.html`.

## Slide Count

- Default 10-15 slides
- Hero / Problem / Solution / Market / Product / Traction / Team / Ask
- Adjust based on user `scale` answer

## Framework Skeleton

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>{{ deck title }}</title>
  <style>
    :root {
      --bg: var(--bg-direction);
      --fg: var(--fg-direction);
      --accent: var(--accent-direction);
    }
    html, body {
      margin: 0; height: 100vh; overflow: hidden;
      background: var(--bg); color: var(--fg);
      font-family: 'Inter', system-ui, sans-serif;
    }
    .slide {
      position: absolute; inset: 0;
      display: none; flex-direction: column; justify-content: center;
      padding: 6vw;
      box-sizing: border-box;
      animation: slideFade 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .slide.active { display: flex; }
    .slide h1 { font-size: 7vw; line-height: 1.05; margin: 0 0 0.5em; font-weight: 700; }
    .slide h2 { font-size: 5vw; line-height: 1.1; margin: 0 0 0.4em; }
    .slide p { font-size: 2.4vw; line-height: 1.4; }
    .slide .number { font-size: 9vw; font-weight: 700; color: var(--accent); }
    @keyframes slideFade {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .deck-counter {
      position: fixed; bottom: 32px; right: 40px;
      font-size: 1.2vw; color: var(--fg); opacity: 0.4;
      font-variant-numeric: tabular-nums;
    }
    .deck-progress {
      position: fixed; top: 0; left: 0; height: 3px; background: var(--accent);
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="deck-progress" id="progress"></div>

  <section class="slide active" data-index="1">
    <h1>{{ Title }}</h1>
    <p>{{ subtitle }}</p>
  </section>

  <section class="slide" data-index="2">
    <h2>问题</h2>
    <p>...</p>
  </section>

  <!-- ... more slides ... -->

  <div class="deck-counter">
    <span id="cur">1</span> / <span id="total"></span>
  </div>

  <script>
    const slides = document.querySelectorAll('.slide');
    const progress = document.getElementById('progress');
    let idx = 0;
    document.getElementById('total').textContent = slides.length;
    function go(next) {
      slides[idx].classList.remove('active');
      idx = Math.max(0, Math.min(slides.length - 1, next));
      slides[idx].classList.add('active');
      document.getElementById('cur').textContent = idx + 1;
      progress.style.width = `${((idx + 1) / slides.length) * 100}%`;
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(idx - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(slides.length - 1);
    });
    go(0);
  </script>
</body>
</html>
```

## Slide Composition Rules

- **One idea per slide**
- Title + 1 takeaway + 1 piece of evidence (data / quote / image)
- Massive type (5-7vw H1) — audience is far from the screen
- Tight line-height (1.05-1.2)
- Max 3 colours per deck (bg / fg / accent)
- Charts: inline SVG only, no Chart.js libs

## Critical Rules

- ❌ No bullet point soup (>4 bullets per slide = restructure)
- ❌ No `<img>` from remote
- ❌ No video / audio embeds (decks should be standalone HTML)
- ✅ Use OKLch palette from selected direction
- ✅ Keyboard navigation is mandatory
- ✅ Show progress + counter

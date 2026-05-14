---
name: ipo-web-prototype
description: Build hi-fi HTML web prototypes / landing pages with inline assets, responsive breakpoints, and reference shots of real product UX. Use when the user asks for a landing page, SaaS prototype, marketing site, dashboard, or any web-style hi-fi design.
version: 1.0.0
license: MIT
author: IPO Workbench
od:
  group: web
  default_frame: browser-chrome
  tweaks:
    - { name: hero_size, type: select, values: [compact, normal, oversized], default: normal }
    - { name: accent_intensity, type: number, min: 0, max: 1, step: 0.1, default: 0.5 }
    - { name: corner_radius, type: number, min: 0, max: 32, step: 2, default: 12 }
    - { name: density, type: select, values: [tight, comfortable, airy], default: comfortable }
---

# IPO Web Prototype Skill

You are generating a **hi-fi HTML web prototype** as a single self-contained `index.html` file.

## Output Contract

- Write `index.html` to the current working directory (Agent SDK already set cwd to the design session work_dir).
- Inline ALL CSS in `<style>` inside `<head>`; inline ALL JS in `<script>` (no external bundles).
- Images: use SVG, emoji, CSS gradients, or `data:` URI base64. **No remote CDN.**
- Fonts: system-ui font stack only. **No Google Fonts CDN.**
- Cover three breakpoints: desktop (≥1024) / tablet (768–1023) / mobile (<768).
- Mobile breakpoint is not a stack — re-organise hierarchy.

## Structure

```html
<!DOCTYPE html>
<html lang="zh-Hans" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ Topic }}</title>
  <style>
    :root {
      --bg: <from direction.palette.bg>;
      --fg: <from direction.palette.fg>;
      --accent: <from direction.palette.accent>;
      --muted: <from direction.palette.muted>;
    }
    @media (prefers-color-scheme: dark) { :root { /* dark overrides */ } }
    /* Layout / typography / components ... */
  </style>
</head>
<body>
  <header>...</header>
  <main>...</main>
  <footer>...</footer>
</body>
</html>
```

## Critical Rules

- ❌ No `<link href="https://fonts.googleapis.com/...">`
- ❌ No `<img src="https://unsplash.com/...">`
- ❌ No purple-gradient hero (AI slop)
- ❌ No client-logo grayscale grid unless explicitly requested
- ✅ Use semantic HTML5 elements (`<section>`, `<article>`, `<aside>`, `<nav>`)
- ✅ Ensure focus-visible, keyboard navigation, contrast ratio ≥ 4.5:1
- ✅ Use `clamp(min, vw, max)` for fluid typography
- ✅ Use OKLch colour space when possible

## When to Pause and Ask

If the user's brief is vague (`<50 chars`), pause and propose 2-3 directions before committing to HTML.

## Self-Critique

Before finalising, score yourself on the 5-dim rubric:
- Philosophy / Hierarchy / Execution / Functional / Innovation (each 1-10).

Output the scorecard as a markdown block after the HTML.

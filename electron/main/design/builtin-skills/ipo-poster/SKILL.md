---
name: ipo-poster
description: Build single-canvas HTML posters / social cards / OG images at fixed pixel dimensions (1080×1080 IG, 1080×1920 Stories, 1200×630 OG). Use for social media graphics, marketing posters, conference banners.
version: 1.0.0
license: MIT
author: IPO Workbench
od:
  group: poster
  tweaks:
    - { name: format, type: select, values: [A4, A3, 1080x1080, 1080x1920], default: A4 }
    - { name: style_intensity, type: select, values: [restrained, bold, maximal], default: bold }
---

# IPO Poster Skill

You are generating a **single-canvas HTML poster** as `index.html`.

## Canvas Dimensions

| User scale answer | Dimensions | Use case |
|---|---|---|
| `single-screen` | 1080 × 1080 | Instagram square |
| `landing-page` | 1200 × 630 | OpenGraph / Twitter / LinkedIn |
| `multi-page` | 1080 × 1920 | Instagram Stories / TikTok |

## Output Skeleton

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    html, body { margin: 0; padding: 0; }
    body { width: 1080px; height: 1080px; overflow: hidden; }
    /* poster styles inside .poster */
  </style>
</head>
<body>
  <div class="poster">
    <!-- single-shot visual -->
  </div>
</body>
</html>
```

## Composition Rules

- **One main visual + at most one supporting element.** Don't pile.
- Extreme type hierarchy:
  - Headline 200-280px weight 700-900
  - Sub 60-80px weight 500
  - Meta 24-32px
- Contrast ≥ 7:1 for the headline (readable from a distance)
- Background fills the canvas — **no white padding around edges**
- 1 accent colour, 1 fg, 1 bg max

## Critical Rules

- ❌ No web design tropes (don't make it look like a landing page)
- ❌ No `<a>` links (it's a static visual)
- ❌ No fonts smaller than 24px (it's not legible on social)
- ✅ When direction = brutalist, embrace large type that bleeds off canvas
- ✅ When direction = editorial, use serifs and generous letter-spacing
- ✅ Export-friendly: capture via `webContents.capturePage`; ensure `<body>` matches canvas exactly

## Reference Quality Bar

A good poster passes the "thumbnail test": even at 80px width, the message is legible.

#!/usr/bin/env node
// Upgrade builtin-skills/<id>/ to the resource-map layout:
//   SKILL.md             (existing, frontmatter augmented with od.tweaks)
//   assets/template.html (skeleton agent should start from)
//   references/checklist.md (P0/P1/P2 anti-slop rules)
//   references/layouts.md
//   references/components.md
//   references/themes.md
//   example.html         (visible reference snippet)
// Idempotent: only writes files that don't already exist.

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("electron/main/design/builtin-skills");

const COMMON_CHECKLIST_TAIL = `

## P2 — 可选优化

- 字体使用 system stack (\`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif\`)
- 数值使用 \`tabular-nums\` 确保等宽
- 微动效用 \`prefers-reduced-motion\` 防晕动症
- 暗色模式从 brand-spec 推导，不硬编码 \`#000\`/\`#fff\`
`;

const SKILLS = {
  "ipo-web-prototype": {
    extraFrontmatter: `od:
  group: web
  default_frame: browser-chrome
  tweaks:
    - { name: hero_size, type: select, values: [compact, normal, oversized], default: normal }
    - { name: accent_intensity, type: number, min: 0, max: 1, step: 0.1, default: 0.5 }
    - { name: corner_radius, type: number, min: 0, max: 32, step: 2, default: 12 }
    - { name: density, type: select, values: [tight, comfortable, airy], default: comfortable }
`,
    template: `<!DOCTYPE html>
<html lang="zh-Hans" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{title}}</title>
  <style>
    :root {
      /* 颜色：方向 → brand-spec → 默认；不要硬编码紫色渐变 */
      --bg: #ffffff;
      --fg: #0a0a0a;
      --accent: var(--brand-accent, #635bff);
      --muted: #6b7280;
      --surface: #f8fafc;
      --border: #e5e7eb;
      --radius: 12px;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      color: var(--fg);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }
    /* TODO(agent): 在这里补 hero / features / pricing / footer 等 sections。
       严禁紫色渐变 hero、客户 logo 灰阶矩阵、sparkle icon。 */
  </style>
</head>
<body>
  <header><!-- nav --></header>
  <main>
    <section><!-- hero --></section>
    <section><!-- features --></section>
  </main>
  <footer><!-- footer --></footer>
</body>
</html>
`,
    checklist: `# Web Prototype Checklist

## P0 — 必查（违反必须重做）
- 禁紫色渐变 hero (\`linear-gradient(135deg, #6366f1, #a855f7)\` 之流)
- 禁客户 logo 灰阶矩阵（除非用户明确要求 "logo wall"）
- 禁 sparkle / star-burst icon 装饰
- 禁 Bootstrap card / Material card 的"卡片堆叠"布局
- 三个断点必须分别重新组织信息层级（不是简单堆叠）

## P1 — 应查（违反需要修复）
- 焦点环、键盘可达、对比度 ≥ 4.5:1
- 字体走 system stack，不要 Google Fonts CDN
- 流式排版使用 \`clamp(min, vw, max)\`
- 主品牌色用 OKLch 而非 HSL/RGB（更准确）
- 数据相关元素使用 \`tabular-nums\`
${COMMON_CHECKLIST_TAIL}`,
    layouts: `# Web Prototype Layouts

## Hero 模式

- **Editorial Hero**：左大字标题（serif） + 右产品截图，参考 Stripe / Anthropic
- **Tight Manifesto**：纯文字 hero，center align，参考 Linear / Cursor
- **Split Demo**：左文案右交互 demo（CSS only），参考 Vercel

## Section 节奏

- 章节之间 \`padding-block: clamp(64px, 8vw, 128px)\`
- 重要 section 用 \`<section data-style="manifesto">\` 标注 + 左/右 boundary 线
- 数据 section 用 monospace 数字 + 渐增高亮

## Grid 系统

- 桌面 12 列，sidebar 2-3 列 + main 9-10 列
- 卡片网格：\`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))\`
`,
    components: `# Web Prototype Components

## Button

\`\`\`html
<button class="btn-primary">Get started</button>
\`\`\`
\`\`\`css
.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-weight: 500;
  border: none;
  cursor: pointer;
}
\`\`\`

## Card

- 不画死板边框，用 \`box-shadow: 0 0 0 1px var(--border)\` 做 ring
- hover 时 ring 颜色变深，不要 lift 阴影

## Nav

- 透明 + 滚动后 \`backdrop-filter: blur(12px)\` 凝固
- 高度 56-64px，logo + 3-5 个一级导航
`,
    themes: `# Web Prototype Themes

## Light（默认）
- bg: \`#ffffff\` 或方向中性色
- fg: \`#0a0a0a\`
- surface: bg + 1.5% darken（warm-tinted）

## Dark
- bg: \`#0a0a0a\` 或 OKLch \`oklch(15% 0.005 280)\`
- fg: \`oklch(95% 0.005 90)\`（暖白）

## brand-spec 注入优先

若 \`brand-spec.md\` 存在，\`--accent\` 必须用其中的 \`--brand-primary\`。
`,
    example: `<!-- 极简参考：editorial hero + manifesto。给 agent 看真实成品长什么样。 -->
<!DOCTYPE html><html lang="zh-Hans"><head><meta charset="UTF-8"><title>Example</title>
<style>
  body { font-family: ui-serif, "Source Serif Pro", Georgia, serif; margin: 0; background: #f5f4ed; color: #141413; }
  .hero { padding: 120px 8vw 80px; max-width: 1100px; }
  h1 { font-size: clamp(48px, 7vw, 96px); line-height: 1.05; margin: 0 0 24px; letter-spacing: -0.02em; }
  .lede { font-family: -apple-system, sans-serif; max-width: 540px; font-size: 18px; line-height: 1.6; color: #5e5d59; }
</style></head><body>
  <section class="hero">
    <h1>Quiet tools for loud problems.</h1>
    <p class="lede">A reading-room for your knowledge, not a content factory.</p>
  </section>
</body></html>
`,
  },
  "ipo-mobile-mockup": {
    extraFrontmatter: `od:
  group: mobile
  default_frame: iphone-15-pro
  tweaks:
    - { name: device, type: select, values: [iphone-15-pro, android-pixel, ipad-pro], default: iphone-15-pro }
    - { name: screen_count, type: number, min: 1, max: 6, step: 1, default: 3 }
    - { name: corner_radius, type: number, min: 0, max: 32, step: 2, default: 16 }
`,
    template: `<!DOCTYPE html>
<html lang="zh-Hans">
<head><meta charset="UTF-8"><title>{{title}}</title>
<style>
  body { margin: 0; padding: 48px 24px; background: #ece9e3; display: flex; gap: 48px; flex-wrap: wrap; justify-content: center; }
  /* 注意：真正的 iPhone/Android 边框请用 library/frames/<id>.html 作为 <iframe src> 包一层；
     这个 template 只负责屏幕内容 (390×844 安全区)。 */
  .screen { width: 390px; height: 844px; border-radius: 36px; background: #fff; overflow: hidden; box-shadow: 0 24px 60px -20px rgba(0,0,0,.18); }
  .status-bar { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; font-size: 14px; font-weight: 600; }
</style></head>
<body>
  <article class="screen">
    <div class="status-bar"><span>9:41</span><span>●●●● 5G 🔋</span></div>
    <!-- TODO(agent): 多屏并排时复制这块 <article>，screen_count 由 od.tweaks 控制 -->
  </article>
</body></html>
`,
    checklist: `# Mobile Mockup Checklist

## P0 — 必查
- 触控目标最小 44×44pt
- iOS：圆角 12–16px、模糊背景 (\`backdrop-filter: blur(20px)\`)、半透明 tab bar
- Android：Material 3 配色、tonal surface
- 状态栏 / 导航栏 / tab bar 三件套必须齐
- 多屏并列时画布之间至少 48px 间距

## P1 — 应查
- 字体：iOS 走 SF Pro / system，中文走 PingFang
- 字号：标题 17-22 / body 15-17 / caption 12
- 安全区：刘海 / Dynamic Island / home indicator 占位

## P2 — 可选
- 用 \`library/frames/iphone-15-pro.html\` 套真实物理边框
- 多屏 demo 可加 anchor 切换实现"原型联动"
${COMMON_CHECKLIST_TAIL}`,
    layouts: `# Mobile Layouts

- 单屏：iPhone 390×844 / Android Pixel 412×892
- 双屏：list + detail 并排
- 三屏：onboarding 步进
- 六屏：完整用户旅程一屏看完

间距：屏幕之间 \`gap: 48px\`，外缘 \`padding: 48px\`。
`,
    components: `# Mobile Components

- **Tab bar**：5 项以内，icon + label
- **Nav bar**：left back + title + right action
- **List row**：左 icon + 中文字 + 右 disclosure，高度 56-72
- **Card**：圆角 12-16，padding 16，阴影极轻
- **CTA**：底部 fixed，圆角 999，高度 50-56
`,
    themes: `# Mobile Themes

## iOS 17
- 系统色：\`SystemBlue\` → 用 OKLch \`oklch(60% 0.18 250)\`
- 圆角：12 / 16 / 24
- backdrop-filter：tab bar / nav bar

## Material 3
- Primary 色生成 tonal palette
- elevation 0/1/2/3 用阴影深度区分
`,
    example: `<!-- iOS-style settings list -->
<!DOCTYPE html><html lang="zh-Hans"><head><meta charset="UTF-8"><title>Example</title>
<style>
  body { margin: 0; padding: 48px; background: #f0eee6; font-family: -apple-system, "PingFang SC", sans-serif; display: flex; justify-content: center; }
  .screen { width: 390px; min-height: 844px; background: #f5f4ed; border-radius: 40px; overflow: hidden; box-shadow: 0 30px 80px -30px rgba(0,0,0,.25); }
  .nav { padding: 16px 20px; font-size: 28px; font-weight: 700; }
  .row { padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ebe8de; background: #fafaf6; }
  .row:first-of-type { border-top: none; }
  .row span:last-child { color: #87867f; }
</style></head><body><div class="screen">
  <div class="nav">Settings</div>
  <div class="row"><span>账户</span><span>chen@example.com ›</span></div>
  <div class="row"><span>通知</span><span>开启 ›</span></div>
  <div class="row"><span>外观</span><span>跟随系统 ›</span></div>
</div></body></html>
`,
  },
  "ipo-pitch-deck": {
    extraFrontmatter: `od:
  group: deck
  default_frame: deck-framework
  tweaks:
    - { name: slide_count, type: number, min: 5, max: 30, step: 1, default: 12 }
    - { name: density, type: select, values: [minimal, balanced, dense], default: balanced }
    - { name: tone, type: select, values: [serious, energetic, editorial], default: serious }
`,
    template: `<!DOCTYPE html>
<html lang="zh-Hans">
<head><meta charset="UTF-8"><title>{{title}}</title>
<!-- 必须使用 library/frames/deck-framework.html：导航、计数器、打印 CSS 都在里面。
     agent 只需要在 deck-framework <main> 里填一组 <section class="slide">。 -->
<style>
  .slide { aspect-ratio: 16/9; padding: 64px; display: grid; gap: 24px; }
</style></head>
<body>
  <main class="deck-root">
    <section class="slide" data-title="封面">
      <h1>{{title}}</h1>
      <p class="byline">{{author}} · {{date}}</p>
    </section>
    <!-- TODO(agent): 按 slide_count 生成更多 <section class="slide"> -->
  </main>
</body></html>
`,
    checklist: `# Pitch Deck Checklist

## P0 — 必查
- 使用 \`library/frames/deck-framework.html\` 作为外壳（导航 + 页码 + 打印）
- 每张幻灯片 16:9，单一 idea per slide
- 首页/尾页必有；中间章节有过渡页
- 不要逐字朗读式的"段落 slide"，要"标题 + 视觉证据"

## P1 — 应查
- 数字加粗、引语下沉、章节用全屏色块过渡
- 字体大小：标题 ≥ 40px，正文 ≥ 18px
- 任何图表必须有 unit、source、conclusion 三件

## P2 — 可选
- 加 speaker notes（隐藏 \`<aside data-notes>\`）
- 可导出 PPTX（在 M3 接入 pptxgenjs）
${COMMON_CHECKLIST_TAIL}`,
    layouts: `# Deck Layouts

- 封面：title 64-96px + byline
- 章节：全屏色块 + 数字章节号
- 数据 slide：大数 + 单位 + 一句结论
- 比较 slide：左右双栏
- 结尾：CTA + 联系方式
`,
    components: `# Deck Components

- 页码 chip：右下角，由 deck-framework 注入
- 进度条：顶部 1px
- 章节卡：全屏 hero
- 引语：\`<blockquote>\` 大字 + 来源 small
`,
    themes: `# Deck Themes

- Serious：黑底白字 + 单一品牌色
- Energetic：高饱和品牌色块 + 大字
- Editorial：serif + warm paper + 拼贴
`,
    example: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Example</title>
<style>
  body { margin: 0; font-family: -apple-system, "PingFang SC", sans-serif; background: #0a0a0a; color: #fff; }
  .slide { aspect-ratio: 16/9; padding: 80px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }
  h1 { font-size: 72px; line-height: 1.05; letter-spacing: -0.02em; margin: 0; }
  .byline { color: #888; font-size: 18px; }
</style></head><body>
  <section class="slide">
    <h1>Quiet tools for loud problems.</h1>
    <p class="byline">IPO Workbench · 2026</p>
  </section>
</body></html>
`,
  },
  "ipo-poster": {
    extraFrontmatter: `od:
  group: poster
  tweaks:
    - { name: format, type: select, values: [A4, A3, 1080x1080, 1080x1920], default: A4 }
    - { name: style_intensity, type: select, values: [restrained, bold, maximal], default: bold }
`,
    template: `<!DOCTYPE html>
<html lang="zh-Hans">
<head><meta charset="UTF-8"><title>{{title}}</title>
<style>
  @page { size: A4; margin: 0; }
  body { margin: 0; background: #fff; }
  .poster {
    width: 210mm; height: 297mm;
    padding: 24mm 18mm;
    display: grid;
    grid-template-rows: auto 1fr auto;
    box-sizing: border-box;
    background: #f5f4ed;
    color: #141413;
    font-family: -apple-system, "PingFang SC", sans-serif;
  }
  h1 { font-family: ui-serif, Georgia, serif; font-size: 84px; line-height: 1; margin: 0; }
</style></head>
<body>
  <article class="poster">
    <header>{{eyebrow}}</header>
    <main><h1>{{title}}</h1></main>
    <footer>{{footer}}</footer>
  </article>
</body></html>
`,
    checklist: `# Poster Checklist

## P0
- 单页强视觉中心，远观一眼能读
- 字号层级清晰：主标 ≥ 64px / 副标 24-32 / body 12-16
- 留白足够，重要内容距边缘 ≥ 18mm

## P1
- 不要 stock photo 灰阶滤镜
- 避免 "ChatGPT 海报"风（紫渐变 + 居中三行 + sparkle）

## P2
- 使用 OKLch 制造受控的浓度差
- 多张连排时主色循环要有节奏
${COMMON_CHECKLIST_TAIL}`,
    layouts: `# Poster Layouts

- 古典对称：标题居中、副标下沉
- Swiss 网格：左对齐 + 大量留白
- 拼贴 editorial：分块裁切、错位排版
`,
    components: `# Poster Components

- 主标 + eyebrow + footer 三段式
- 大装饰数字、章节号
- QR code 占位
`,
    themes: `# Poster Themes

- Editorial Warm：paper + serif + terracotta accent
- Brutalist：高对比黑白 + 单一鲜艳点缀
- Swiss：纯白 + 黑色 Helvetica + 红色锚点
`,
    example: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Example</title>
<style>
  body { margin: 0; background: #ece9e3; font-family: -apple-system, sans-serif; padding: 24px; }
  .poster { width: 420px; aspect-ratio: 210/297; background: #faf9f5; padding: 36px; box-shadow: 0 20px 60px -20px rgba(0,0,0,.15); display: grid; grid-template-rows: auto 1fr auto; }
  h1 { font-family: ui-serif, Georgia, serif; font-size: 72px; line-height: 1; margin: 0; color: #141413; }
  .eyebrow { font-size: 12px; letter-spacing: 0.2em; color: #87867f; text-transform: uppercase; }
  footer { font-size: 11px; color: #87867f; }
</style></head><body>
  <article class="poster">
    <div class="eyebrow">Issue 04 · 2026</div>
    <h1>Reading is a kind of listening.</h1>
    <footer>IPO Workbench Editorial</footer>
  </article>
</body></html>
`,
  },
  "ipo-design-review": {
    extraFrontmatter: `od:
  group: review
  tweaks:
    - { name: depth, type: select, values: [quick, normal, deep], default: normal }
`,
    template: `<!DOCTYPE html>
<html lang="zh-Hans">
<head><meta charset="UTF-8"><title>Design Review · {{subject}}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; max-width: 880px; margin: 48px auto; padding: 0 24px; color: #141413; }
  h1, h2 { letter-spacing: -0.02em; }
  .scorecard { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
  .score { padding: 16px; border-radius: 12px; background: #f5f4ed; }
  .score .n { font-size: 32px; font-weight: 700; }
</style></head>
<body>
  <h1>Design Review · {{subject}}</h1>
  <div class="scorecard">
    <div class="score"><div class="label">哲学一致性</div><div class="n">{{philosophy}}/10</div></div>
    <div class="score"><div class="label">视觉层级</div><div class="n">{{hierarchy}}/10</div></div>
    <div class="score"><div class="label">细节执行</div><div class="n">{{execution}}/10</div></div>
    <div class="score"><div class="label">功能性</div><div class="n">{{functional}}/10</div></div>
    <div class="score"><div class="label">创新性</div><div class="n">{{innovation}}/10</div></div>
  </div>
  <!-- TODO(agent): 修复清单 + 长文评 -->
</body></html>
`,
    checklist: `# Design Review Checklist

## P0
- 必须按 5 维度评分：philosophy / hierarchy / execution / functional / innovation 各 1-10
- 任何 <3 的维度必须写"为什么 + 怎么修"
- 输出格式必须包含 <self-critique> JSON 块给 critic engine 解析

## P1
- 修复清单按"血量"分级：critical / major / minor
- 引用原文截图 / 选择器位置

## P2
- 给 3 个对照样本（"如果按 Stripe / Linear / Anthropic 会怎么改"）
${COMMON_CHECKLIST_TAIL}`,
    layouts: `# Review Layouts

- 评分卡 + 长文 + 修复清单
- 用对照截图说明 before / after
`,
    components: `# Review Components

- Scorecard (5 维度)
- Issue card (severity / selector / fix)
- Inline diff block
`,
    themes: `# Review Themes

- 沿用目标设计的主题，把评审块用 reader-friendly serif 区分开
`,
    example: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Example</title>
<style>
  body { font-family: ui-serif, Georgia, serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #141413; }
  h1 { letter-spacing: -0.03em; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
  .cell { background: #f5f4ed; padding: 16px; border-radius: 12px; }
  .n { font-size: 36px; font-weight: 700; color: #c96442; }
</style></head><body>
  <h1>Design Review · Acme Landing</h1>
  <div class="grid">
    <div class="cell"><div>哲学</div><div class="n">8</div></div>
    <div class="cell"><div>层级</div><div class="n">7</div></div>
    <div class="cell"><div>执行</div><div class="n">6</div></div>
    <div class="cell"><div>功能</div><div class="n">9</div></div>
    <div class="cell"><div>创新</div><div class="n">5</div></div>
  </div>
</body></html>
`,
  },
};

async function ensureFile(filePath, content) {
  try {
    await fs.access(filePath);
    return false; // exists
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return true;
  }
}

function injectFrontmatter(raw, extra) {
  if (!raw.startsWith("---")) {
    return `---\n${extra}---\n\n${raw}`;
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  const head = raw.slice(0, end);
  const tail = raw.slice(end);
  if (head.includes("od:")) return raw; // already injected
  return `${head}\n${extra.trimEnd()}\n${tail.slice(1)}`;
}

const summary = [];
for (const [id, spec] of Object.entries(SKILLS)) {
  const dir = path.join(ROOT, id);
  const skillFile = path.join(dir, "SKILL.md");
  let raw;
  try {
    raw = await fs.readFile(skillFile, "utf-8");
  } catch {
    summary.push(`${id}: SKILL.md missing`);
    continue;
  }
  const newRaw = injectFrontmatter(raw, spec.extraFrontmatter);
  if (newRaw !== raw) await fs.writeFile(skillFile, newRaw, "utf-8");
  const writes = await Promise.all([
    ensureFile(path.join(dir, "assets/template.html"), spec.template),
    ensureFile(path.join(dir, "references/checklist.md"), spec.checklist),
    ensureFile(path.join(dir, "references/layouts.md"), spec.layouts),
    ensureFile(path.join(dir, "references/components.md"), spec.components),
    ensureFile(path.join(dir, "references/themes.md"), spec.themes),
    ensureFile(path.join(dir, "example.html"), spec.example),
  ]);
  const created = writes.filter(Boolean).length;
  summary.push(
    `${id}: frontmatter ${newRaw !== raw ? "patched" : "unchanged"}, created ${created} files`,
  );
}
console.log(summary.join("\n"));

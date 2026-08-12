---
name: bai-style
description: >-
  B.AI 风格设计系统——"暖调极简 AI SaaS"。用于把 Web/SaaS/AI 对话产品做成 B.AI、Codex.ai、Anthropic
  风格：奶油色背景 + 全胶囊化 + 彩色点缀单色界面 + 极细线性图标。当用户提到 B.AI 风、Codex.ai 风、暖色极简、奶油色 AI
  界面、对话框设计、AI dashboard、定价卡片、模型文档站、想要"很高级很克制"的 AI 产品 UI，就触发本 skill。
user-invocable: true
---

# B.AI 风格设计系统（暖调极简 AI SaaS）

> **本 skill 不是抄 Vercel/Linear。** 那是冷灰极简（zinc/neutral 系），B.AI 是 **暖调极简**（stone/cream 系）。两者的高级感来源不同，混用会失败。

## 视觉锚点（先看图，再读规范）

写代码前先打开 `reference/screenshots/` 对照原型：

| 截图 | 用途 |
|---|---|
| `chat-empty.png` | chat 空状态 + 侧边栏 + 顶栏，几乎覆盖全部核心组件 |
| `usage-dashboard.png` | 卡片、数字排版、极简折线图（无坐标轴） |
| `pricing.png` | 双栏定价卡 + "推荐"角标 + 黑色胶囊 CTA |
| `ai-docs.png` | 三栏文档布局（TOC / 内容 / On this page） |
| `landing-world-map.png` | landing 装饰：点阵世界地图 + 贝塞尔弧线 |

**做完任何页面，把成品和这 5 张图并排比对，错位的细节立刻能看出来。**

## 一、什么时候用本 skill

✅ 适用：
- AI 对话产品（chat UI、playground、dashboard）
- 模型/API 文档站
- AI 产品的定价页、用量页、设置页
- 任何想要"克制 + 温暖 + 一丝禅意"的 SaaS 产品

❌ 不适用：
- 强营销、强转化的 landing（这套风格转化率不一定高）
- 游戏化、消费类、面向 C 端年轻人的产品（太高冷）
- 需要强品牌色的产品（这套几乎是单色的）

## 二、核心设计哲学（非常重要，先理解这 5 条）

1. **暖白底，不是冷白底**：背景是奶油/米色（`#FAF9F5` ~ `#F8F6F1`），不是 `#FAFAFA`。这是和 Vercel/Linear 风最大的区别，也是和 Codex.ai 同源的标志。
2. **99% 单色 + 1% 彩色点缀**：界面 99% 是黑/灰/暖白，但**故意**保留几个彩色元素作为视觉锚点：用户头像渐变、聊天框旁的工具图标、模型选择器图标、淡桃色的"领取积分"按钮。这 1% 让 99% 不显得乏味。
3. **全胶囊化**：按钮、输入框、tag、模型选择器——能用 `rounded-full` 就用 `rounded-full`。卡片/容器才用 `rounded-2xl`。
4. **靠边框分层，不靠阴影**：1px 极浅暖灰描边 + 极轻 shadow（甚至没有）。深阴影会立刻让风格"塌"。
5. **大留白 + 主轴居中**：chat 主区域的内容**纵向居中**而不是顶对齐，留白比内容还多。这是高级感的关键。

## 三、设计 Token（直接复制到项目）

### 颜色（CSS 变量）

```css
:root {
  /* 暖调中性色——这套是核心，不要替换成 zinc/neutral */
  --bg-primary:    #FAF9F5;  /* 主背景：温暖的奶油白 */
  --bg-secondary:  #F4F2EC;  /* 侧边栏/次要区域：更深一档暖米 */
  --bg-card:       #FFFFFF;  /* 卡片：纯白，但放在暖底上自然柔和 */
  --bg-hover:      #EFEDE6;  /* hover/选中态 */

  --text-primary:   #1A1A19;  /* 标题/正文：偏暖的黑 */
  --text-secondary: #6B6B68;  /* 次要文字 */
  --text-tertiary:  #9D9D98;  /* placeholder */

  --border-default: #E8E5DD;  /* 1px 暖描边——核心 token */
  --border-strong:  #D8D4C9;  /* 强调描边（聚焦态） */

  --accent-primary: #1A1A19;  /* 主操作色就是黑 */
  --accent-text:    #FFFFFF;

  /* 1% 的彩色点缀（不要全用，挑 1-2 个作为产品 signature） */
  --accent-peach:   #F8DCCB;  /* 桃粉色 pill 背景（如"领取积分"） */
  --accent-mint:    #6FBF99;  /* 绿色图标（chat 工具栏） */
  --accent-violet:  #8B7FD9;  /* 紫色图标（chat 工具栏） */
  --accent-glow:    linear-gradient(135deg, #FFB8C0, #B8C5FF, #FFD9A8); /* 头像渐变 */
}
```

### Tailwind 配置（推荐用 v4 `@theme` 或 v3 extend）

```js
// tailwind.config.js (v3)
module.exports = {
  theme: {
    extend: {
      colors: {
        cream: {
          50:  '#FBFAF7',
          100: '#FAF9F5',
          200: '#F4F2EC',
          300: '#EFEDE6',
          400: '#E8E5DD',
          500: '#D8D4C9',
          600: '#9D9D98',
          700: '#6B6B68',
          800: '#3A3A38',
          900: '#1A1A19',
        },
        peach: { 100: '#F8DCCB', 200: '#F2C4A8' },
        mint:  { 500: '#6FBF99' },
        violet:{ 500: '#8B7FD9' },
      },
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
};
```

### 字体

- 英文/数字：**Inter**（首选）或 SF Pro
- 中文：**PingFang SC**（macOS）/ Noto Sans SC / HarmonyOS Sans
- 字重：标题 600/700，正文 400/500，placeholder 400
- 中文标题字号要比英文略小，行高 `leading-tight` (1.25)

### 阴影（克制使用）

```css
--shadow-card:  0 1px 2px 0 rgb(26 26 25 / 0.04);    /* 几乎看不见 */
--shadow-pop:   0 4px 12px 0 rgb(26 26 25 / 0.06);   /* hover 微浮起 */
/* 不要用 shadow-md/lg/xl，会立刻塌掉风格 */
```

## 四、核心组件规范

### 4.1 按钮

```tsx
// 主按钮：纯黑胶囊
<button className="rounded-full bg-cream-900 text-white px-5 py-2.5
                   text-sm font-medium hover:opacity-90 transition">
  立即购买
</button>

// 次按钮：白底暖描边胶囊
<button className="rounded-full bg-white border border-cream-400
                   text-cream-900 px-4 py-2 text-sm
                   hover:bg-cream-200 transition">
  取消
</button>

// 强调小 pill（带彩色点缀，比如"领取积分"）
<button className="rounded-full bg-peach-100 text-cream-900
                   px-3 py-1.5 text-xs font-medium
                   inline-flex items-center gap-1.5">
  <CheckCircle strokeWidth={1.5} size={14} />
  领取免费积分
</button>
```

### 4.2 输入框（chat 专用大胶囊）

```tsx
<div className="rounded-3xl border border-cream-400 bg-white
                px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]
                focus-within:border-cream-500 transition">
  <input
    className="w-full bg-transparent outline-none text-cream-900
               placeholder:text-cream-600"
    placeholder="询问任何问题"
  />
  <div className="flex items-center justify-between mt-3">
    <div className="flex items-center gap-2 text-cream-700">
      <button className="p-1.5 rounded-full hover:bg-cream-200">
        <Plus strokeWidth={1.5} size={18} />
      </button>
      {/* 这里就是 1% 的彩色点缀 */}
      <button className="p-1.5 rounded-full hover:bg-cream-200">
        <Leaf strokeWidth={1.5} size={18} className="text-mint-500" />
      </button>
      <button className="p-1.5 rounded-full hover:bg-cream-200">
        <Sparkle strokeWidth={1.5} size={18} className="text-violet-500" />
      </button>
    </div>
    <button className="w-8 h-8 rounded-full bg-cream-200 flex
                       items-center justify-center hover:bg-cream-300">
      <ArrowRight strokeWidth={1.5} size={16} />
    </button>
  </div>
</div>
```

### 4.3 卡片

```tsx
<div className="rounded-2xl bg-white border border-cream-400/80
                p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
  <div className="flex items-center gap-2 text-cream-700 text-sm">
    <CreditCard strokeWidth={1.5} size={16} />
    积分余额
  </div>
  <div className="mt-3 flex items-baseline gap-3">
    <span className="text-4xl font-semibold tracking-tight tabular-nums">
      500,000
    </span>
    <button className="rounded-full bg-peach-100 px-3 py-1 text-xs">
      + 充值
    </button>
  </div>
  <div className="mt-2 text-xs text-cream-600">赠送积分：500,000</div>
</div>
```

### 4.4 侧边栏

```tsx
<aside className="w-60 bg-cream-100 border-r border-cream-300 p-3
                  flex flex-col gap-1">
  <div className="px-3 py-4 mb-2">
    <Logo />
  </div>
  {[
    { icon: MessageSquare, label: '新对话', active: true },
    { icon: Database, label: '用量信息' },
    { icon: Cpu, label: 'API' },
    { icon: Wallet, label: '充值' },
  ].map(({ icon: Icon, label, active }) => (
    <button
      key={label}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition',
        active
          ? 'bg-cream-300 text-cream-900 font-medium'
          : 'text-cream-700 hover:bg-cream-200'
      )}
    >
      <Icon strokeWidth={1.5} size={18} />
      {label}
    </button>
  ))}
</aside>
```

### 4.5 图表（极简）

```tsx
// 关键：去掉所有 axis line，只保留虚线 grid
<ResponsiveContainer>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="2 4" stroke="#E8E5DD" vertical={false} />
    <XAxis axisLine={false} tickLine={false} stroke="#9D9D98" />
    <YAxis axisLine={false} tickLine={false} stroke="#9D9D98" />
    <Line stroke="#1A1A19" strokeWidth={1.5} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

### 4.6 头像（彩色锚点）

这是整个界面里**唯一**应该出现的强彩色，是产品的"signature"。**不是图片，不是 emoji，是 CSS 渐变球。**

```tsx
<div className="w-7 h-7 rounded-full
                bg-[conic-gradient(from_180deg,#FFB8C0,#B8C5FF,#FFD9A8,#FFB8C0)]
                ring-1 ring-cream-400" />
```

## 五、图标方案（这是"没有 AI 味"的关键）

> 详细逆向过程见 `reference/icons-deep-dive.md`。本节只给结论。

### 5.1 分两层用图标

**A 层：通用界面图标 → `lucide-react`**

侧边栏、顶栏、卡片表头、表单输入、导航——全部用 lucide。`reference/screenshots/chat-empty.png` 里的侧边栏 6 个图标（`MessageSquareMore` / `DatabaseZap` / `Cpu` / `Wallet` / `FileText` / `Radar`）就是直接来自 lucide。

```tsx
import { MessageSquareMore, Cpu, Radar, ArrowRight } from 'lucide-react';
<MessageSquareMore strokeWidth={1.5} size={18} />
```

- **`strokeWidth={1.5}`**：最重要的细节。lucide 默认是 2，立刻显粗笨。
- **size**：导航/按钮内 `16-18`，标题旁 `20-24`，hero `32+`。

**B 层：1% 彩色 signature 图标 → 自己画极简 SVG**

`chat-empty.png` 输入框工具栏里的薄荷绿"海鸥"和紫色"侦察"图标——**这两个不是图标库的，是品牌自定义 SVG**。如果直接从 lucide 抓 `Bird`、`Sparkles`、`Wand2` 来用，立刻一股 AI 味。

正确做法：自己画 2-3 笔的极简 SVG，配色用 token 里的 `--accent-mint` / `--accent-violet`：

```tsx
function GullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <path d="M3 14 C 7 8, 9 8, 12 12 C 15 8, 17 8, 21 14" />
    </svg>
  );
}
```

### 5.2 必须避免的图标（AI 味重灾区）

| 不要用 | 为什么 |
|---|---|
| `Sparkles` `Wand2` `Stars` 🪄 | 满屏 AI 产品都用，撞车严重 |
| `Bot` `Brain` `Cpu` 当装饰 | "我是 AI 产品"喊得太大声；`Cpu` 只在"API"入口处用一次 |
| Material Icons / FontAwesome | 实心、过粗，整体塌掉 |
| Heroicons 的 solid 版本 | 端点钝、视觉重，破坏暖调克制感 |
| emoji 当功能图标（🚀🔥✨🤖） | 与"克制"哲学冲突 |
| Phosphor / Tabler 混用 | 端点形状不同（phosphor 圆头 vs lucide 平头），混入会立刻显出"两套图标"

## 六、布局原则

### 主轴居中而非顶对齐

```tsx
// ✅ 正确：chat 空状态用 flex 让内容竖向居中
<main className="flex-1 flex flex-col items-center justify-center gap-6">
  <h1 className="text-3xl font-medium">欢迎使用 B.AI，有什么可以帮忙的？</h1>
  <ChatInput />
</main>

// ❌ 错误：内容贴到顶部，下方留白浪费
```

### 三栏文档布局（docs 站）

```
┌────────────┬──────────────────────────┬────────────┐
│  左侧 TOC  │       内容主区            │  On this   │
│  w-60      │   max-w-3xl mx-auto      │  page w-48 │
│  bg-cream  │   bg-cream-50            │  bg-cream  │
└────────────┴──────────────────────────┴────────────┘
```

## 七、装饰元素（landing 专用）

B.AI landing 有两个 signature 装饰：
1. **点阵世界地图**作为背景（SVG 或 canvas，dot size ~1.5px，间距 ~12px）
2. **贝塞尔弧线**从世界各地汇聚到中心 logo（动画：`stroke-dashoffset` 0→full）

实现思路：
- 用 `dotted-map` 库或 SVG `<pattern>` 生成 dot 矩阵
- 弧线用 `<path d="M x1 y1 Q cx cy x2 y2">` + `stroke-dasharray` 动画
- 颜色用 `#D8D4C9`（暖描边色），不要用纯黑

## 八、易踩坑（这些细节出错就立刻"塌"）

| 错误做法 | 正确做法 |
|---|---|
| 用 `bg-zinc-50` 做主背景 | 用 `#FAF9F5` 暖白 |
| 全界面纯黑白无彩色 | 保留 1% 彩色点缀（头像、工具图标、桃色 pill） |
| 按钮用 `rounded-md` | 主操作按钮统一 `rounded-full` |
| 卡片用 `shadow-md/lg` | 用 1px 暖描边 + `shadow-sm` 或无阴影 |
| 图标 strokeWidth 默认 2 | 强制 `strokeWidth={1.5}` |
| 用 emoji 当图标 | 全部用 lucide-react 线性图标 |
| 内容顶对齐 | 主区域 `items-center justify-center` |
| 图表带坐标轴线 | `axisLine={false} tickLine={false}` + 虚线 grid |
| Focus 用浏览器默认蓝色 outline | `focus:ring-2 focus:ring-cream-400 focus:outline-none` |

## 九、技术栈推荐（一天内搭出骨架）

```bash
# 1. 初始化（Next.js 15 + Tailwind v4）
npx create-next-app@latest my-ai --typescript --tailwind --app

# 2. 安装核心库
npm i lucide-react clsx tailwind-merge
npx shadcn@latest init           # 引入 shadcn/ui，但要改 theme 为暖色
npm i recharts                   # 图表

# 3. 字体（Next.js）
# app/layout.tsx
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
```

shadcn 默认是冷灰，**必须**手动改 `globals.css` 的 CSS 变量为本文件第三节的暖色 token。

## 十、参考文件

- `reference/screenshots/` — 5 张原型截图，写代码前先看
- `reference/icons-deep-dive.md` — 图标库逆向 + "为什么没有 AI 味"详解
- `reference/comparison.md` — 与 Vercel / OpenAI / Notion 风的差异对照
- `reference/shadcn-customization.md` — shadcn/ui 适配暖色 token
- `examples/` — 可运行组件（`BaiLayout` / `UsagePage` / `PricingCard` / `globals.css`）

## 十一、自检清单（交付前过一遍）

- [ ] 主背景是不是暖米色（不是 `#FAFAFA`）？
- [ ] 是不是至少有 1 个彩色锚点（头像 / 工具图标 / 桃色 pill）？
- [ ] 主按钮是不是 `rounded-full` 黑底？
- [ ] 所有图标 stroke-width 是不是 1.5？
- [ ] 描边是不是暖色（`#E8E5DD` 系），不是冷灰（`#E4E4E7` 系）？
- [ ] 有没有滥用阴影？默认应该没有或 `shadow-sm`。
- [ ] chat 空状态是不是纵向居中？
- [ ] 图表有没有去掉坐标轴线？
- [ ] 中英文混排有没有指定 `PingFang SC` fallback？

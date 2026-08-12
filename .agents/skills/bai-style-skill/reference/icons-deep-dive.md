# 图标库逆向 + "为什么没有 AI 味"

> 用户原话："它的图标我都挺喜欢的，没有 AI 味。"
> 这一节专门拆解：B.AI 用了什么图标方案，以及它如何避开常见的"AI 味"。

## 一、近距观察（截图见 `screenshots/`）

`screenshots/chat-empty.png` 中可分辨的图标：

**侧边栏（纯单色线性）**
| 标签 | 视觉特征 | 候选 |
|---|---|---|
| 新对话 | 圆角方气泡 + 内部三个小点/省略号 | `lucide:MessageSquareMore` ✅ |
| 用量信息 | 数据库圆柱 + 顶部一条向上扬起的小弧线 | `lucide:DatabaseZap` 或自定义 db+arrow |
| API | 方芯片 + 四向引脚 + 内框 | `lucide:Cpu` ✅ |
| 充值 | 钱包外形 + 内含小元素 | `lucide:Wallet` / `WalletMinimal` ✅ |
| 订阅 | 文件/卡片轮廓 | `lucide:FileText` 或 `ScrollText` |
| 记忆 | 同心圆点（雷达扫描状） | `lucide:Radar` ✅ |

**聊天工具栏（彩色，强 signature）**
| 视觉 | 颜色 | 候选 |
|---|---|---|
| `+` 圆形加号 | 黑 | `lucide:Plus` |
| 圆中带斜杠（禁用相机/无图像） | 黑 | `lucide:ImageOff` 或近似 |
| 一笔成型的"海鸥/飞鸟" | 薄荷绿 `#6FBF99` | **自定义 SVG**（lucide/phosphor 的 `Bird` 都更详细） |
| 类似耳朵+点的侦察图标 | 紫 `#8B7FD9` | **自定义 SVG** |

**右上角小图标**
| 标签 | 候选 |
|---|---|
| "领取免费积分"前的对勾圆 | `lucide:CheckCircle` |
| "500K"前的趋势线 | `lucide:TrendingUp` 或自定义 |

**用户头像**
- 不是图标，是 **CSS `conic-gradient`** 渲染的彩色球（pink + blue + peach），外加 1px 暖灰 ring。

## 二、推断结论

| 层 | 实际方案 | 把握度 |
|---|---|---|
| 通用界面（侧边栏、卡片、表头） | **lucide-react** (`strokeWidth=1.5`) | 高 |
| 文档站、tab 导航 | **lucide-react** | 高 |
| chat 工具栏的薄荷绿/紫色彩图标 | **品牌自定义 SVG**（不是图标库） | 中-高 |
| 用户头像 | **CSS 渐变**（不是图片，不是图标） | 高 |

**为什么不是 Phosphor / Tabler / Heroicons？**
- Phosphor 的端点是圆头（round line cap），截图里端点是平头 → 排除。
- Tabler 风格类似 lucide 但更"工程感"，标签栏会显得偏冷 → 不像。
- Heroicons 的 outline 比 lucide 粗（默认 1.5px 但视觉更"扁圆"），且通常和 Tailwind UI 组合出现的图标库感不同 → 不像。

**为什么 chat 工具栏图标判定为自定义？**
- lucide 的 `Bird` / phosphor 的 `Bird` 都是完整鸟身造型；截图里是简化到 2 笔的海鸥剪影，造型独立。
- 工具图标的"功能含义"（草稿/搜索/思考/语音）通常品牌会自己设计，作为产品识别点。

## 三、为什么"没有 AI 味"——四个反模式

下面这些是 AI 产品 UI 一眼就能看出来的"AI 味"特征，B.AI **全部回避了**。

| AI 味的常见做法 | B.AI 的做法 |
|---|---|
| 到处用 `Sparkles`、`Wand2`、`Stars`、🪄 当装饰 | 不用 magic-themed 图标，连 hero 区也不放 |
| 用 emoji 当功能图标（🚀🔥✨🤖） | 全部线性 lucide，单色 |
| 紫色霓虹/赛博渐变（#7C3AED 系） | 紫色只出现在 1 个 chat 工具按钮，且是柔和粉紫 `#8B7FD9` |
| 头像用 robot avatar 或彩色字母圆 | 抽象 conic-gradient 彩球，无具象 |
| Logo 是 AI 主题（脑/电路/星芒） | 自定义文字标 `B.AI`（衬线 + 几何） |
| 玻璃拟态 + 彩色光斑 | 暖白底 + 1px 暖描边，无玻璃效果 |
| 滥用 `Bot`、`Brain`、`Cpu` 满屏 | `Cpu` 只用一次（API 入口），点到为止 |

## 四、选用建议（写代码时直接照搬）

### 1. 通用图标 → 用 lucide

```tsx
import { MessageSquareMore, DatabaseZap, Cpu, Wallet, Radar } from 'lucide-react';
<MessageSquareMore strokeWidth={1.5} size={18} />
```

`strokeWidth=1.5` 是最重要的细节。lucide 默认是 `2`，会立刻显粗。

### 2. 1% 彩色 signature 图标 → 自己画 SVG

不要从图标库找"好看的鸟/耳朵/魔杖"——那一定撞 AI 味。自己画一个极简的、和品牌相关的 SVG，2-3 笔就够。

```tsx
// 例：极简飞鸟（薄荷绿 signature）
function GullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <path d="M3 14 C 7 8, 9 8, 12 12 C 15 8, 17 8, 21 14" />
    </svg>
  );
}

<GullIcon className="text-mint-500" />
```

### 3. 头像 → 用 CSS，不要用图片

```tsx
<div className="w-7 h-7 rounded-full ring-1 ring-cream-400
                bg-[conic-gradient(from_180deg,#FFB8C0,#B8C5FF,#FFD9A8,#FFB8C0)]" />
```

### 4. 一定不要用的图标

- `Sparkles`、`Wand2`、`Stars`（AI 味重灾区）
- `Bot`、`Brain`（除非真的是机器人 / 脑科学产品）
- 任何 emoji
- Heroicons 的 `solid` 版本（实心、过粗）

## 五、辨认 trick（以后看到一张图能秒判）

放大某个图标看 stroke 端点：
- 平头（直角端点）→ lucide / tabler
- 圆头（半圆端点）→ phosphor / heroicons
- 实心填充 → material / heroicons solid / FontAwesome

放大整体配色：
- 99% 单色 + 1-2 个彩色锚点 → B.AI / Claude.ai 系
- 多色情景图标（每个不同色） → Notion / 营销页风
- 渐变 + 高光 → 早期 AI 产品 / 玻璃拟态风

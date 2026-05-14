# 反 AI Slop 清单

以下是常见的「AI 设计味」陷阱，**禁用**：

## 配色禁忌

- ❌ 紫色渐变 + 蓝色渐变 + 粉色渐变（Stripe/Linear 风的 dupe）
- ❌ "Aurora" 风背景（多色径向渐变堆叠）
- ❌ 纯黑 #000 + 纯白 #FFF 高对比（除非任务要求 brutalist）
- ❌ 一个页面超过 3 个主色（accent / fg / bg 之外）

## 排版禁忌

- ❌ 居中对齐 + 巨大 hero 文案 + "Get started for free" 按钮的 SaaS 落地页万能模板
- ❌ "AI" / "AGI" / "Agent" 字样 + 闪光（sparkle）图标的滥用
- ❌ 任何 `text-shadow` glow 效果，除非用于 brutalist / tech-utility 方向
- ❌ 字体混搭超过 2 套（display + body 已经够）

## 组件禁忌

- ❌ 通用 Bootstrap Card（白底 + 阴影 + 圆角 8px + 一张图 + 标题 + 描述 + CTA）
- ❌ 客户/伙伴 logo 灰阶矩阵（"as featured in TechCrunch / Y Combinator"）
- ❌ 三栏 "Features / Benefits / Pricing" 万能盒子
- ❌ Lottie 风格的几何动图（除非有具体动效需求）

## 交互禁忌

- ❌ "hover 时整张卡片向上浮起 4px + 阴影加深"，已经被用烂
- ❌ Skeleton loader 在静态设计稿里完全没必要
- ❌ 模拟假数据（"John Doe 在 5 分钟前订阅了 Pro 计划"），除非任务明确要做 social proof

## 内容禁忌

- ❌ Lorem ipsum
- ❌ 占位词 "Your tagline here" / "Discover the future of XYZ"
- ❌ AI 自夸文案 ("Powered by AI", "Smarter than ever")，除非这正是品牌定位

## 如何避免

写一行 CSS 之前，先问自己三个问题：
1. **这个选择有具体动机吗？** 还是只是「设计应该这样」？
2. **拿掉它，用户体验会变差吗？** 不会就拿掉。
3. **三年后再看，会不会觉得过时？** 觉得就重新想。

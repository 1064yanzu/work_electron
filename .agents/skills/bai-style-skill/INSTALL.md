# 安装到你自己的项目

## 方式一：作为 Claude Code project skill（推荐）

把 `bai-style-skill/` 整个目录复制到你项目的 `.claude/skills/` 下：

```bash
mkdir -p /path/to/your-project/.claude/skills
cp -r bai-style-skill /path/to/your-project/.claude/skills/bai-style
```

之后在该项目里跟 Claude 说"用 B.AI 风格做个 dashboard"或"做个 chat 界面用 bai-style"，Claude 会自动加载这份 skill。

## 方式二：作为 user skill（所有项目通用）

```bash
mkdir -p ~/.claude/skills
cp -r bai-style-skill ~/.claude/skills/bai-style
```

## 方式三：直接拿代码用（不走 skill 机制）

如果不需要让 Claude 自动调用，只想要代码本身，把 `examples/` 下的文件复制到你项目对应位置即可：

```
examples/globals.css   →  app/globals.css（合并 @theme 块）
examples/BaiLayout.tsx →  app/page.tsx 或 components/
examples/UsagePage.tsx →  app/usage/page.tsx
examples/PricingCard.tsx → app/pricing/page.tsx
```

## 依赖

```bash
npm i lucide-react clsx recharts
```

如果要用 shadcn/ui 适配，参考 `reference/shadcn-customization.md`。

## 第一次跑通的最小路径

```bash
# 1. 新项目
npx create-next-app@latest my-bai-style --typescript --tailwind --app
cd my-bai-style

# 2. 复制 skill
mkdir -p .claude/skills
cp -r /path/to/bai-style-skill .claude/skills/bai-style

# 3. 安装依赖
npm i lucide-react clsx recharts

# 4. 让 Claude 接管
claude
> 用 .claude/skills/bai-style 这份 skill，把 app/page.tsx 改成 B.AI 风的 chat 首页
```

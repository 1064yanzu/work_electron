# shadcn/ui 改造指南（重点）

shadcn/ui 默认是冷灰风（zinc / neutral），直接用会和 B.AI 风冲突。**必须**改造它的 CSS 变量。

## 第一步：替换 `app/globals.css` 的 CSS 变量

shadcn 默认生成的：

```css
@layer base {
  :root {
    --background: 0 0% 100%;          /* 纯白 */
    --foreground: 240 10% 3.9%;       /* 冷黑 */
    --border: 240 5.9% 90%;           /* 冷灰描边 */
    /* ... */
  }
}
```

改成：

```css
@layer base {
  :root {
    --background: 45 27% 97%;         /* #FAF9F5 暖奶油 */
    --foreground: 60 3% 10%;          /* #1A1A19 暖黑 */
    --card: 0 0% 100%;
    --card-foreground: 60 3% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 60 3% 10%;
    --primary: 60 3% 10%;
    --primary-foreground: 0 0% 100%;
    --secondary: 45 20% 93%;          /* #F4F2EC */
    --secondary-foreground: 60 3% 10%;
    --muted: 45 20% 93%;
    --muted-foreground: 45 3% 42%;    /* #6B6B68 */
    --accent: 45 30% 90%;
    --accent-foreground: 60 3% 10%;
    --border: 42 18% 89%;             /* #E8E5DD 暖描边 */
    --input: 42 18% 89%;
    --ring: 45 15% 75%;               /* #D8D4C9 */
    --radius: 1rem;                   /* 默认调大 */
  }

  .dark {
    /* 如果要做深色模式，参考 Anthropic 文档站的暖深色 */
    --background: 30 5% 8%;
    --foreground: 45 15% 92%;
    /* ... */
  }
}
```

## 第二步：把 Button 默认 radius 改大

shadcn 默认 `rounded-md`，改成 `rounded-full` 适配胶囊化原则：

```tsx
// components/ui/button.tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full text-sm font-medium ...',
  // 原来是 rounded-md
);
```

## 第三步：Input 改大胶囊化

```tsx
// components/ui/input.tsx
className={cn(
  'flex h-11 w-full rounded-full border border-input bg-background px-5 py-2 ...',
  className
)}
```

## 第四步：禁用默认 ring 蓝色

shadcn 默认 focus 用蓝色 ring，要改成暖灰：

```css
--ring: 45 15% 75%;  /* 已在第一步改好 */
```

## 第五步：补全暖色 + 彩色点缀

shadcn 不会自动给你彩色 token，需要在 `tailwind.config.js` 手动加：

```js
extend: {
  colors: {
    peach:  { 100: '#F8DCCB', 200: '#F2C4A8' },
    mint:   { 500: '#6FBF99' },
    violet: { 500: '#8B7FD9' },
  },
}
```

## 验证：跑一遍 shadcn-ui 的 demo

执行 `npx shadcn@latest add card button input` 添加几个组件，扔到页面上看：

- [ ] Card 是不是浮在暖底上？描边是不是暖色？
- [ ] Button 默认是不是胶囊？
- [ ] Input focus 时是不是暖灰 ring 而不是蓝 ring？
- [ ] 整体感觉是不是"温暖、克制、有呼吸感"？

如果三项以上没达到，回去检查 CSS 变量的色相（Hue），最常见的错误是把 `--background` 留成了 0% 0% 100%（纯白），高级感会立刻消失。

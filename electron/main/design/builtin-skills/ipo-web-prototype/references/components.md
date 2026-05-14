# Web Prototype Components

## Button

```html
<button class="btn-primary">Get started</button>
```
```css
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
```

## Card

- 不画死板边框，用 `box-shadow: 0 0 0 1px var(--border)` 做 ring
- hover 时 ring 颜色变深，不要 lift 阴影

## Nav

- 透明 + 滚动后 `backdrop-filter: blur(12px)` 凝固
- 高度 56-64px，logo + 3-5 个一级导航

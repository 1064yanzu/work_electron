/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        serif: ['"Merriweather"', '"Georgia"', "serif"],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      transitionTimingFunction: {
        "ease-out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "ease-in-expo": "cubic-bezier(0.55, 0, 1, 0.45)",
        "ease-in-out-expo": "cubic-bezier(0.65, 0, 0.35, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        50: "50ms",
        100: "100ms",
        150: "150ms",
        250: "250ms",
        400: "400ms",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2s linear infinite",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
        "bounce-subtle": "bounceSubtle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "spin-slow": "spin 2s linear infinite",
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        "scan-line": "scanLine 2.5s ease-in-out infinite",
        "swarm-indeterminate": "swarmIndeterminate 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(1rem)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        bounceSubtle: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.97)" },
          "100%": { transform: "scale(1)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        scanLine: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        swarmIndeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(200%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      colors: {
        // ============================================
        // Claude / Anthropic 设计系统 — 完整暖色调色板
        // ============================================

        // 主背景 - 羊皮纸色调
        background: "#f5f4ed", // Parchment — 主页面背景
        surface: "#faf9f5", // Ivory — 卡片/浮层表面
        border: "#e8e6dc", // Border Warm — 主要边框

        // 主品牌色 - 陶土橙
        primary: {
          DEFAULT: "#c96442", // Terracotta Brand
          hover: "#b5573a", // 悬停深化
          foreground: "#faf9f5", // Ivory 前景文字
          muted: "rgba(201,100,66,0.12)", // 淡色背景
        },

        // 文字色阶 — 全部暖色调
        text: {
          primary: "#141413", // Anthropic Near Black
          secondary: "#5e5d59", // Olive Gray
          muted: "#87867f", // Stone Gray
          light: "#b0aea5", // Warm Silver (用于深色背景)
          dark: "#3d3d3a", // Dark Warm
          charcoal: "#4d4c48", // Charcoal Warm
        },

        // 暖色中性色阶 — 替代 zinc 的暖色版本
        warm: {
          50: "#faf9f5", // Ivory
          100: "#f5f4ed", // Parchment
          200: "#f0eee6", // Border Cream
          300: "#e8e6dc", // Border Warm / Warm Sand
          400: "#d1cfc5", // Ring Warm
          500: "#b0aea5", // Warm Silver
          600: "#87867f", // Stone Gray
          700: "#5e5d59", // Olive Gray
          800: "#4d4c48", // Charcoal Warm
          850: "#3d3d3a", // Dark Warm
          900: "#30302e", // Dark Surface
          950: "#1e1d1b", // Deeper dark
        },

        // 深色模式表面
        dark: {
          bg: "#141413", // Deep Dark — 深色背景
          surface: "#30302e", // Dark Surface — 深色容器
          border: "#30302e", // Dark Border
          muted: "#1e1d1b", // 更深的暗色
        },

        // 语义色 — 保持暖色系
        error: "#b53333", // Error Crimson
        focus: "#3898ec", // Focus Blue (唯一冷色，仅用于无障碍)
        success: "#4a7c59", // 暖绿色调

        // 布局专用色
        panel: {
          input: "#faf9f5", // Ivory
          process: "#f5f4ed", // Parchment
          output: "#ffffff",
        },

        // 阴影环 — Claude 签名的环形阴影
        ring: {
          warm: "#d1cfc5", // Ring Warm
          subtle: "#e8e6dc", // Ring Subtle
          deep: "#c2c0b6", // Ring Deep
        },
      },
    },
  },
  plugins: [],
};

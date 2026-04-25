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
				"bounce-subtle":
					"bounceSubtle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
				"spin-slow": "spin 2s linear infinite",
				"pulse-slow": "pulseSlow 3s ease-in-out infinite",
				"scan-line": "scanLine 2.5s ease-in-out infinite",
				"swarm-indeterminate":
					"swarmIndeterminate 1.5s ease-in-out infinite",
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
				// 主题感知色彩 — 通过 CSS 变量驱动
				// 所有关键颜色都引用 --t-* 变量，切换主题时实时生效
				// ============================================

				// 主背景
				background: "var(--t-bg, #f5f4ed)",
				surface: "var(--t-bg-surface, #faf9f5)",
				border: "var(--t-border, #e8e6dc)",

				// 主品牌色
				primary: {
					DEFAULT: "var(--t-primary, #c96442)",
					hover: "var(--t-primary-hover, #b5573a)",
					foreground: "var(--t-primary-fg, #faf9f5)",
					muted: "var(--t-primary-muted, rgba(201,100,66,0.12))",
				},

				// 文字色阶
				text: {
					primary: "var(--t-text-primary, #141413)",
					secondary: "var(--t-text-secondary, #5e5d59)",
					muted: "var(--t-text-muted, #87867f)",
					light: "var(--t-text-muted, #b0aea5)",
					dark: "var(--t-text-secondary, #3d3d3a)",
					charcoal: "var(--t-text-secondary, #4d4c48)",
				},

				// 暖色中性色阶 — 保留静态值（用量少、对主题感知不关键）
				warm: {
					50: "var(--t-bg-surface, #faf9f5)",
					100: "var(--t-bg, #f5f4ed)",
					200: "var(--t-bg-muted, #f0eee6)",
					300: "var(--t-border, #e8e6dc)",
					400: "#d1cfc5",
					500: "var(--t-text-muted, #b0aea5)",
					600: "var(--t-text-muted, #87867f)",
					700: "var(--t-text-secondary, #5e5d59)",
					800: "#4d4c48",
					850: "#3d3d3a",
					900: "var(--t-bg-muted, #30302e)",
					950: "var(--t-bg-surface, #1e1d1b)",
				},

				// 深色模式表面
				dark: {
					bg: "var(--t-bg, #141413)",
					surface: "var(--t-bg-muted, #30302e)",
					border: "var(--t-border, #30302e)",
					muted: "var(--t-bg-surface, #1e1d1b)",
				},

				// 语义色 — 保持不变
				error: "#b53333",
				focus: "#3898ec",
				success: "#4a7c59",

				// 布局专用色
				panel: {
					input: "var(--t-bg-surface, #faf9f5)",
					process: "var(--t-bg, #f5f4ed)",
					output: "#ffffff",
				},

				// 阴影环
				ring: {
					warm: "#d1cfc5",
					subtle: "var(--t-border, #e8e6dc)",
					deep: "#c2c0b6",
				},
			},
		},
	},
	plugins: [],
};

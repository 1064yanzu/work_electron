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
				"mascot-float": "mascotFloat 3.6s ease-in-out infinite",
				"thinking-dot": "thinkingDot 1.2s ease-in-out infinite",
				"file-progress": "fileProgress 1.2s ease-in-out infinite",
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
				mascotFloat: {
					"0%, 100%": { transform: "translateY(0)" },
					"50%": { transform: "translateY(-6px)" },
				},
				thinkingDot: {
					"0%, 80%, 100%": { opacity: "0.25", transform: "scale(0.85)" },
					"40%": { opacity: "1", transform: "scale(1.1)" },
				},
				fileProgress: {
					"0%": { transform: "translateX(-100%)" },
					"50%": { transform: "translateX(150%)" },
					"100%": { transform: "translateX(-100%)" },
				},
			},
			colors: {
				// ============================================
				// 主题感知色彩 — 通过 CSS 变量驱动
				// 所有关键颜色都引用 --t-* 变量，切换主题时实时生效
				// ============================================

				// 主背景
				background: "var(--t-bg, #FAF9F5)",
				surface: "var(--t-bg-surface, #FFFFFF)",
				border: "var(--t-border, #E8E5DD)",

				// 主品牌色
				primary: {
					DEFAULT: "var(--t-primary, #1A1A19)",
					hover: "var(--t-primary-hover, #2A2A28)",
					foreground: "var(--t-primary-fg, #FFFFFF)",
					muted: "var(--t-primary-muted, rgba(26,26,25,0.06))",
				},

				// 文字色阶
				text: {
					primary: "var(--t-text-primary, #1A1A19)",
					secondary: "var(--t-text-secondary, #6B6B68)",
					muted: "var(--t-text-muted, #9D9D98)",
					light: "var(--t-text-muted, #B5B3AC)",
					dark: "var(--t-text-secondary, #3A3A38)",
					charcoal: "var(--t-text-secondary, #3A3A38)",
				},

				// ============================================
				// B.AI 暖调中性色阶（cream 系列）— 核心 token
				// ============================================
				cream: {
					50: "#FBFAF7",
					100: "#FAF9F5", // 主背景
					200: "#F4F2EC", // 侧边栏 / 次要
					300: "#EFEDE6", // 选中态
					400: "#E8E5DD", // 默认描边
					500: "#D8D4C9", // 强描边
					600: "#9D9D98", // 三级文字
					700: "#6B6B68", // 次要文字
					800: "#3A3A38",
					900: "#1A1A19", // 主文字 / 主操作
				},

				// ============================================
				// 1% 彩色锚点（仅作 signature，不要全用）
				// ============================================
				peach: {
					100: "#F8DCCB", // 桃色 pill 背景（如"领取积分"）
					200: "#F2C4A8",
					500: "#E8A77A",
				},
				mint: {
					300: "#B4E0CC",
					500: "#6FBF99", // 工具栏图标点缀
					600: "#5BA683",
				},
				violetx: {
					300: "#C5BDF0",
					500: "#8B7FD9", // 工具栏图标点缀
					600: "#7268C5",
				},

				// 暖色中性色阶 — 兼容现有引用
				warm: {
					50: "var(--t-bg-surface, #FFFFFF)",
					100: "var(--t-bg, #FAF9F5)",
					200: "var(--t-bg-muted, #F4F2EC)",
					300: "var(--t-border, #E8E5DD)",
					400: "#D8D4C9",
					500: "var(--t-text-muted, #9D9D98)",
					600: "var(--t-text-muted, #9D9D98)",
					700: "var(--t-text-secondary, #6B6B68)",
					800: "#3A3A38",
					850: "#2D2D2B",
					900: "var(--t-bg-muted, #1A1A19)",
					950: "var(--t-bg-surface, #0F0F0E)",
				},

				// 深色模式表面
				dark: {
					bg: "var(--t-bg, #1A1A19)",
					surface: "var(--t-bg-muted, #222220)",
					border: "var(--t-border, #2F2F2C)",
					muted: "var(--t-bg-surface, #2A2A28)",
				},

				// 语义色 — 接主题 token（themeDefinitions.ts 的 --t-success/--t-error/...），
				// 旧硬编码值作为 var() 兜底，所有 text-success / bg-error 等类名自动主题化
				error: "var(--t-error, #b53333)",
				"error-muted": "var(--t-error-muted, rgba(181,51,51,0.12))",
				focus: "var(--t-info, #3898ec)",
				success: "var(--t-success, #4a7c59)",
				"success-muted": "var(--t-success-muted, rgba(74,124,89,0.12))",
				warning: "var(--t-warning, #d97706)",
				"warning-muted": "var(--t-warning-muted, rgba(217,119,6,0.12))",
				info: "var(--t-info, #2563eb)",
				"info-muted": "var(--t-info-muted, rgba(37,99,235,0.12))",

				// 品牌签名色 — 赤陶橙（CLAUDE.md 钦定主色）。
				// 与 --t-primary 不同：primary 随主题变化（bai 主题下是黑色），
				// terracotta 是跨主题稳定的 1% 签名锚点（Swarm 卡片、action CTA）。
				terracotta: {
					DEFAULT: "#D96C46",
					hover: "#C25A38",
					active: "#A8482B",
				},

				// 布局专用色
				panel: {
					input: "var(--t-bg-surface, #FFFFFF)",
					process: "var(--t-bg, #FAF9F5)",
					output: "#ffffff",
				},

				// 阴影环
				ring: {
					warm: "#D8D4C9",
					subtle: "var(--t-border, #E8E5DD)",
					deep: "#C2BEB1",
				},
			},
			borderRadius: {
				"2xl": "1rem",
				"3xl": "1.5rem",
			},
			boxShadow: {
				// B.AI 风格克制阴影
				"bai-card": "0 1px 2px 0 rgb(26 26 25 / 0.04)",
				"bai-pop": "0 4px 12px 0 rgb(26 26 25 / 0.06)",
				"bai-ring": "0 0 0 1px rgb(232 229 221)",
			},
		},
	},
	plugins: [],
};

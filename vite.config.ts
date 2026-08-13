import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

// https://vitejs.dev/config/
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
		dedupe: ["react", "react-dom"],
	},
	esbuild: {
		// 生产构建剥离 debugger 与非关键 console；保留 console.warn/error 用作
		// 兜底排查（P2-5 渲染端 error 收口会把它们经 IPC 写入 winston）。
		drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
		pure:
			process.env.NODE_ENV === "production"
				? ["console.log", "console.info", "console.debug", "console.trace"]
				: [],
	},
	build: {
		sourcemap: false,
		rollupOptions: {
			external: [
				"@anthropic-ai/claude-agent-sdk",
				"@libsql/client",
				"@libsql/darwin-arm64",
				"@libsql/linux-x64",
				"@libsql/win32-x64",
				"jsdom",
				// Node-only deps accidentally pulled into renderer graph
				"discord.js",
				"@discordjs/ws",
				"zlib-sync",
				"bufferutil",
				"utf-8-validate",
				"@slack/bolt",
				"@slack/web-api",
				"grammy",
				"@larksuiteoapi/node-sdk",
			],
		},
	},
	optimizeDeps: {
		exclude: [
			"@anthropic-ai/claude-agent-sdk",
			"discord.js",
			"@discordjs/ws",
			"zlib-sync",
			"@slack/bolt",
			"@slack/web-api",
			"grammy",
			"@larksuiteoapi/node-sdk",
		],
	},
	plugins: [
		react(),
		electron({
			main: {
				// `build.lib.entry`：index 为主进程入口；parser-worker 为
				// utilityProcess 解析进程入口（JSDOM/Readability/EPUB 重解析
				// 移出主线程，见 electron/main/workers/）。产物均落在
				// dist-electron/ 下（entryFileNames: "[name].js"）。
				entry: {
					index: "electron/main/index.ts",
					"parser-worker": "electron/main/workers/parser-worker.ts",
				},
				vite: {
					esbuild: {
						drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
						pure:
							process.env.NODE_ENV === "production"
								? [
										"console.log",
										"console.info",
										"console.debug",
										"console.trace",
									]
								: [],
					},
					build: {
						sourcemap: false,
						rollupOptions: {
							external: [
								// Must be external: SDK uses import.meta.url to locate cli.js at
								// runtime; bundling it would make the path point to dist-electron/.
								"@anthropic-ai/claude-agent-sdk",
								"@libsql/client",
								"@libsql/darwin-arm64",
								"@libsql/linux-x64",
								"@libsql/win32-x64",
								"jsdom",
								// CJS-only modules that break when bundled into ESM output
								"@larksuiteoapi/node-sdk",
								"bufferutil",
								"utf-8-validate",
								"discord.js",
								"@discordjs/ws",
								"zlib-sync",
								// Native addon
								"node-pty",
								// @xterm/headless@6.0.0 的 package.json 把 module 字段指向不存在的
								// lib/xterm.mjs（实际产物在 lib-headless/），vite 的 commonjs resolver
								// 会报 "Failed to resolve entry"。作为 node-only 包，让它走 runtime
								// require 是最稳妥的。
								"@xterm/headless",
								// electron-updater 依赖 app-builder-lib（只在 electron-builder 安装链中存在），
								// bundle 后 require 会失败，必须保留为外部依赖
								"electron-updater",
								// PDF 解析依赖 pdf.worker.mjs 通过 import.meta.url 定位同级 worker 文件
								// 打平进 dist-electron 后路径失效，必须保留为外部 require
								"pdf-parse",
								"pdfjs-dist",
								// sharp 通过 dynamic require 加载 @img/sharp-<platform> 原生 .node，
								// 被 rollup-cjs 静态打平后路径会丢，必须保留为外部依赖
								"sharp",
								/^@img\/sharp-/,
							],
							output: {
								// 强制主进程使用 CJS 格式，避免 "type":"module" 导致
								// ESM 输出后 electron 模块无法提供命名导出的问题
								format: "cjs",
								entryFileNames: "[name].js",
							},
						},
					},
				},
			},
			preload: {
				// Shortcut of `build.rollupOptions.input`.
				// Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
				input: path.join(__dirname, "electron/preload/index.ts"),
				vite: {
					esbuild: {
						drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
						pure:
							process.env.NODE_ENV === "production"
								? [
										"console.log",
										"console.info",
										"console.debug",
										"console.trace",
									]
								: [],
					},
					build: {
						sourcemap: false,
					},
				},
			},
			// Ployfill the Electron and Node.js API for Renderer process.
			// If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
			// See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
			renderer:
				process.env.NODE_ENV === "test"
					? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
						undefined
					: {},
		}),
	],
});

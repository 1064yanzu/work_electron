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
	build: {
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
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;

					if (
						id.includes("/react/") ||
						id.includes("/react-dom/") ||
						id.includes("scheduler")
					) {
						return "react-vendor";
					}

					if (id.includes("/mermaid/")) {
						return "markdown-mermaid";
					}

					if (
						id.includes("/react-pdf/") ||
						id.includes("/pdfjs-dist/") ||
						id.includes("/mammoth/")
					) {
						return "pdf-docx";
					}

					if (
						id.includes("/@xyflow/") ||
						id.includes("/cytoscape/") ||
						id.includes("/dagre")
					) {
						return "graph";
					}

					if (id.includes("/lucide-react/")) {
						return "icons";
					}
				},
			},
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
				// Shortcut of `build.lib.entry`.
				entry: "electron/main/index.ts",
				vite: {
					build: {
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

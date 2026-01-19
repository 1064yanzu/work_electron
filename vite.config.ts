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
			],
		},
	},
	optimizeDeps: {
		exclude: ["@anthropic-ai/claude-agent-sdk"],
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
								"@libsql/client",
								"@libsql/darwin-arm64",
								"@libsql/linux-x64",
								"@libsql/win32-x64",
								"jsdom",
							],
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

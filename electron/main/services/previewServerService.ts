/**
 * 预览服务器服务
 * 为每个 Agent 沙盒任务维护独立的预览服务器实例
 * 支持三种模式：
 *   - dev:    启动 Vite/Webpack 等 dev server，通过反向代理暴露
 *   - static: Express 静态文件服务 + SPA fallback
 *   - single: 单 HTML 文件，无需启动服务器
 */
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { findAvailablePort } from "../http/ports";
import { BatchedSender } from "../utils/batchedSender";
import type { BrowserWindow } from "electron";
import { DevServerProcessService } from "./devServerProcessService";

// ──── 类型 ────────────────────────────────────────────────

export type PreviewMode = "dev" | "static" | "single";

export interface PreviewServerInstance {
	taskId: string;
	port: number;
	url: string;
	mode: PreviewMode;
	ready: boolean;
	server?: Server;
	devProcess?: DevServerProcessService;
}

export type PreviewServerEvent = {
	taskId: string;
	type: "starting" | "ready" | "error" | "log";
	payload?: unknown;
};

export interface PreviewStartResult {
	port: number;
	url: string;
	mode: PreviewMode;
	processId?: number;
}

// ──── 常量 ────────────────────────────────────────────────

const PORT_RANGE_START = 7300;
const PORT_RANGE_ATTEMPTS = 100;

// ──── 服务类 ──────────────────────────────────────────────

class PreviewServerService {
	private instances = new Map<string, PreviewServerInstance>();
	private sender: BatchedSender<PreviewServerEvent>;

	constructor(getMainWindow: () => BrowserWindow | null) {
		this.sender = new BatchedSender<PreviewServerEvent>(
			"preview-server-event",
			getMainWindow,
		);
	}

	/**
	 * 检测沙盒目录的预览模式
	 * - 有 package.json 且 scripts.dev 存在 → "dev"
	 * - 有 index.html 或多个 .html 文件 → "static"
	 * - 仅单个 .html → "single"
	 */
	async detectMode(sandboxDir: string): Promise<PreviewMode> {
		// 检查是否有 package.json 且包含 dev script
		try {
			const pkgPath = path.join(sandboxDir, "package.json");
			const pkgRaw = await fs.readFile(pkgPath, "utf8");
			const pkg = JSON.parse(pkgRaw) as {
				scripts?: Record<string, string>;
			};
			if (pkg.scripts?.dev) {
				return "dev";
			}
		} catch {
			// 无 package.json 或解析失败，继续
		}

		// 扫描 HTML 文件
		try {
			const entries = await fs.readdir(sandboxDir);
			const htmlFiles = entries.filter((e) => e.endsWith(".html"));

			if (htmlFiles.length === 0) {
				// 无 HTML 文件，检查子目录是否有 index.html
				for (const entry of entries) {
					try {
						const stat = await fs.stat(path.join(sandboxDir, entry));
						if (stat.isDirectory()) {
							await fs.access(path.join(sandboxDir, entry, "index.html"));
							return "static";
						}
					} catch {
						// 继续
					}
				}
				return "static"; // 默认回退
			}

			if (htmlFiles.length === 1 && !htmlFiles.includes("index.html")) {
				return "single";
			}

			return "static";
		} catch {
			return "static";
		}
	}

	/**
	 * 启动预览服务器
	 * @param taskId   Agent 任务 ID
	 * @param sandboxDir 沙盒目录路径
	 * @param forceMode  强制指定模式（可选，默认自动检测）
	 */
	async start(
		taskId: string,
		sandboxDir: string,
		forceMode?: PreviewMode,
	): Promise<PreviewStartResult> {
		// 已存在则先停止
		if (this.instances.has(taskId)) {
			await this.stop(taskId);
		}

		const mode = forceMode ?? (await this.detectMode(sandboxDir));
		this.emitEvent(taskId, "starting", { mode });

		try {
			switch (mode) {
				case "single": {
					return await this.startSingleMode(taskId, sandboxDir);
				}
				case "static": {
					return await this.startStaticMode(taskId, sandboxDir);
				}
				case "dev": {
					return await this.startDevMode(taskId, sandboxDir);
				}
				default: {
					// 不可达，但 TypeScript 需要
					throw new Error(`未知的预览模式: ${mode}`);
				}
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.emitEvent(taskId, "error", { message: msg });
			throw error;
		}
	}

	/**
	 * 停止指定任务的预览服务器
	 */
	async stop(taskId: string): Promise<boolean> {
		const instance = this.instances.get(taskId);
		if (!instance) return false;

		// 停止 dev 子进程
		if (instance.devProcess) {
			instance.devProcess.kill();
			instance.devProcess.removeAllListeners();
		}

		// 关闭 Express 服务器
		if (instance.server) {
			await new Promise<void>((resolve) => {
				instance.server!.close(() => resolve());
			});
		}

		this.instances.delete(taskId);
		return true;
	}

	/**
	 * 查询预览服务器状态
	 */
	status(taskId: string): {
		running: boolean;
		mode?: PreviewMode;
		url?: string;
		port?: number;
		ready?: boolean;
	} {
		const instance = this.instances.get(taskId);
		if (!instance) {
			return { running: false };
		}
		return {
			running: true,
			mode: instance.mode,
			url: instance.url,
			port: instance.port,
			ready: instance.ready,
		};
	}

	/**
	 * 获取单 HTML 文件路径（single 模式用）
	 */
	async getSingleFilePath(taskId: string): Promise<string | null> {
		const instance = this.instances.get(taskId);
		if (!instance || instance.mode !== "single") return null;

		// 从 instance.url 提取文件路径（url 格式: file:///path/to/file.html）
		const filePath = instance.url.replace("file://", "");
		return filePath;
	}

	/**
	 * 应用退出时清理所有实例
	 */
	async destroyAll(): Promise<void> {
		const taskIds = [...this.instances.keys()];
		await Promise.all(taskIds.map((id) => this.stop(id)));
		this.sender.dispose();
	}

	// ──── 私有方法：各模式启动 ──────────────────────────────

	/**
	 * single 模式：单 HTML 文件
	 *
	 * 设计取舍：早期版本通过 `file://` 协议直接加载磁盘文件，
	 * 但在 dev 主窗口（http://localhost）和 sandbox iframe 双重约束下，
	 * Electron 默认 webSecurity 会拦截跨源 file://，且路径中的空格
	 * （macOS `Application Support`）未编码也会导致 iframe 加载失败。
	 *
	 * 因此 single 模式同样起一个本地 Express，URL 改为 http://127.0.0.1:port
	 * 的形式，由 express.static 自动处理路径编码与 MIME，避免上述坑。
	 * 与 static 模式的差异仅保留在 `mode` 字段上，前端 UI 仍可据此区分。
	 */
	private async startSingleMode(
		taskId: string,
		sandboxDir: string,
	): Promise<PreviewStartResult> {
		const htmlFile = this.findSingleHtmlSync(sandboxDir);
		if (!htmlFile) {
			throw new Error(`在 ${sandboxDir} 中未找到 HTML 文件`);
		}

		const port = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_ATTEMPTS);
		const host = "127.0.0.1";

		const app = express();

		app.use((_req, res, next) => {
			res.header("Access-Control-Allow-Origin", "*");
			res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
			res.header("Access-Control-Allow-Headers", "Content-Type");
			next();
		});

		// 静态文件服务：以单 HTML 作为默认入口，其他相对资源（图片/JS）也能访问
		app.use(
			express.static(sandboxDir, {
				index: htmlFile,
				dotfiles: "deny",
			}),
		);

		// 兜底：未匹配到的请求返回该 HTML（保证 / 能直接打开）
		// Express 5 / path-to-regexp v8 不再支持裸 "*"，必须命名通配符 "/*splat"
		app.get("/*splat", async (_req, res) => {
			try {
				await fs.access(path.join(sandboxDir, htmlFile));
				res.sendFile(path.join(sandboxDir, htmlFile));
			} catch {
				res.status(404).send("Not Found");
			}
		});

		const server = await new Promise<Server>((resolve, reject) => {
			const s = app.listen(port, host, () => resolve(s));
			s.on("error", reject);
		});

		const url = `http://${host}:${port}/`;

		const instance: PreviewServerInstance = {
			taskId,
			port,
			url,
			mode: "single",
			ready: true,
			server,
		};
		this.instances.set(taskId, instance);
		this.emitEvent(taskId, "ready", { mode: "single", url, port });

		return { port, url, mode: "single" };
	}

	/**
	 * static 模式：Express 静态文件服务 + SPA fallback
	 */
	private async startStaticMode(
		taskId: string,
		sandboxDir: string,
	): Promise<PreviewStartResult> {
		const port = await findAvailablePort(PORT_RANGE_START, PORT_RANGE_ATTEMPTS);
		const host = "127.0.0.1";

		const app = express();

		// CORS：允许 iframe 跨域加载
		app.use((_req, res, next) => {
			res.header("Access-Control-Allow-Origin", "*");
			res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
			res.header("Access-Control-Allow-Headers", "Content-Type");
			next();
		});

		// 静态文件服务
		app.use(
			express.static(sandboxDir, {
				index: "index.html",
				dotfiles: "deny",
			}),
		);

		// SPA fallback：非文件请求返回 index.html
		// Express 5 / path-to-regexp v8 不再支持裸 "*"，必须命名通配符 "/*splat"
		app.get("/*splat", async (_req, res) => {
			try {
				await fs.access(path.join(sandboxDir, "index.html"));
				res.sendFile(path.join(sandboxDir, "index.html"));
			} catch {
				res.status(404).send("Not Found");
			}
		});

		const server = await new Promise<Server>((resolve, reject) => {
			const s = app.listen(port, host, () => resolve(s));
			s.on("error", reject);
		});

		const url = `http://${host}:${port}`;

		const instance: PreviewServerInstance = {
			taskId,
			port,
			url,
			mode: "static",
			ready: true,
			server,
		};
		this.instances.set(taskId, instance);
		this.emitEvent(taskId, "ready", { mode: "static", url, port });

		return { port, url, mode: "static" };
	}

	/**
	 * dev 模式：启动 dev server 子进程 + 反向代理
	 */
	private async startDevMode(
		taskId: string,
		sandboxDir: string,
	): Promise<PreviewStartResult> {
		// 先为 dev server 找一个端口
		const devPort = await findAvailablePort(
			PORT_RANGE_START,
			PORT_RANGE_ATTEMPTS,
		);
		// 再为代理找一个端口（不能与 dev server 端口相同）
		const proxyPort = await findAvailablePort(devPort + 1, PORT_RANGE_ATTEMPTS);
		const host = "127.0.0.1";

		// 创建 dev server 子进程
		const devProcess = new DevServerProcessService({
			cwd: sandboxDir,
			port: devPort,
			host,
		});

		// 创建反向代理 Express 应用
		const app = express();

		// CORS
		app.use((_req, res, next) => {
			res.header("Access-Control-Allow-Origin", "*");
			res.header(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS",
			);
			res.header("Access-Control-Allow-Headers", "Content-Type");
			next();
		});

		// http-proxy-middleware 反向代理
		// ws: true 支持 WebSocket（HMR 热更新需要）
		// logger 静默，日志通过 DevServerProcessService 转发
		const proxy = createProxyMiddleware({
			target: `http://${host}:${devPort}`,
			changeOrigin: true,
			ws: true,
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
			},
		});
		app.use(proxy);

		// 启动代理服务器
		const server = await new Promise<Server>((resolve, reject) => {
			const s = app.listen(proxyPort, host, () => resolve(s));
			s.on("error", reject);
		});

		const url = `http://${host}:${proxyPort}`;

		const instance: PreviewServerInstance = {
			taskId,
			port: proxyPort,
			url,
			mode: "dev",
			ready: false,
			server,
			devProcess,
		};
		this.instances.set(taskId, instance);

		// 监听 dev server 事件
		devProcess.on("ready", () => {
			instance.ready = true;
			this.emitEvent(taskId, "ready", {
				mode: "dev",
				url,
				port: proxyPort,
				devPort,
				processId: devProcess.getPid(),
			});
		});

		devProcess.on("log", (event: { type: string; data?: string }) => {
			this.emitEvent(taskId, "log", { message: event.data });
		});

		devProcess.on(
			"error",
			(event: { type: string; error?: string; data?: string }) => {
				instance.ready = false;
				this.emitEvent(taskId, "error", {
					message: event.error,
					recentLogs: event.data,
				});
			},
		);

		devProcess.on("exit", () => {
			instance.ready = false;
			this.emitEvent(taskId, "error", { message: "dev server 子进程已退出" });
		});

		// 启动子进程
		await devProcess.spawn();

		return {
			port: proxyPort,
			url,
			mode: "dev",
			processId: devProcess.getPid(),
		};
	}

	// ──── 工具方法 ──────────────────────────────────────────

	/**
	 * 同步查找沙盒目录中的单个 HTML 文件
	 */
	private findSingleHtmlSync(sandboxDir: string): string | null {
		try {
			const entries = readdirSync(sandboxDir);
			const htmlFiles = entries.filter((e) => e.endsWith(".html"));
			if (htmlFiles.length === 1) return htmlFiles[0];
			if (htmlFiles.includes("index.html")) return "index.html";
			return htmlFiles[0] ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * 推送事件到前端
	 */
	private emitEvent(
		taskId: string,
		type: PreviewServerEvent["type"],
		payload?: unknown,
	): void {
		this.sender.send({ taskId, type, payload });
	}
}

// ──── 单例导出 ────────────────────────────────────────────

let instance: PreviewServerService | null = null;

/**
 * 获取预览服务器服务单例
 */
export function getPreviewServerService(
	getMainWindow: () => BrowserWindow | null,
): PreviewServerService {
	if (!instance) {
		instance = new PreviewServerService(getMainWindow);
	}
	return instance;
}

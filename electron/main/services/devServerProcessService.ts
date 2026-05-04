/**
 * Dev Server 子进程管理服务
 * 负责启动、监控、停止前端开发服务器子进程（Vite / Webpack / Next.js 等）
 * 自动检测包管理器（pnpm / yarn / npm）并注入必要的环境变量
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

/** dev server 就绪信号正则列表，覆盖主流框架 */
const READY_PATTERNS = [
	// Vite
	/Local:\s+https?:\/\//i,
	// Webpack Dev Server
	/(?:compiled|compiled successfully)/i,
	// Next.js
	/ready in/i,
	// 通用
	/Listening on/i,
	// Angular
	/\*\* Angular Live Development Server/i,
	// create-react-app
	/You can now view .+ in the browser/i,
	// Nuxt
	/local:\s+https?:\/\//i,
];

/** 包管理器类型 */
type PackageManager = "pnpm" | "yarn" | "npm";

export interface DevServerProcessServiceOptions {
	/** 工作目录（包含 package.json 的目录） */
	cwd: string;
	/** 监听端口 */
	port: number;
	/** 监听主机，默认 127.0.0.1 */
	host?: string;
	/** 自定义 dev script 名称，默认 "dev" */
	script?: string;
}

export type DevServerEventType = "ready" | "error" | "log" | "exit";

export interface DevServerEvent {
	type: DevServerEventType;
	data?: string;
	error?: string;
	exitCode?: number;
}

/**
 * Dev Server 子进程管理器
 * 生命周期：spawn → ready → running → kill
 */
export class DevServerProcessService extends EventEmitter {
	private child: ChildProcessWithoutNullStreams | null = null;
	private readonly cwd: string;
	private readonly port: number;
	private readonly host: string;
	private readonly script: string;
	private killed = false;
	private ready = false;
	private recentLogs: string[] = [];

	constructor(options: DevServerProcessServiceOptions) {
		super();
		this.cwd = options.cwd;
		this.port = options.port;
		this.host = options.host ?? "127.0.0.1";
		this.script = options.script ?? "dev";
	}

	/** 是否已经就绪 */
	isReady(): boolean {
		return this.ready;
	}

	/** 获取进程 PID */
	getPid(): number | undefined {
		return this.child?.pid;
	}

	/** 获取最近的日志行 */
	getRecentLogs(): string[] {
		return [...this.recentLogs];
	}

	/**
	 * 启动 dev server 子进程
	 * 自动检测包管理器并 spawn
	 */
	async spawn(): Promise<void> {
		if (this.child) {
			this.kill();
		}
		this.killed = false;
		this.ready = false;
		this.recentLogs = [];

		const pm = await this.detectPackageManager(this.cwd);
		const { command, args } = this.buildSpawnArgs(pm);

		const env: NodeJS.ProcessEnv = {
			...process.env,
			BROWSER: "none",
			HOST: this.host,
			PORT: String(this.port),
			NODE_ENV: "development",
		};

		this.child = spawn(command, args, {
			cwd: this.cwd,
			env,
			shell: process.platform === "win32",
		});

		this.child.stdout.on("data", (chunk: Buffer | string) => {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			this.handleOutput(text);
		});

		this.child.stderr.on("data", (chunk: Buffer | string) => {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			this.handleOutput(text);
		});

		this.child.on("error", (error) => {
			if (this.killed) return;
			this.emit("error", {
				type: "error",
				error: error.message,
			} satisfies DevServerEvent);
		});

		this.child.on("close", (code, signal) => {
			if (this.killed) return;
			// 异常退出
			if (!this.ready || code !== 0) {
				const recentTail = this.recentLogs.slice(-100).join("\n");
				this.emit("error", {
					type: "error",
					error: `dev server exited unexpectedly (code=${code}, signal=${signal})`,
					data: recentTail,
					exitCode: code ?? undefined,
				} satisfies DevServerEvent);
			}
			this.emit("exit", {
				type: "exit",
				exitCode: code ?? undefined,
			} satisfies DevServerEvent);
		});
	}

	/**
	 * 终止子进程
	 */
	kill(): void {
		this.killed = true;
		if (this.child && !this.child.killed) {
			this.child.kill("SIGTERM");
			// 给 3 秒宽限期，然后 SIGKILL
			setTimeout(() => {
				if (this.child && !this.child.killed) {
					this.child.kill("SIGKILL");
				}
			}, 3000);
		}
		this.child = null;
	}

	/** 处理子进程输出 */
	private handleOutput(text: string): void {
		const lines = text.split("\n").filter((l) => l.trim().length > 0);
		for (const line of lines) {
			// 保留最近 200 行日志
			this.recentLogs.push(line);
			if (this.recentLogs.length > 200) {
				this.recentLogs.shift();
			}

			// 推送日志事件
			this.emit("log", {
				type: "log",
				data: line,
			} satisfies DevServerEvent);

			// 检测就绪信号
			if (!this.ready) {
				for (const pattern of READY_PATTERNS) {
					if (pattern.test(line)) {
						this.ready = true;
						this.emit("ready", { type: "ready" } satisfies DevServerEvent);
						break;
					}
				}
			}
		}
	}

	/**
	 * 检测包管理器
	 * 优先级：pnpm-lock.yaml → yarn.lock → package-lock.json → npm
	 */
	private async detectPackageManager(cwd: string): Promise<PackageManager> {
		try {
			await fs.access(path.join(cwd, "pnpm-lock.yaml"));
			return "pnpm";
		} catch {
			// 继续检测
		}
		try {
			await fs.access(path.join(cwd, "yarn.lock"));
			return "yarn";
		} catch {
			// 继续检测
		}
		return "npm";
	}

	/**
	 * 构建 spawn 参数
	 */
	private buildSpawnArgs(pm: PackageManager): {
		command: string;
		args: string[];
	} {
		switch (pm) {
			case "pnpm":
				return { command: "pnpm", args: ["run", this.script] };
			case "yarn":
				return { command: "yarn", args: [this.script] };
			case "npm":
			default:
				return { command: "npm", args: ["run", this.script] };
		}
	}
}

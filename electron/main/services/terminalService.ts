/**
 * 终端服务 - 管理多个 pty 终端实例
 * 负责创建、写入、调整大小、销毁终端进程
 */
import * as pty from "node-pty";
import os from "node:os";
import { createLogger } from "../logging/logger";
import {
	MAX_TERMINALS,
	resolveShell,
	sanitizeTerminalEnv,
} from "../security/terminalGuard";

export interface TerminalCreateOptions {
	cwd?: string;
	shell?: string;
	env?: Record<string, string>;
	cols?: number;
	rows?: number;
}

export interface TerminalInfo {
	id: string;
	name: string;
	cwd: string;
	shell: string;
	pid: number;
	createdAt: number;
}

interface IDisposable {
	dispose(): void;
}

class TerminalService {
	private readonly logger = createLogger();

	private terminals = new Map<
		string,
		{
			process: pty.IPty;
			info: TerminalInfo;
			dataCallbacks: Set<(data: string) => void>;
			exitCallbacks: Set<(exitCode: number, signal?: number) => void>;
			disposables: IDisposable[];
		}
	>();

	/** 是否是 cmd.exe（用户显式指定时需要注入 UTF-8 代码页） */
	private isCmdShell(shell: string): boolean {
		return /(?:^|[\\/])cmd(?:\.exe)?$/i.test(shell.trim());
	}

	/**
	 * 创建终端实例
	 */
	createTerminal(
		id: string,
		options: TerminalCreateOptions = {},
	): TerminalInfo {
		// 如果 id 已存在，先销毁旧的
		if (this.terminals.has(id)) {
			this.destroyTerminal(id);
		}

		// 每个 pty 都是一个真实子进程 + 常驻监听器。没有上限时，
		// 一段循环调用（或远控侧的失控重试）就能把机器的进程表打满。
		if (this.terminals.size >= MAX_TERMINALS) {
			throw new Error(
				`终端数量已达上限（${MAX_TERMINALS}）。请先关闭一些终端再新建。`,
			);
		}

		const shellResolution = resolveShell(options.shell);
		if (shellResolution.rejected) {
			this.logger.warn({
				msg: "终端 shell 参数不在白名单内，已回落到平台默认 shell",
				scope: "terminal",
				requested: shellResolution.rejectedValue,
				fallback: shellResolution.shell,
			});
		}
		const shell = shellResolution.shell;
		const cwd = options.cwd || os.homedir();
		const cols = options.cols || 80;
		const rows = options.rows || 24;

		// 调用方传进来的 env 先过一遍净化：DYLD_INSERT_LIBRARIES / LD_PRELOAD /
		// NODE_OPTIONS 这类变量能让任意代码在 shell 的每个子进程里执行。
		const sanitized = sanitizeTerminalEnv(options.env);
		if (sanitized.removed.length > 0) {
			this.logger.warn({
				msg: "已剔除终端环境变量中的注入类变量",
				scope: "terminal",
				removed: sanitized.removed,
			});
		}

		// 合并环境变量
		const env = {
			...process.env,
			...sanitized.env,
			// 确保终端类型正确
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
		} as Record<string, string>;

		// Windows：PowerShell 走 -NoLogo 去掉版权横幅；
		// 用户显式指定 cmd.exe 时注入 chcp 65001 切到 UTF-8 代码页，修中文乱码。
		let shellArgs: string[];
		if (process.platform === "win32") {
			if (this.isCmdShell(shell)) {
				shellArgs = ["/K", "chcp 65001 >nul"];
			} else if (/powershell|pwsh/i.test(shell)) {
				shellArgs = ["-NoLogo"];
			} else {
				shellArgs = [];
			}
		} else {
			shellArgs = ["-l"];
		}

		const ptyProcess = pty.spawn(shell, shellArgs, {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env,
		});

		const info: TerminalInfo = {
			id,
			name: `Terminal ${this.terminals.size + 1}`,
			cwd,
			shell,
			pid: ptyProcess.pid,
			createdAt: Date.now(),
		};

		const entry = {
			process: ptyProcess,
			info,
			dataCallbacks: new Set<(data: string) => void>(),
			exitCallbacks: new Set<(exitCode: number, signal?: number) => void>(),
			disposables: [] as IDisposable[],
		};

		this.terminals.set(id, entry);

		// 监听 pty 数据输出。保存 disposable，destroyTerminal 时显式 dispose 避免残留监听器。
		const dataDisposable = ptyProcess.onData((data) => {
			for (const cb of entry.dataCallbacks) {
				cb(data);
			}
		});
		entry.disposables.push(dataDisposable);

		// 监听 pty 退出
		const exitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
			for (const cb of entry.exitCallbacks) {
				cb(exitCode, signal);
			}
			// 终端退出后清理 disposable + entry
			this.disposeAll(entry.disposables);
			this.terminals.delete(id);
		});
		entry.disposables.push(exitDisposable);

		return info;
	}

	/**
	 * 向终端写入数据
	 */
	writeTerminal(id: string, data: string): boolean {
		const entry = this.terminals.get(id);
		if (!entry) return false;
		entry.process.write(data);
		return true;
	}

	/**
	 * 调整终端大小
	 */
	resizeTerminal(id: string, cols: number, rows: number): boolean {
		const entry = this.terminals.get(id);
		if (!entry) return false;
		try {
			entry.process.resize(cols, rows);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 销毁终端
	 */
	destroyTerminal(id: string): boolean {
		const entry = this.terminals.get(id);
		if (!entry) return false;
		this.disposeAll(entry.disposables);
		try {
			entry.process.kill();
		} catch {
			// 进程可能已退出
		}
		entry.dataCallbacks.clear();
		entry.exitCallbacks.clear();
		this.terminals.delete(id);
		return true;
	}

	private disposeAll(disposables: IDisposable[]): void {
		while (disposables.length > 0) {
			const d = disposables.pop();
			if (!d) continue;
			try {
				d.dispose();
			} catch {
				// 忽略 dispose 异常，不影响其他清理
			}
		}
	}

	/**
	 * 注册终端数据回调
	 */
	onData(id: string, callback: (data: string) => void): () => void {
		const entry = this.terminals.get(id);
		if (!entry) return () => {};
		entry.dataCallbacks.add(callback);
		return () => {
			entry.dataCallbacks.delete(callback);
		};
	}

	/**
	 * 注册终端退出回调
	 */
	onExit(
		id: string,
		callback: (exitCode: number, signal?: number) => void,
	): () => void {
		const entry = this.terminals.get(id);
		if (!entry) return () => {};
		entry.exitCallbacks.add(callback);
		return () => {
			entry.exitCallbacks.delete(callback);
		};
	}

	/**
	 * 获取所有活跃终端
	 */
	getTerminals(): TerminalInfo[] {
		return Array.from(this.terminals.values()).map((e) => e.info);
	}

	/**
	 * 获取单个终端信息
	 */
	getTerminal(id: string): TerminalInfo | null {
		return this.terminals.get(id)?.info || null;
	}

	/**
	 * 销毁所有终端（应用退出时调用）
	 */
	destroyAll(): void {
		for (const id of this.terminals.keys()) {
			this.destroyTerminal(id);
		}
	}
}

// 单例导出
let instance: TerminalService | null = null;

export function getTerminalService(): TerminalService {
	if (!instance) {
		instance = new TerminalService();
	}
	return instance;
}

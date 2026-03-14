/**
 * 终端服务 - 管理多个 pty 终端实例
 * 负责创建、写入、调整大小、销毁终端进程
 */
import * as pty from "node-pty";
import os from "node:os";

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

class TerminalService {
	private terminals = new Map<
		string,
		{
			process: pty.IPty;
			info: TerminalInfo;
			dataCallbacks: Set<(data: string) => void>;
			exitCallbacks: Set<(exitCode: number, signal?: number) => void>;
		}
	>();

	/**
	 * 获取当前平台默认 shell
	 */
	private getDefaultShell(): string {
		if (process.platform === "win32") {
			return process.env.COMSPEC || "cmd.exe";
		}
		return process.env.SHELL || "/bin/zsh";
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

		const shell = options.shell || this.getDefaultShell();
		const cwd = options.cwd || os.homedir();
		const cols = options.cols || 80;
		const rows = options.rows || 24;

		// 合并环境变量
		const env = {
			...process.env,
			...options.env,
			// 确保终端类型正确
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
		} as Record<string, string>;

		const shellArgs = process.platform === "win32" ? [] : ["-l"];

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
		};

		this.terminals.set(id, entry);

		// 监听 pty 数据输出
		ptyProcess.onData((data) => {
			for (const cb of entry.dataCallbacks) {
				cb(data);
			}
		});

		// 监听 pty 退出
		ptyProcess.onExit(({ exitCode, signal }) => {
			for (const cb of entry.exitCallbacks) {
				cb(exitCode, signal);
			}
			// 终端退出后清理
			this.terminals.delete(id);
		});

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

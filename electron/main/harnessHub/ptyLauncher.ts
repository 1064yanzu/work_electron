/**
 * CLI 注入层 —— 在 App 内起一个 pty、跑目标 CLI、等它就绪后注入 HANDOFF 首条指令。
 *
 * 复刻远控 ptyBridgeService.handleStart 的成熟模式（虚拟屏 + onData 多播 + 桌面镜像），
 * 但**增加了就绪探测**：远控那边是 createTerminal 后无条件立即 write，靠 pty stdin
 * 的内核缓冲兜住；而 claude / codex 这类 TUI 启动慢、启动过程中会重绘并吃掉过早输入，
 * 立即 write 会丢指令。因此这里用 PtyScreenAggregator 轮询虚拟屏，
 * 等「输出停止 + 出现输入框特征」后再注入。
 *
 * 注入后该 pty 通过 harness-terminal-attached 挂进 TerminalPanel 成为一个 tab，
 * 用户全程可见、可直接接管交互。
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { PtyScreenAggregator } from "../remote-control/core/ptyBridge/ptyScreenAggregator";
import { getTerminalService } from "../services/terminalService";
import type { TerminalInfo } from "../services/terminalService";
import { createLogger } from "../logging/logger";
import { launchCommandFor } from "./detect";
import type { HarnessKind } from "./types";

const logger = createLogger();

/** harness pty 的 terminalId 前缀（terminal.ts 据此做 destroy/resize 保护）。 */
export const HARNESS_PTY_PREFIX = "harness-pty-";

/** 就绪探测：轮询间隔与最长等待。 */
const READY_POLL_MS = 350;
const READY_TIMEOUT_MS = 45_000;
/** 连续多少帧屏幕无变化视为「输出停止」。 */
const QUIET_FRAMES = 2;
/** 判就绪时只看屏幕尾部多少行（输入框恒在底部）。 */
const READY_TAIL_LINES = 12;

/**
 * ptyId → 资源释放函数。
 * 用户主动关 tab 时 terminalService 不会触发我们的 onExit 回调
 * （它先 dispose 掉 node-pty 的 onExit 再 kill），故需要这张表兜底。
 */
const harnessPtyCleanups = new Map<string, () => void>();

/** 各 CLI 就绪后的屏幕特征（尾部若干行匹配到即认为可以接收输入）。 */
const READY_PATTERNS: Partial<Record<HarnessKind, RegExp[]>> = {
	// claude code TUI 就绪后底部是输入框（"│ > " 或 "? for shortcuts"）
	"claude-code": [/│\s*>/, /for shortcuts/i, /^\s*>\s*$/m],
	// codex TUI 底部同样有输入提示
	codex: [/▌|│\s*>/, /send a message|for shortcuts/i, /^\s*>\s*$/m],
	"gemini-cli": [/│\s*>/, /Type your message|for shortcuts/i, /^\s*>\s*$/m],
	opencode: [/│\s*>/, /^\s*>\s*$/m],
};

/** 通用兜底：常见 shell 提示符（CLI 起不来时至少能落到 shell）。 */
const SHELL_PROMPT = /[$%#>]\s*$/;

export interface HarnessLaunchResult {
	ptyId: string;
	terminal: {
		id: string;
		name: string;
		cwd: string;
		shell: string;
		pid: number;
		createdAt: number;
	};
	/** 是否成功探测到就绪（false = 超时后仍然注入了，但可能需要用户手动回车） */
	readyDetected: boolean;
}

interface LaunchOptions {
	harness: HarnessKind;
	/** 工作目录（HANDOFF.md 也写在这里） */
	cwd: string;
	/** HANDOFF.md 的绝对路径，用于组织首条指令 */
	handoffPath: string | null;
	/** 首条注入指令；不传则用默认「读 HANDOFF.md 继续下一步」 */
	instruction?: string;
	cols?: number;
	rows?: number;
	getMainWindow: () => BrowserWindow | null;
}

/** 组织默认首条指令。 */
function defaultInstruction(handoffPath: string | null): string {
	if (handoffPath) {
		const rel = path.basename(handoffPath);
		return `请先读取当前目录下的 ${rel}（会话交接包），理解其中的任务目标、已完成内容、关键决策与踩坑，然后继续执行其中「下一步」列出的任务。`;
	}
	return "请继续之前未完成的任务。";
}

/**
 * 判断虚拟屏是否显示 CLI 已就绪。
 */
function looksReady(screen: string, harness: HarnessKind): boolean {
	if (!screen.trim()) return false;
	const patterns = READY_PATTERNS[harness];
	if (patterns?.some((re) => re.test(screen))) return true;
	// 兜底：最后一行像 shell 提示符
	const lines = screen.split("\n").filter((l) => l.trim());
	const last = lines[lines.length - 1] ?? "";
	return SHELL_PROMPT.test(last);
}

/**
 * 启动一个 harness CLI 并在就绪后注入首条指令。
 */
export async function launchHarnessWithHandoff(
	options: LaunchOptions,
): Promise<HarnessLaunchResult> {
	const {
		harness,
		cwd,
		handoffPath,
		instruction,
		cols = 120,
		rows = 32,
		getMainWindow,
	} = options;

	const command = launchCommandFor(harness);
	if (!command) {
		throw new Error(`harness ${harness} 不支持在 App 内启动`);
	}

	const terminalService = getTerminalService();
	const ptyId = `${HARNESS_PTY_PREFIX}${randomUUID()}`;
	const aggregator = new PtyScreenAggregator({ cols, rows, scrollback: 200 });

	let terminalInfo: TerminalInfo;
	try {
		terminalInfo = terminalService.createTerminal(ptyId, {
			cwd,
			cols,
			rows,
			env: {
				COLUMNS: String(cols),
				LINES: String(rows),
				TERM: "xterm-256color",
			},
		});
	} catch (error) {
		// 创建失败（cwd 不存在、shell 缺失等）：别把虚拟屏漏在这儿
		aggregator.dispose();
		throw error;
	}

	// 虚拟屏喂数据（就绪探测用）
	let unsubExitRef: (() => void) | null = null;
	const unsubAggregator = terminalService.onData(ptyId, (chunk) => {
		aggregator.feed(chunk);
	});
	// 桌面镜像：把输出转发给渲染端的 TerminalPanel
	const unsubMirror = terminalService.onData(ptyId, (chunk) => {
		try {
			getMainWindow()?.webContents.send("terminal-data", {
				id: ptyId,
				data: chunk,
			});
		} catch {
			// 窗口已销毁
		}
	});
	// 统一的资源释放：CLI 自己退出走 onExit，用户主动关 tab 走 closeHarnessPty。
	// 必须幂等——两条路径都可能触发。
	let released = false;
	const release = () => {
		if (released) return;
		released = true;
		unsubAggregator();
		unsubMirror();
		unsubExitRef?.();
		aggregator.dispose();
		harnessPtyCleanups.delete(ptyId);
	};

	const unsubExit = terminalService.onExit(ptyId, (exitCode, signal) => {
		try {
			getMainWindow()?.webContents.send("terminal-exit", {
				id: ptyId,
				exitCode,
				signal,
			});
		} catch {
			// 窗口已销毁
		}
		release();
	});
	unsubExitRef = unsubExit;
	harnessPtyCleanups.set(ptyId, release);

	// 先把 pty 挂进 TerminalPanel，用户能实时看到 CLI 启动过程
	try {
		getMainWindow()?.webContents.send("harness-terminal-attached", {
			pty_id: ptyId,
			harness,
			terminal: {
				id: terminalInfo.id,
				name: `⇄ ${harness}`,
				cwd: terminalInfo.cwd,
				shell: terminalInfo.shell,
				pid: terminalInfo.pid,
				createdAt: terminalInfo.createdAt,
			},
			auto_show: true,
		});
	} catch {
		// 窗口已销毁
	}

	// 启动 CLI
	terminalService.writeTerminal(ptyId, `${command}\n`);

	// 就绪探测：等输出停止 + 出现输入框特征
	const readyDetected = await waitForReady(aggregator, harness);

	const text = instruction?.trim() || defaultInstruction(handoffPath);
	// TUI 对多行粘贴的处理各不相同，统一压成单行再回车
	const oneLine = text.replace(/\s*\n\s*/g, " ");
	terminalService.writeTerminal(ptyId, `${oneLine}\n`);

	logger.info({
		msg: "harness CLI 已启动并注入交接指令",
		harness,
		ptyId,
		cwd,
		readyDetected,
	});

	return {
		ptyId,
		terminal: {
			id: terminalInfo.id,
			name: `⇄ ${harness}`,
			cwd: terminalInfo.cwd,
			shell: terminalInfo.shell,
			pid: terminalInfo.pid,
			createdAt: terminalInfo.createdAt,
		},
		readyDetected,
	};
}

/**
 * 轮询虚拟屏直到 CLI 就绪或超时。
 *
 * 这里**不用** aggregator.diffWithPrev() 判静默，原因是它与 snapshotPlain 的
 * 取值口径对不上：snapshotPlain({lineCount:N}) 只把 N 行写进内部基线，而
 * diffWithPrev 固定遍历 terminal.rows 行、且用 viewportTop 而非 bottom 起算，
 * 屏幕高于 N 行时 diff 恒为非空，静默永远判不出来。
 * 改为自己保存上一帧全屏快照做比对，口径自洽。
 */
async function waitForReady(
	aggregator: PtyScreenAggregator,
	harness: HarnessKind,
): Promise<boolean> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	let quiet = 0;
	let prevScreen: string | null = null;

	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
		// 取整屏（不传 lineCount）：TUI 的输入框在屏幕底部，
		// 截取顶部若干行会永远看不到就绪特征。
		const screen = aggregator.snapshotPlain({ from: "bottom" });
		quiet = prevScreen !== null && screen === prevScreen ? quiet + 1 : 0;
		prevScreen = screen;

		// 只看尾部若干行判就绪：输入框恒在底部，越往上越可能是启动日志误匹配
		const tail = screen.split("\n").slice(-READY_TAIL_LINES).join("\n");
		if (quiet >= QUIET_FRAMES && looksReady(tail, harness)) {
			return true;
		}
	}
	return false;
}

/**
 * 关闭一个 harness pty（用户主动关闭 tab 时调用）。
 *
 * 注意：terminalService.destroyTerminal 会先释放 node-pty 的 onExit disposable
 * 再 kill，所以我们注册的 onExit 回调**不会**被调用。必须在这里显式释放
 * 虚拟屏与 onData 订阅，否则每关一个 tab 就泄漏一个 headless Terminal。
 */
export function closeHarnessPty(ptyId: string): boolean {
	if (!ptyId.startsWith(HARNESS_PTY_PREFIX)) return false;
	const ok = getTerminalService().destroyTerminal(ptyId);
	harnessPtyCleanups.get(ptyId)?.();
	return ok;
}

/** 释放全部 harness pty 资源（应用退出时调用）。 */
export function disposeAllHarnessPtys(): void {
	for (const ptyId of [...harnessPtyCleanups.keys()]) {
		getTerminalService().destroyTerminal(ptyId);
		harnessPtyCleanups.get(ptyId)?.();
	}
	harnessPtyCleanups.clear();
}

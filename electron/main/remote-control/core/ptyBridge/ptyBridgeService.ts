/**
 * PtyBridgeService —— 把 IM 入站消息桥接到桌面端 pty 会话，让手机端能远程
 * 驱动 codex / claude code / opencode 等 TUI CLI。
 *
 * 工作流：
 *   /cli start <preset|cmd> → terminalService.createTerminal(...)
 *                              + ChannelStreamingSession.start()
 *   pty stdout → PtyScreenAggregator.feed → 节流取快照 → streaming.update
 *   普通文本     → terminalService.writeTerminal(id, text + "\n")
 *   /cli stop / pty exit → streaming.close(finalSnapshot)
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { BrowserWindow } from "electron";
import type { Logger } from "../../../logging/types";
import {
	getTerminalService,
	type TerminalInfo,
} from "../../../services/terminalService";
import type {
	ChannelStreamingFactory,
	ChannelStreamingSession,
	TerminalShortcutAction,
} from "../../sdk/channel-streaming";
import type {
	RemoteChannelId,
	RemoteControlConfig,
	RemoteInboundMessage,
	RemoteOutboundMessage,
	RemoteTerminalConfig,
	RemoteTerminalPreset,
	RemoteTerminalSessionStatus,
} from "../types";
import {
	getCliHelpText,
	KEY_SEQUENCE,
	parseCliCommand,
	tryParseTerminalShortcut,
} from "./ptyCommandParser";
import { PtyScreenAggregator } from "./ptyScreenAggregator";

export type PtyBridgeAppendEventLog = (
	level: "info" | "warn" | "error",
	source: string,
	message: string,
) => void;

export type PtyBridgeDeps = {
	logger: Logger;
	getConfig: () => RemoteControlConfig;
	resolveChannelStreaming: (
		channelId: RemoteChannelId,
	) => ChannelStreamingFactory | null;
	sendMessage: (message: RemoteOutboundMessage) => Promise<void>;
	appendEventLog?: PtyBridgeAppendEventLog;
	/**
	 * 获取主窗口；用于把远控 pty 输出 / 状态推送给桌面端，让 TerminalPanel 自动
	 * 显示并实时同步。返回 null 时（窗口未就绪 / 已销毁）静默跳过推送。
	 */
	getMainWindow?: () => BrowserWindow | null;
};

type PtySession = {
	sessionId: string;
	peerKey: string;
	channelId: RemoteChannelId;
	peerId: string;
	peerName?: string;
	targetId: string;
	command: string;
	cwd: string;
	presetId?: string;
	terminalId: string;
	pid?: number;
	aggregator: PtyScreenAggregator;
	streaming: ChannelStreamingSession;
	startedAt: number;
	lastActivityAt: number;
	snapshotTimer: ReturnType<typeof setInterval> | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
	pendingSnapshot: boolean;
	closed: boolean;
	unsubData?: () => void;
	unsubExit?: () => void;
	/** 把 pty 输出转发到桌面端 TerminalPanel 的 onData 注销函数 */
	unsubForwardToDesktop?: () => void;
	/** 是否已向桌面端发送 attached 事件（用于决定 detach 时是否需要发 detached） */
	desktopAttached: boolean;
};

function peerKeyOf(channelId: RemoteChannelId, peerId: string): string {
	return `${channelId}:${peerId}`;
}

/**
 * 默认终端快捷按钮组。
 *
 * 设计目标：覆盖 Claude Code / codex / opencode 这类 TUI 在 IM 卡片里最常
 * 用到的交互——菜单浏览、确认/取消、补全、中断、数字菜单、是否对话。
 * 12 个按钮按 4 列 3 行排版，飞书 CardKit 渲染最稳，其它渠道目前会忽略
 * 该字段，靠 /k 短指令降级。
 */
const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutAction[] = [
	{ kind: "key", label: "Enter", key: "enter", style: "primary" },
	{ kind: "key", label: "Esc", key: "esc", style: "secondary" },
	{ kind: "key", label: "↑", key: "up", style: "secondary" },
	{ kind: "key", label: "↓", key: "down", style: "secondary" },
	{ kind: "key", label: "Tab", key: "tab", style: "secondary" },
	{ kind: "key", label: "Ctrl+C", key: "ctrl-c", style: "danger" },
	{ kind: "text", label: "y", text: "y", style: "secondary" },
	{ kind: "text", label: "n", text: "n", style: "secondary" },
	{ kind: "text", label: "1", text: "1", style: "secondary" },
	{ kind: "text", label: "2", text: "2", style: "secondary" },
	{ kind: "text", label: "3", text: "3", style: "secondary" },
	{ kind: "stop", label: "停止会话", style: "danger" },
];

function expandHomeDir(input: string): string {
	if (!input) return input;
	if (input === "~") return os.homedir();
	if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
	return input;
}

function resolveCwd(
	rawCwd: string | undefined,
	config: RemoteTerminalConfig,
): string {
	if (rawCwd && rawCwd.trim()) {
		const expanded = expandHomeDir(rawCwd.trim());
		return path.isAbsolute(expanded)
			? expanded
			: path.resolve(os.homedir(), expanded);
	}
	const fallback = config.defaultCwds[0];
	if (fallback) {
		const expanded = expandHomeDir(fallback);
		return path.isAbsolute(expanded)
			? expanded
			: path.resolve(os.homedir(), expanded);
	}
	return os.homedir();
}

function findPreset(
	target: string,
	config: RemoteTerminalConfig,
): RemoteTerminalPreset | null {
	const normalized = target.trim().toLowerCase();
	for (const preset of config.presets) {
		if (preset.id.toLowerCase() === normalized) return preset;
		if (preset.name.toLowerCase() === normalized) return preset;
	}
	return null;
}

/**
 * 用 IM 等宽块字符把"终端快照"包起来。
 * 不同渠道支持的 markdown 不一致，统一用 ``` 围栏，所有现役 IM 都识别。
 */
function wrapSnapshot(snapshot: string): string {
	const body = snapshot.replace(/```/g, "``​`");
	return ["```", body || "(空)", "```"].join("\n");
}

export class PtyBridgeService {
	private readonly sessionsByPeer = new Map<string, PtySession>();
	private readonly sessionsById = new Map<string, PtySession>();
	private readonly terminalService = getTerminalService();

	constructor(private readonly deps: PtyBridgeDeps) {}

	private get config(): RemoteTerminalConfig {
		return this.deps.getConfig().terminal;
	}

	private log(level: "info" | "warn" | "error", message: string): void {
		this.deps.appendEventLog?.(level, "pty-bridge", message);
	}

	listSessions(): RemoteTerminalSessionStatus[] {
		return [...this.sessionsById.values()].map((s) => ({
			session_id: s.sessionId,
			channel_id: s.channelId,
			peer_id: s.peerId,
			peer_name: s.peerName,
			target_id: s.targetId,
			command: s.command,
			cwd: s.cwd,
			preset_id: s.presetId,
			pid: s.pid,
			started_at: s.startedAt,
			last_activity_at: s.lastActivityAt,
		}));
	}

	async stopAll(reason = "服务停止"): Promise<void> {
		for (const session of [...this.sessionsById.values()]) {
			await this.closeSession(session, { reason });
		}
	}

	async terminateSessionById(sessionId: string): Promise<boolean> {
		const session = this.sessionsById.get(sessionId);
		if (!session) return false;
		await this.closeSession(session, { reason: "桌面端强制终止" });
		return true;
	}

	/**
	 * IM 入站消息 dispatch 入口。返回 true 表示已消费（不再走 Agent 路径）。
	 */
	async tryHandle(message: RemoteInboundMessage): Promise<boolean> {
		const text = String(message.text || "").trim();
		const isCliCommand = /^\/cli(?:\s|$)/i.test(text);
		const shortcut = tryParseTerminalShortcut(text);
		const peerKey = peerKeyOf(message.channel_id, message.peer_id);
		const session = this.sessionsByPeer.get(peerKey);

		if (!isCliCommand && !shortcut && !session) return false;

		const terminalCfg = this.config;
		if (!terminalCfg.enabled) {
			if (isCliCommand || shortcut) {
				await this.replySystem(
					message,
					"远程终端未启用，请在桌面端设置中开启。",
				);
				return true;
			}
			return false;
		}

		if (isCliCommand) {
			await this.handleCliCommand(message, text);
			return true;
		}

		// 短指令快捷形式（/k <key>、/⏎ /⎋ 等）—— 没有会话就提示用户先 /cli start
		if (shortcut) {
			if (!session) {
				await this.replySystem(
					message,
					"当前没有活跃的终端会话，无法发送按键。可用 /cli start 启动。",
				);
				return true;
			}
			if (shortcut.kind === "key") {
				await this.handleKey(message, shortcut.key);
			} else if (shortcut.kind === "text") {
				await this.injectStdin(session, message, shortcut.text);
			} else if (shortcut.kind === "unknown") {
				await this.replySystem(message, shortcut.reason);
			}
			return true;
		}

		// 此时 session 已存在 → 普通文本作为 stdin
		await this.injectStdin(session!, message, text);
		return true;
	}

	private async handleCliCommand(
		message: RemoteInboundMessage,
		text: string,
	): Promise<void> {
		const parsed = parseCliCommand(text);
		switch (parsed.kind) {
			case "help":
				await this.replySystem(message, getCliHelpText());
				return;
			case "list":
				await this.replySystem(message, this.formatSessionList(message));
				return;
			case "status":
				await this.replySystem(message, this.formatSessionStatus(message));
				return;
			case "stop":
				await this.handleStop(message);
				return;
			case "start":
				await this.handleStart(message, parsed.target, parsed.cwd);
				return;
			case "key":
				await this.handleKey(message, parsed.key);
				return;
			case "unknown":
				await this.replySystem(
					message,
					`${parsed.reason}\n\n${getCliHelpText()}`,
				);
				return;
		}
	}

	private formatSessionList(message: RemoteInboundMessage): string {
		const all = this.listSessions();
		if (all.length === 0) return "当前没有活跃的远程终端会话。";
		return [
			"当前活跃会话：",
			...all.map(
				(s) =>
					`- ${s.peer_id === message.peer_id ? "★ " : "  "}[${s.channel_id}] ${s.command} (cwd=${s.cwd}, pid=${s.pid ?? "-"})`,
			),
		].join("\n");
	}

	private formatSessionStatus(message: RemoteInboundMessage): string {
		const session = this.sessionsByPeer.get(
			peerKeyOf(message.channel_id, message.peer_id),
		);
		if (!session) return "你当前没有活跃的远程终端会话。可用 /cli start 启动。";
		const ageSec = Math.round((Date.now() - session.startedAt) / 1000);
		return [
			"远程终端会话：",
			`  命令：${session.command}`,
			`  cwd：${session.cwd}`,
			`  pid：${session.pid ?? "-"}`,
			`  屏幕：${session.aggregator.cols}x${session.aggregator.rows}`,
			`  运行时长：${ageSec}s`,
		].join("\n");
	}

	private async handleStart(
		message: RemoteInboundMessage,
		target: string,
		cwdInput: string | undefined,
	): Promise<void> {
		const peerKey = peerKeyOf(message.channel_id, message.peer_id);
		if (this.sessionsByPeer.has(peerKey)) {
			await this.replySystem(
				message,
				"当前已有活跃会话，请先 /cli stop 后再启动。",
			);
			return;
		}

		const terminalCfg = this.config;
		const preset = findPreset(target, terminalCfg);
		let command = preset?.command ?? target.trim();
		if (!preset && !terminalCfg.freeCommandMode) {
			await this.replySystem(
				message,
				[
					`未找到名为 \`${target}\` 的预设。`,
					"启用任意命令需要在设置中开启「自由命令模式」。",
					"已有预设：",
					...terminalCfg.presets.map(
						(p) => `  - ${p.id} (${p.name}) → ${p.command}`,
					),
				].join("\n"),
			);
			return;
		}
		if (!command) {
			await this.replySystem(message, "命令为空，无法启动。");
			return;
		}

		const cwd = resolveCwd(cwdInput ?? preset?.cwd, terminalCfg);

		const streamingFactory = this.deps.resolveChannelStreaming(
			message.channel_id,
		);
		if (!streamingFactory || !streamingFactory.isEnabled()) {
			await this.replySystem(
				message,
				`渠道 ${message.channel_id} 未启用流式更新，无法显示终端输出。`,
			);
			return;
		}

		const streaming = streamingFactory.openSession({
			targetId: message.target_id,
			replyToMessageId: message.message_id,
		});
		try {
			await streaming.start({
				title: `终端：${preset?.name ?? command}`,
				template: "blue",
				note: `cwd ${cwd}`,
				replyToMessageId: message.message_id,
				terminalShortcuts: DEFAULT_TERMINAL_SHORTCUTS,
			});
		} catch (error) {
			const err = error instanceof Error ? error.message : String(error);
			await this.replySystem(message, `初始化终端卡片失败：${err}`);
			return;
		}

		const aggregator = new PtyScreenAggregator({
			cols: terminalCfg.cols,
			rows: terminalCfg.rows,
		});

		const sessionId = randomUUID();
		const terminalId = `remote-pty-${sessionId}`;
		let terminalInfo: TerminalInfo;
		try {
			terminalInfo = this.terminalService.createTerminal(terminalId, {
				cwd,
				cols: terminalCfg.cols,
				rows: terminalCfg.rows,
				shell: this.pickShellForCommand(command),
				env: {
					COLUMNS: String(terminalCfg.cols),
					LINES: String(terminalCfg.rows),
					TERM: "xterm-256color",
				},
			});
		} catch (error) {
			aggregator.dispose();
			await streaming.close(
				`启动失败：${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}

		const session: PtySession = {
			sessionId,
			peerKey,
			channelId: message.channel_id,
			peerId: message.peer_id,
			peerName: message.peer_name,
			targetId: message.target_id,
			command,
			cwd,
			presetId: preset?.id,
			terminalId,
			pid: terminalInfo.pid,
			aggregator,
			streaming,
			startedAt: Date.now(),
			lastActivityAt: Date.now(),
			snapshotTimer: null,
			idleTimer: null,
			pendingSnapshot: false,
			closed: false,
			desktopAttached: false,
		};

		session.unsubData = this.terminalService.onData(terminalId, (chunk) => {
			session.aggregator.feed(chunk);
			session.pendingSnapshot = true;
			session.lastActivityAt = Date.now();
		});
		session.unsubExit = this.terminalService.onExit(
			terminalId,
			(exitCode, signal) => {
				void this.handleExit(session, exitCode, signal);
			},
		);

		// 把 pty 输出同步推送到桌面端 TerminalPanel（独立的 onData，避免 aggregator
		// 节流影响桌面 xterm 的实时性）。注意：destroyTerminal 会一次性 dispose
		// 所有 callbacks，所以这条订阅在 pty 退出时也会自动失效；显式 unsub 仅在
		// closeSession 主动结束时调用。
		this.attachDesktopForwarding(session, terminalInfo);

		session.snapshotTimer = setInterval(
			() => {
				if (!session.pendingSnapshot) return;
				session.pendingSnapshot = false;
				void this.flushSnapshot(session);
			},
			Math.max(100, terminalCfg.snapshotIntervalMs),
		);

		this.armIdleTimer(session);

		this.sessionsByPeer.set(peerKey, session);
		this.sessionsById.set(sessionId, session);

		// 把启动命令写到 pty。预设带 args 时直接连同 shell 跑。
		this.terminalService.writeTerminal(terminalId, `${command}\n`);

		this.log(
			"info",
			`pty 启动：${message.channel_id}/${message.peer_id} → ${command} (cwd=${cwd}, pid=${terminalInfo.pid})`,
		);
	}

	private pickShellForCommand(_command: string): string | undefined {
		// 直接复用 terminalService 的默认 shell；将来如果要直接 spawn 命令而不是
		// 在 shell 里 exec，可以改成 sh -c "<command>"。
		return undefined;
	}

	private armIdleTimer(session: PtySession): void {
		if (session.idleTimer) clearTimeout(session.idleTimer);
		const timeout = this.config.idleTimeoutMs;
		if (timeout <= 0) return;
		session.idleTimer = setTimeout(() => {
			void this.closeSession(session, { reason: "会话空闲超时" });
		}, timeout);
	}

	private async injectStdin(
		session: PtySession,
		_message: RemoteInboundMessage,
		text: string,
	): Promise<void> {
		this.terminalService.writeTerminal(session.terminalId, `${text}\n`);
		session.lastActivityAt = Date.now();
		this.armIdleTimer(session);
	}

	private async handleStop(message: RemoteInboundMessage): Promise<void> {
		const peerKey = peerKeyOf(message.channel_id, message.peer_id);
		const session = this.sessionsByPeer.get(peerKey);
		if (!session) {
			await this.replySystem(message, "当前没有活跃的终端会话。");
			return;
		}
		await this.closeSession(session, { reason: "用户主动停止" });
	}

	private async handleKey(
		message: RemoteInboundMessage,
		key: keyof typeof KEY_SEQUENCE,
	): Promise<void> {
		const peerKey = peerKeyOf(message.channel_id, message.peer_id);
		const session = this.sessionsByPeer.get(peerKey);
		if (!session) {
			await this.replySystem(message, "当前没有活跃的终端会话，无法发送按键。");
			return;
		}
		this.terminalService.writeTerminal(session.terminalId, KEY_SEQUENCE[key]);
		session.lastActivityAt = Date.now();
		this.armIdleTimer(session);
	}

	private async flushSnapshot(session: PtySession): Promise<void> {
		if (session.closed) return;
		try {
			const snapshot = session.aggregator.snapshot();
			await session.streaming.update(wrapSnapshot(snapshot));
		} catch (error) {
			this.log(
				"warn",
				`快照推送失败 (${session.peerKey})：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async handleExit(
		session: PtySession,
		exitCode: number,
		signal?: number,
	): Promise<void> {
		await this.closeSession(session, {
			reason: signal
				? `进程被信号 ${signal} 中止`
				: `进程退出，code=${exitCode}`,
			finalize: true,
		});
	}

	private async closeSession(
		session: PtySession,
		options: { reason: string; finalize?: boolean },
	): Promise<void> {
		if (session.closed) return;
		session.closed = true;

		if (session.snapshotTimer) {
			clearInterval(session.snapshotTimer);
			session.snapshotTimer = null;
		}
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
			session.idleTimer = null;
		}
		session.unsubData?.();
		session.unsubExit?.();
		session.unsubForwardToDesktop?.();

		if (!options.finalize) {
			this.terminalService.destroyTerminal(session.terminalId);
		}

		// 通知桌面端 TerminalPanel 移除该会话 tab；只在曾经 attach 过时才发，
		// 避免前端处理一条它从未感知过的会话。
		if (session.desktopAttached) {
			this.sendToDesktop("remote-terminal-detached", {
				id: session.terminalId,
				reason: options.reason,
			});
			// 同时复用既有的 terminal-exit 协议让 TerminalInstance 显示「进程已退出」
			this.sendToDesktop("terminal-exit", {
				id: session.terminalId,
				exitCode: 0,
			});
		}

		const finalSnapshot = session.aggregator.snapshot();
		try {
			await session.streaming.close(wrapSnapshot(finalSnapshot), {
				note: options.reason,
			});
		} catch (error) {
			this.log(
				"warn",
				`关闭流式卡片失败 (${session.peerKey})：${error instanceof Error ? error.message : String(error)}`,
			);
		}
		session.aggregator.dispose();

		this.sessionsByPeer.delete(session.peerKey);
		this.sessionsById.delete(session.sessionId);

		this.log(
			"info",
			`pty 结束：${session.channelId}/${session.peerId} (${options.reason})`,
		);
	}

	/**
	 * 把远控 pty 的输出转发到桌面端 TerminalPanel，并发出 attached 事件让前端
	 * 把会话挂进 TerminalInstance 列表。
	 *
	 * 桌面端只是「同屏观察 + 可输入接管」，不允许桌面 xterm 改尺寸或杀进程，
	 * 这两条保护在 terminal IPC handler 那一侧实现。
	 */
	private attachDesktopForwarding(
		session: PtySession,
		terminalInfo: TerminalInfo,
	): void {
		if (!this.deps.getMainWindow) return;

		// 即便用户关掉了 autoShow，输出转发也必须建立——否则用户开了 autoShow
		// 之后手动从设置里把会话挂回桌面时拿不到历史 + 实时输出。
		const unsub = this.terminalService.onData(session.terminalId, (chunk) => {
			this.sendToDesktop("terminal-data", {
				id: session.terminalId,
				data: chunk,
			});
		});
		session.unsubForwardToDesktop = unsub;

		const cfg = this.config;
		this.sendToDesktop("remote-terminal-attached", {
			session_id: session.sessionId,
			terminal: {
				id: terminalInfo.id,
				name: `🛰 ${session.peerName || session.peerId} · ${session.presetId ?? session.command}`,
				cwd: terminalInfo.cwd,
				shell: terminalInfo.shell,
				pid: terminalInfo.pid,
				createdAt: terminalInfo.createdAt,
			},
			meta: {
				channel_id: session.channelId,
				peer_id: session.peerId,
				peer_name: session.peerName,
				command: session.command,
				preset_id: session.presetId,
			},
			auto_show: cfg.autoShowOnDesktop,
		});
		session.desktopAttached = true;
	}

	private sendToDesktop(channel: string, payload: unknown): void {
		const win = this.deps.getMainWindow?.();
		if (!win || win.isDestroyed()) return;
		try {
			win.webContents.send(channel, payload);
		} catch (error) {
			this.log(
				"warn",
				`桌面端事件推送失败 (${channel})：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async replySystem(
		message: RemoteInboundMessage,
		text: string,
	): Promise<void> {
		try {
			await this.deps.sendMessage({
				channel_id: message.channel_id,
				target_id: message.target_id,
				reply_to_message_id: message.message_id,
				text,
			});
		} catch (error) {
			this.deps.logger.warn({
				msg: "pty bridge reply failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

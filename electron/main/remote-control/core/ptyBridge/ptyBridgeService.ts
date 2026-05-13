/**
 * PtyBridgeService —— 把 IM 入站消息桥接到桌面端 pty 会话，让手机端能远程
 * 驱动 codex / claude code / opencode 等 TUI CLI。
 *
 * 体验升级（2026-05-13）已并入主流程：
 *   - 真彩色：colorMode=auto/ansi 时通过 snapshotAnsi 输出，渠道 hint format=ansi
 *   - 自适应宽：perChannelCols 决定默认列宽；/cli resize 实时改尺寸
 *   - scrollback + 滚屏：aggregator 内置 scrollback；/cli up/down/top/bottom/page-*
 *   - 状态条：snapshot 顶端拼接 statusLine
 *   - diff 高亮：highlightDiff 时变化行加 ▸
 *   - 上下文按钮：detectScreenContext + buildContextualShortcuts
 *   - 文件上下行：inbound_files → cwd/.uploads；/cli get → channel.fileTransfer
 *   - 命令历史 + /cli history / /cli !N
 *   - 自适应节流：snapshot 推送失败次数过多时延后下一帧
 *   - 长输出折叠：foldLongOutput + /cli more
 *   - 危险命令二次确认：detectDangerousInput + pendingConfirm
 *   - 离线缓冲：streaming.start 出错时把 chunk 缓在 offlineBuffer，下次 attach 时回放
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
	ChannelFileTransfer,
	ChannelStreamingFactory,
	ChannelStreamingSession,
	TerminalShortcutAction,
} from "../../sdk";
import type {
	RemoteChannelId,
	RemoteControlConfig,
	RemoteInboundMessage,
	RemoteOutboundMessage,
	RemoteTerminalColorMode,
	RemoteTerminalConfig,
	RemoteTerminalPreset,
	RemoteTerminalSessionStatus,
} from "../types";
import { CommandHistory, formatHistory } from "./commandHistory";
import { detectDangerousInput } from "./dangerousPatterns";
import {
	loadOutboundFile,
	notSupportedFileTransfer,
	saveInboundFiles,
	sendFileViaChannel,
} from "./fileTransfer";
import { foldLongOutput } from "./foldOutput";
import {
	type CliColorMode,
	type CliSpeedMode,
	getCliHelpText,
	KEY_SEQUENCE,
	parseCliCommand,
	tryParseTerminalShortcut,
} from "./ptyCommandParser";
import { PtyScreenAggregator } from "./ptyScreenAggregator";
import {
	buildContextualShortcuts,
	DEFAULT_TERMINAL_SHORTCUTS,
} from "./shortcutComposer";

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
	/**
	 * 取得渠道的文件上下行能力（仅在 ChannelFileTransfer 自我声明 isEnabled 时返回）。
	 * 渠道未实现 → 返回 null；调用方负责降级提示。
	 */
	resolveChannelFileTransfer?: (
		channelId: RemoteChannelId,
	) => ChannelFileTransfer | null;
	sendMessage: (message: RemoteOutboundMessage) => Promise<void>;
	appendEventLog?: PtyBridgeAppendEventLog;
	/**
	 * 获取主窗口；用于把远控 pty 输出 / 状态推送给桌面端，让 TerminalPanel 自动
	 * 显示并实时同步。返回 null 时（窗口未就绪 / 已销毁）静默跳过推送。
	 */
	getMainWindow?: () => BrowserWindow | null;
};

type PendingConfirm = {
	kind: "stdin" | "command";
	text: string;
	preview: string;
	pattern: string;
	queuedAt: number;
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
	unsubForwardToDesktop?: () => void;
	desktopAttached: boolean;

	// ─── 体验升级状态 ────────────────────────────
	history: CommandHistory;
	/** 当前会话本地覆盖的颜色模式（/cli color），不写回全局配置 */
	colorMode: RemoteTerminalColorMode;
	/** 当前会话本地覆盖的快照节流 */
	speedMode: CliSpeedMode;
	/** 折叠的剩余页（/cli more 翻看） */
	morePages: string[];
	/** 待确认的危险命令 */
	pendingConfirm: PendingConfirm | null;
	/** 推送失败次数累计；过 3 次触发自适应节流加倍 */
	consecutiveFailures: number;
	/** 自适应节流系数（>1 即放慢） */
	adaptiveBackoff: number;
	/** streaming 是否曾经初始化成功；失败时切到 offline mode */
	streamingHealthy: boolean;
	/** 上次 shortcuts 签名，避免重复 patch */
	lastShortcutsSignature: string;
};

function peerKeyOf(channelId: RemoteChannelId, peerId: string): string {
	return `${channelId}:${peerId}`;
}

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

const SPEED_INTERVAL_MS: Record<CliSpeedMode, number> = {
	fast: 150,
	normal: 350,
	slow: 800,
};

/**
 * 把 /cli color 接收到的 on/off/auto 映射到全局 RemoteTerminalColorMode。
 *   - on  → ansi（强制 ANSI 输出）
 *   - off → plain（纯文本）
 *   - auto → auto（让渠道自己决定）
 */
function mapCliColorMode(mode: CliColorMode): RemoteTerminalColorMode {
	if (mode === "on") return "ansi";
	if (mode === "off") return "plain";
	return "auto";
}

/**
 * 渠道对应的默认列宽。terminalCfg.perChannelCols 优先；fallback 走顶层 cols。
 */
function pickInitialCols(
	channelId: RemoteChannelId,
	terminalCfg: RemoteTerminalConfig,
): number {
	const override = terminalCfg.perChannelCols?.[channelId];
	if (typeof override === "number" && override >= 30 && override <= 240) {
		return override;
	}
	return terminalCfg.cols;
}

function shortcutsSignature(actions: TerminalShortcutAction[]): string {
	return actions
		.map((a) => {
			switch (a.kind) {
				case "key":
					return `k:${a.key}:${a.label}`;
				case "text":
					return `t:${a.text}:${a.label}`;
				case "stop":
					return `s:${a.label}`;
				case "scroll":
					return `r:${a.dir}:${a.amount ?? "-"}`;
				case "more":
					return `m:${a.label}`;
				case "confirm":
					return `c:${a.label}`;
				case "cancel":
					return `x:${a.label}`;
			}
		})
		.join("|");
}

/**
 * 用 IM 等宽块字符把"终端快照"包起来。
 * 不同渠道支持的 markdown 不一致，统一用 ``` 围栏，所有现役 IM 都识别。
 * `format` 为 "ansi" 时改用 `ansi` 语言标识，仅 Discord 原生识别；其他渠道
 * 看到陌生语言标识也会按 codeblock 显示，对体验无影响。
 */
function wrapSnapshot(snapshot: string, format: "plain" | "ansi"): string {
	const body = snapshot.replace(/```/g, "``​`");
	const fence = format === "ansi" ? "```ansi" : "```";
	return [fence, body || "(空)", "```"].join("\n");
}

function highlightDiffLines(snapshot: string, diff: Set<number>): string {
	if (diff.size === 0) return snapshot;
	const lines = snapshot.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (diff.has(i) && lines[i].length > 0) {
			lines[i] = `▸ ${lines[i]}`;
		} else if (lines[i].length > 0) {
			lines[i] = `  ${lines[i]}`;
		}
	}
	return lines.join("\n");
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
		const hasInboundFiles =
			Array.isArray(message.inbound_files) && message.inbound_files.length > 0;

		// 入站文件：必须有活跃会话才接收（避免无人接收的孤儿上传）
		if (hasInboundFiles && session) {
			await this.handleInboundFiles(session, message);
			// 仍然让文本走下面的流程（用户可能在同一条消息里既贴图又发命令）
		}

		if (!isCliCommand && !shortcut && !session && !hasInboundFiles)
			return false;

		const terminalCfg = this.config;
		if (!terminalCfg.enabled) {
			if (isCliCommand || shortcut || hasInboundFiles) {
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

		if (shortcut) {
			if (!session) {
				await this.replySystem(
					message,
					"当前没有活跃的终端会话，无法发送按键。可用 /cli start 启动。",
				);
				return true;
			}
			await this.dispatchParsed(message, session, shortcut);
			return true;
		}

		// session 已存在 → 普通文本作为 stdin（先经过危险检测）
		if (session) {
			await this.injectStdin(session, message, text, { fromHistory: false });
		}
		return true;
	}

	private async handleCliCommand(
		message: RemoteInboundMessage,
		text: string,
	): Promise<void> {
		const parsed = parseCliCommand(text);
		const peerKey = peerKeyOf(message.channel_id, message.peer_id);
		const session = this.sessionsByPeer.get(peerKey);
		await this.dispatchParsed(message, session ?? null, parsed);
	}

	private async dispatchParsed(
		message: RemoteInboundMessage,
		session: PtySession | null,
		parsed: ReturnType<typeof parseCliCommand>,
	): Promise<void> {
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
				if (!session) {
					await this.replySystem(
						message,
						"当前没有活跃的终端会话，无法发送按键。",
					);
					return;
				}
				await this.handleKey(session, parsed.key);
				return;
			case "text":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.injectStdin(session, message, parsed.text, {
					fromHistory: false,
				});
				return;
			case "scroll":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				this.applyScroll(session, parsed.dir, parsed.amount);
				await this.flushSnapshot(session, { force: true });
				return;
			case "resize":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleResize(session, parsed.cols, parsed.rows);
				return;
			case "color":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				session.colorMode = mapCliColorMode(parsed.mode);
				await this.replySystem(
					message,
					`颜色模式已切换为 ${parsed.mode}（仅本会话生效）。`,
				);
				await this.flushSnapshot(session, { force: true });
				return;
			case "speed":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				session.speedMode = parsed.mode;
				this.rearmSnapshotTimer(session);
				await this.replySystem(
					message,
					`刷新频率已切换为 ${parsed.mode}（${SPEED_INTERVAL_MS[parsed.mode]}ms）。`,
				);
				return;
			case "history":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.replySystem(message, formatHistory(session.history));
				return;
			case "recall":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleRecall(session, message, parsed.index);
				return;
			case "get":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleGet(session, message, parsed.path);
				return;
			case "more":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleMore(session, message);
				return;
			case "confirm":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleConfirm(session, message);
				return;
			case "cancel":
				if (!session) {
					await this.replySystem(message, "当前没有活跃的终端会话。");
					return;
				}
				await this.handleCancel(session, message);
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
			`  颜色：${session.colorMode}`,
			`  节流：${session.speedMode} (${SPEED_INTERVAL_MS[session.speedMode]}ms)`,
			`  运行时长：${ageSec}s`,
			`  待确认：${session.pendingConfirm ? "✓（/cli confirm | cancel）" : "无"}`,
			`  折叠剩余：${session.morePages.length} 页`,
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

		// 自由命令模式启动时也要走危险检测；命中后直接拒绝（启动期不弹确认，强制
		// 用户改写命令，避免远程不可见的 rm -rf 误启动）
		if (terminalCfg.dangerousCommandConfirm) {
			const danger = detectDangerousInput(
				command,
				terminalCfg.dangerousPatterns,
			);
			if (danger) {
				await this.replySystem(
					message,
					[
						`⚠️ 启动命令命中危险模式 \`${danger.pattern}\`：${danger.preview}`,
						"为安全起见远控启动不接受危险命令，请改写后重试，或先在桌面端执行。",
					].join("\n"),
				);
				return;
			}
		}

		const cwd = resolveCwd(cwdInput ?? preset?.cwd, terminalCfg);
		const initialCols = pickInitialCols(message.channel_id, terminalCfg);
		const initialRows = terminalCfg.rows;

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
		let streamingHealthy = true;
		const format: "plain" | "ansi" =
			terminalCfg.colorMode === "plain" ? "plain" : "ansi";
		try {
			await streaming.start({
				title: `终端：${preset?.name ?? command}`,
				template: "blue",
				note: `cwd ${cwd}`,
				replyToMessageId: message.message_id,
				terminalShortcuts: DEFAULT_TERMINAL_SHORTCUTS,
				format,
			});
		} catch (error) {
			streamingHealthy = false;
			const err = error instanceof Error ? error.message : String(error);
			this.log("warn", `streaming.start 失败，转入离线缓冲：${err}`);
			await this.replySystem(
				message,
				`流式卡片初始化失败：${err}\n会话仍会继续运行，可用 /cli status 查看。`,
			);
		}

		const aggregator = new PtyScreenAggregator({
			cols: initialCols,
			rows: initialRows,
			scrollback: Math.max(50, terminalCfg.scrollbackLines),
		});

		const sessionId = randomUUID();
		const terminalId = `remote-pty-${sessionId}`;
		let terminalInfo: TerminalInfo;
		try {
			terminalInfo = this.terminalService.createTerminal(terminalId, {
				cwd,
				cols: initialCols,
				rows: initialRows,
				shell: this.pickShellForCommand(command),
				env: {
					COLUMNS: String(initialCols),
					LINES: String(initialRows),
					TERM: "xterm-256color",
				},
			});
		} catch (error) {
			aggregator.dispose();
			try {
				await streaming.close(
					`启动失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} catch {
				// streaming 也已不可用时，静默吞掉
			}
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
			history: new CommandHistory(terminalCfg.commandHistorySize),
			colorMode: terminalCfg.colorMode,
			speedMode: "normal",
			morePages: [],
			pendingConfirm: null,
			consecutiveFailures: 0,
			adaptiveBackoff: 1,
			streamingHealthy,
			lastShortcutsSignature: shortcutsSignature(DEFAULT_TERMINAL_SHORTCUTS),
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

		this.attachDesktopForwarding(session, terminalInfo);

		this.rearmSnapshotTimer(session);
		this.armIdleTimer(session);

		this.sessionsByPeer.set(peerKey, session);
		this.sessionsById.set(sessionId, session);

		// 把启动命令写到 pty
		this.terminalService.writeTerminal(terminalId, `${command}\n`);
		session.history.push(command);

		this.log(
			"info",
			`pty 启动：${message.channel_id}/${message.peer_id} → ${command} (cwd=${cwd}, pid=${terminalInfo.pid}, ${initialCols}×${initialRows})`,
		);
	}

	private pickShellForCommand(_command: string): string | undefined {
		return undefined;
	}

	private rearmSnapshotTimer(session: PtySession): void {
		if (session.snapshotTimer) {
			clearInterval(session.snapshotTimer);
			session.snapshotTimer = null;
		}
		const baseFromSpeed = SPEED_INTERVAL_MS[session.speedMode];
		const baseFromCfg = Math.max(100, this.config.snapshotIntervalMs);
		const base = Math.max(baseFromSpeed, baseFromCfg);
		const interval = Math.round(base * Math.max(1, session.adaptiveBackoff));
		session.snapshotTimer = setInterval(() => {
			if (!session.pendingSnapshot) return;
			session.pendingSnapshot = false;
			void this.flushSnapshot(session);
		}, interval);
	}

	private armIdleTimer(session: PtySession): void {
		if (session.idleTimer) clearTimeout(session.idleTimer);
		const timeout = this.config.idleTimeoutMs;
		if (timeout <= 0) return;
		session.idleTimer = setTimeout(() => {
			void this.closeSession(session, { reason: "会话空闲超时" });
		}, timeout);
	}

	/**
	 * 主 stdin 注入入口，含危险检测。
	 *
	 * @param fromHistory 是否来自 /cli recall（来自历史时跳过 history.push 避免重复）
	 */
	private async injectStdin(
		session: PtySession,
		message: RemoteInboundMessage,
		text: string,
		opts: { fromHistory: boolean },
	): Promise<void> {
		// 待确认状态下接收到任意非 confirm/cancel 文本就当作取消
		if (session.pendingConfirm) {
			await this.replySystem(
				message,
				"当前有待确认的危险命令，请先 /cli confirm 或 /cli cancel。",
			);
			return;
		}
		const terminalCfg = this.config;
		if (terminalCfg.dangerousCommandConfirm) {
			const danger = detectDangerousInput(text, terminalCfg.dangerousPatterns);
			if (danger) {
				session.pendingConfirm = {
					kind: "stdin",
					text,
					preview: danger.preview,
					pattern: danger.pattern,
					queuedAt: Date.now(),
				};
				await this.replySystem(
					message,
					[
						`⚠️ 命令命中危险模式 \`${danger.pattern}\`：${danger.preview}`,
						"发送 `/cli confirm` 继续执行，`/cli cancel` 放弃。",
					].join("\n"),
				);
				await this.flushSnapshot(session, { force: true });
				return;
			}
		}
		this.terminalService.writeTerminal(session.terminalId, `${text}\n`);
		if (!opts.fromHistory) session.history.push(text);
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
		session: PtySession,
		key: keyof typeof KEY_SEQUENCE,
	): Promise<void> {
		this.terminalService.writeTerminal(session.terminalId, KEY_SEQUENCE[key]);
		session.lastActivityAt = Date.now();
		this.armIdleTimer(session);
	}

	private applyScroll(
		session: PtySession,
		dir: "up" | "down" | "top" | "bottom" | "page-up" | "page-down",
		amount?: number,
	): void {
		const agg = session.aggregator;
		switch (dir) {
			case "up":
				agg.scrollUp(amount ?? 5);
				break;
			case "down":
				agg.scrollDown(amount ?? 5);
				break;
			case "top":
				agg.scrollToTop();
				break;
			case "bottom":
				agg.scrollToBottom();
				break;
			case "page-up":
				agg.pageUp();
				break;
			case "page-down":
				agg.pageDown();
				break;
		}
	}

	private async handleResize(
		session: PtySession,
		cols: number,
		rows: number | undefined,
	): Promise<void> {
		const targetCols = Math.max(30, Math.min(240, cols));
		const targetRows = rows
			? Math.max(8, Math.min(80, rows))
			: session.aggregator.rows;
		this.terminalService.resizeTerminal(
			session.terminalId,
			targetCols,
			targetRows,
		);
		session.aggregator.resize(targetCols, targetRows);
		await this.flushSnapshot(session, { force: true });
	}

	private async handleRecall(
		session: PtySession,
		message: RemoteInboundMessage,
		index: number,
	): Promise<void> {
		const entry = session.history.get(index);
		if (!entry) {
			await this.replySystem(
				message,
				`历史 #${index} 不存在，可用 /cli history 查看可用编号。`,
			);
			return;
		}
		await this.injectStdin(session, message, entry.text, { fromHistory: true });
	}

	private async handleGet(
		session: PtySession,
		message: RemoteInboundMessage,
		relativePath: string,
	): Promise<void> {
		const cfg = this.config;
		if (!cfg.fileTransferEnabled) {
			await this.replySystem(message, "文件上下行已在设置面板关闭。");
			return;
		}
		const transfer = this.deps.resolveChannelFileTransfer?.(session.channelId);
		if (!transfer || !transfer.isEnabled()) {
			await this.replySystem(
				message,
				notSupportedFileTransfer(session.channelId),
			);
			return;
		}
		const result = await loadOutboundFile(session.cwd, relativePath, {
			maxBytes: cfg.maxDownloadBytes,
		});
		if (!result.ok) {
			await this.replySystem(message, `下载失败：${result.reason}`);
			return;
		}
		try {
			await sendFileViaChannel(transfer, {
				targetId: message.target_id,
				fileName: path.basename(result.absPath),
				data: result.data,
				mimeType: result.mimeType,
				caption: `📎 ${path.basename(result.absPath)}（${result.data.byteLength} 字节）`,
				replyToMessageId: message.message_id,
			});
		} catch (error) {
			await this.replySystem(
				message,
				`渠道回传文件失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async handleMore(
		session: PtySession,
		message: RemoteInboundMessage,
	): Promise<void> {
		const page = session.morePages.shift();
		if (!page) {
			await this.replySystem(message, "没有更多折叠页了。");
			return;
		}
		try {
			await session.streaming.update(wrapSnapshot(page, "plain"));
		} catch (error) {
			this.log(
				"warn",
				`/cli more 推送失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async handleConfirm(
		session: PtySession,
		message: RemoteInboundMessage,
	): Promise<void> {
		const pending = session.pendingConfirm;
		if (!pending) {
			await this.replySystem(message, "当前没有待确认的危险命令。");
			return;
		}
		session.pendingConfirm = null;
		this.terminalService.writeTerminal(session.terminalId, `${pending.text}\n`);
		session.history.push(pending.text);
		await this.replySystem(message, `✅ 已执行：${pending.preview}`);
		await this.flushSnapshot(session, { force: true });
	}

	private async handleCancel(
		session: PtySession,
		message: RemoteInboundMessage,
	): Promise<void> {
		const pending = session.pendingConfirm;
		session.pendingConfirm = null;
		await this.replySystem(
			message,
			pending
				? `已取消：${pending.preview}`
				: "当前没有待确认的危险命令，已为你忽略。",
		);
		await this.flushSnapshot(session, { force: true });
	}

	private async handleInboundFiles(
		session: PtySession,
		message: RemoteInboundMessage,
	): Promise<void> {
		const cfg = this.config;
		const files = message.inbound_files ?? [];
		if (files.length === 0) return;
		if (!cfg.fileTransferEnabled) {
			await this.replySystem(
				message,
				"📎 检测到附件，但文件上下行已在设置面板关闭，已忽略。",
			);
			return;
		}
		const result = await saveInboundFiles(session.cwd, files, {
			maxBytes: cfg.maxUploadBytes,
		});
		const savedLines = result.saved.map(
			(s) => `  • ${s.filename}（${s.bytes} 字节）→ .uploads/${s.filename}`,
		);
		const skippedLines = result.skipped.map(
			(s) => `  • ${s.filename}：${s.reason}`,
		);
		if (savedLines.length > 0) {
			await this.replySystem(
				message,
				[
					`📥 ${result.saved.length} 个附件已落到 ${path.join(session.cwd, ".uploads")}：`,
					...savedLines,
					...(skippedLines.length > 0 ? ["跳过：", ...skippedLines] : []),
				].join("\n"),
			);
			// 向 pty 注入一条提示文本（不当作命令执行，仅做注解）
			const noteLine = `# 已收到附件：${result.saved.map((s) => `.uploads/${s.filename}`).join(", ")}\n`;
			this.terminalService.writeTerminal(session.terminalId, noteLine);
		} else if (skippedLines.length > 0) {
			await this.replySystem(
				message,
				[`📥 收到的附件全部跳过：`, ...skippedLines].join("\n"),
			);
		}
	}

	/**
	 * 主快照推送。force=true 时即使 pendingSnapshot=false 也强制推一帧。
	 */
	private async flushSnapshot(
		session: PtySession,
		opts: { force?: boolean } = {},
	): Promise<void> {
		if (session.closed) return;
		if (!session.streamingHealthy && !opts.force) {
			// 离线模式下不主动推；force=true（用户操作了 scroll/resize 等）允许重试
			return;
		}
		try {
			const terminalCfg = this.config;
			const fmt: "plain" | "ansi" =
				session.colorMode === "plain" ? "plain" : "ansi";
			let body: string;
			if (fmt === "ansi" && session.colorMode !== "plain") {
				body = session.aggregator.snapshotAnsi();
			} else {
				body = session.aggregator.snapshotPlain();
			}
			if (terminalCfg.highlightDiff) {
				const diff = session.aggregator.diffWithPrev();
				body = highlightDiffLines(body, diff);
			}
			// 拼状态条
			if (terminalCfg.showStatusBar) {
				const status = session.aggregator.statusLine({
					command: session.command,
					cwd: session.cwd,
					pid: session.pid ?? "-",
					startedAt: session.startedAt,
					cols: session.aggregator.cols,
					rows: session.aggregator.rows,
				});
				body = `${status}\n${body}`;
			}
			// 折叠
			const folded = foldLongOutput(body, {
				threshold: terminalCfg.longOutputFoldThreshold,
			});
			session.morePages = folded.morePages;
			const wrapped = wrapSnapshot(folded.visible, fmt);
			await session.streaming.update(wrapped);

			// 上下文按钮
			if (terminalCfg.contextAwareButtons) {
				const ctx = session.aggregator.detectContext();
				const shortcuts = buildContextualShortcuts({
					context: ctx,
					hasMorePages: folded.morePages.length > 0,
					pendingConfirm: session.pendingConfirm !== null,
					scrolling: !session.aggregator.isViewportPinned(),
				});
				const sig = shortcutsSignature(shortcuts);
				if (sig !== session.lastShortcutsSignature) {
					session.lastShortcutsSignature = sig;
					if (session.streaming.updateShortcuts) {
						await session.streaming.updateShortcuts(shortcuts).catch(() => {
							// 渠道未实现或失败时静默；下次 detect 仍会再试
						});
					}
				}
			}

			session.consecutiveFailures = 0;
			session.adaptiveBackoff = 1;
			session.streamingHealthy = true;
		} catch (error) {
			session.consecutiveFailures += 1;
			if (session.consecutiveFailures >= 3) {
				session.adaptiveBackoff = Math.min(8, session.adaptiveBackoff * 2);
				this.rearmSnapshotTimer(session);
				this.log(
					"warn",
					`快照推送连续失败 ${session.consecutiveFailures} 次，自适应节流系数升至 ${session.adaptiveBackoff}（${session.peerKey}）`,
				);
			}
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

		if (session.desktopAttached) {
			this.sendToDesktop("remote-terminal-detached", {
				id: session.terminalId,
				reason: options.reason,
			});
			this.sendToDesktop("terminal-exit", {
				id: session.terminalId,
				exitCode: 0,
			});
		}

		const fmt: "plain" | "ansi" =
			session.colorMode === "plain" ? "plain" : "ansi";
		const finalSnapshot =
			fmt === "ansi"
				? session.aggregator.snapshotAnsi()
				: session.aggregator.snapshotPlain();
		try {
			await session.streaming.close(wrapSnapshot(finalSnapshot, fmt), {
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
	 */
	private attachDesktopForwarding(
		session: PtySession,
		terminalInfo: TerminalInfo,
	): void {
		if (!this.deps.getMainWindow) return;

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

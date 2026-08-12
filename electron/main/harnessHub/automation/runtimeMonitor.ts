/**
 * 运行态监测 —— 「现在有哪些 AI 在跑、各自处于什么状态」。
 *
 * ## 为什么需要它
 *
 * Hub 此前唯一的「状态」是 `harness_sessions.status`，含义是「会话文件还在不在
 * 追加写」。这个信号回答不了真正要紧的问题：pty 里那个 claude 是在干活、
 * 在等你输入、还是十分钟前就报了 `API Error: 529` 然后僵在那儿？无人值守时
 * 这两种情况看起来完全一样——文件都不动了。
 *
 * 这里把三类执行体统一登记成可观测的条目：
 *
 * | kind     | 注册方                          | 状态来源                       |
 * |----------|--------------------------------|--------------------------------|
 * | `pty`    | ptyLauncher 起的 CLI            | 常驻虚拟屏轮询                  |
 * | `bridge` | bridge.ts 的 headless 子进程     | 流式 stdout + 退出码            |
 * | `sdk`    | 本应用的 Agent SDK runner        | runner 生命周期                 |
 *
 * ## 判定只做观察，不做推测
 *
 * 状态全部来自真实输出：屏幕在变就是 working，命中就绪特征且静止就是 idle，
 * `classifyFailure` 命中就是 error。**没有**「大概还在跑吧」这类推断——
 * 判不出来就维持上一个状态，UI 显示的是最后一次确定的事实。
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "../../logging/logger";
import { classifyFailure, type FailureSignal } from "./errors";

const logger = createLogger();

/** 执行体种类。 */
export type RuntimeKind = "pty" | "bridge" | "sdk";

/**
 * 执行体状态。
 *
 * `stalled` 与 `working` 的区别是「有没有在产出」：一个跑了两小时但每分钟都在
 * 刷新的 agent 是健康的，一个安静了二十分钟的多半是卡在某个网络调用上了。
 */
export type RuntimeState =
	| "starting"
	| "working"
	| "idle"
	| "error"
	| "stalled"
	| "exited";

export interface RuntimeEntry {
	id: string;
	kind: RuntimeKind;
	/** 入口 id：claude-code / codex / … */
	harness: string;
	/** UI 展示名 */
	label: string;
	cwd: string | null;
	state: RuntimeState;
	/** state === "error" 时的判定结果（含原文证据） */
	failure: FailureSignal | null;
	/** 由自动化任务发起时关联的 run id；手动启动为 null */
	jobRunId: string | null;
	/** 关联的 pty（可视执行体）或桥接审计行，供 UI 跳转 */
	ptyId: string | null;
	bridgeCallId: string | null;
	startedAt: number;
	/** 最近一次收到输出的时刻——卡死判定的依据 */
	lastOutputAt: number;
	updatedAt: number;
	exitedAt: number | null;
	exitCode: number | null;
	/** 最近的输出尾巴，让用户一眼看出「它现在在干嘛」 */
	tail: string;
}

/** 内部条目：比对外暴露的多一些不该进 IPC 的东西（回调、上一帧快照）。 */
interface InternalEntry extends RuntimeEntry {
	/** pty 专用：取当前虚拟屏内容 */
	sampler: (() => string) | null;
	/** 中止这个执行体（pty 关闭 / 子进程 kill）；不支持则为 null */
	abort: (() => void) | null;
	/** 是否参与卡死判定。没有流式输出的执行体不参与，否则会被误判 */
	stallDetection: boolean;
	/** 上一帧屏幕快照，用于判断「屏幕有没有在变」 */
	prevScreen: string | null;
}

export interface RegisterInput {
	kind: RuntimeKind;
	harness: string;
	label?: string;
	cwd?: string | null;
	jobRunId?: string | null;
	ptyId?: string | null;
	bridgeCallId?: string | null;
	/** pty 专用：虚拟屏取样函数 */
	sampler?: (() => string) | null;
	abort?: (() => void) | null;
	/** 默认 true；没有流式输出的执行体必须显式关掉 */
	stallDetection?: boolean;
}

/** 轮询间隔。2s 足够跟上 TUI 的节奏，又不至于让主进程一直忙。 */
const TICK_MS = 2_000;
/** 默认卡死阈值：这么久没有任何输出就判 stalled。 */
const DEFAULT_STALL_MS = 10 * 60_000;
/** 退出后保留多久供 UI 展示「刚刚结束的那个」。 */
const EXITED_RETENTION_MS = 5 * 60_000;
/** 变更事件的节流窗口——TUI 刷屏时不能每帧都推一次。 */
const EMIT_THROTTLE_MS = 1_000;
/** 输出尾巴保留的字符数。 */
const TAIL_CHARS = 600;

/** 判「就绪等待输入」的屏幕特征（与 ptyLauncher 的就绪探测同源）。 */
const IDLE_PATTERNS: RegExp[] = [
	/│\s*>/,
	/^\s*>\s*$/m,
	/for shortcuts/i,
	/send a message/i,
	/Type your message/i,
];

/** 判「正在干活」的特征。各家 TUI 在执行期间都会显示可中断提示。 */
const WORKING_PATTERNS: RegExp[] = [
	/esc to interrupt/i,
	/ctrl\+c to (?:stop|cancel|interrupt)/i,
	/\((?:esc|ctrl-c)\)/i,
];

/** 判就绪时只看屏幕尾部若干行（输入框恒在底部）。 */
const TAIL_LINES = 12;

function tailOf(text: string, lines = TAIL_LINES): string {
	return text.split("\n").slice(-lines).join("\n");
}

export type RuntimeChangeListener = (entries: RuntimeEntry[]) => void;

/**
 * 运行态监测单例。
 */
class HarnessRuntimeMonitor {
	private entries = new Map<string, InternalEntry>();
	private listeners = new Set<RuntimeChangeListener>();
	private timer: NodeJS.Timeout | null = null;
	private pendingIds = new Set<string>();
	private emitTimer: NodeJS.Timeout | null = null;
	private stallThresholdMs = DEFAULT_STALL_MS;

	/** 设置卡死阈值（设置面板可调）。 */
	setStallThreshold(ms: number): void {
		if (Number.isFinite(ms) && ms >= 60_000) {
			this.stallThresholdMs = Math.round(ms);
		}
	}

	getStallThreshold(): number {
		return this.stallThresholdMs;
	}

	/** 订阅变更；返回取消订阅函数。 */
	onChange(listener: RuntimeChangeListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** 登记一个执行体，返回它的监测 id。 */
	register(input: RegisterInput): string {
		const now = Date.now();
		const id = randomUUID();
		const entry: InternalEntry = {
			id,
			kind: input.kind,
			harness: input.harness,
			label: input.label?.trim() || input.harness,
			cwd: input.cwd ?? null,
			state: "starting",
			failure: null,
			jobRunId: input.jobRunId ?? null,
			ptyId: input.ptyId ?? null,
			bridgeCallId: input.bridgeCallId ?? null,
			startedAt: now,
			lastOutputAt: now,
			updatedAt: now,
			exitedAt: null,
			exitCode: null,
			tail: "",
			sampler: input.sampler ?? null,
			abort: input.abort ?? null,
			stallDetection: input.stallDetection !== false,
			prevScreen: null,
		};
		this.entries.set(id, entry);
		this.ensureTimer();
		this.markChanged(id);
		return id;
	}

	/** 收到一段输出：刷新尾巴与心跳，并顺手做一次失败判定。 */
	noteOutput(id: string, chunk: string): void {
		const entry = this.entries.get(id);
		if (!entry || entry.state === "exited") return;
		const now = Date.now();
		entry.lastOutputAt = now;
		entry.tail = `${entry.tail}${chunk}`.slice(-TAIL_CHARS);

		// 输出里出现错误信号时立刻置 error——不等到进程退出，
		// 因为很多 CLI 报错后并不退出，而是停在那儿等用户。
		const failure = classifyFailure({ text: entry.tail });
		if (failure) {
			this.applyState(entry, "error", failure);
			return;
		}
		this.applyState(entry, "working", null);
	}

	/** 直接指定状态（sdk runner 这类有明确生命周期回调的来源用）。 */
	setState(
		id: string,
		state: RuntimeState,
		failure: FailureSignal | null = null,
	): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		this.applyState(entry, state, failure);
	}

	/** 标记执行体已退出。 */
	markExited(id: string, exitCode: number | null, output?: string): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		const now = Date.now();
		entry.exitCode = exitCode;
		entry.exitedAt = now;
		if (output) {
			entry.tail = `${entry.tail}${output}`.slice(-TAIL_CHARS);
		}
		// 退出时再判一次：退出码非 0，或输出里留有报错，都要如实记下来
		const failure = classifyFailure({ text: entry.tail, exitCode });
		entry.failure = failure;
		entry.state = "exited";
		entry.updatedAt = now;
		entry.sampler = null;
		entry.abort = null;
		this.markChanged(id);
	}

	/** 注销条目（资源释放路径调用，必须与注册一一对应）。 */
	unregister(id: string): void {
		if (!this.entries.delete(id)) return;
		this.pendingIds.add(id);
		this.scheduleEmit();
		this.maybeStopTimer();
	}

	/** 中止一个执行体。返回是否真的执行了中止动作。 */
	abort(id: string): boolean {
		const entry = this.entries.get(id);
		if (!entry?.abort) return false;
		try {
			entry.abort();
			return true;
		} catch (error) {
			logger.warn({
				msg: "中止执行体失败",
				id,
				harness: entry.harness,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/** 当前全部执行体（按启动时间倒序）。 */
	list(): RuntimeEntry[] {
		return [...this.entries.values()]
			.map((e) => this.toPublic(e))
			.sort((a, b) => b.startedAt - a.startedAt);
	}

	get(id: string): RuntimeEntry | null {
		const entry = this.entries.get(id);
		return entry ? this.toPublic(entry) : null;
	}

	/** 停止监测（应用退出时）。 */
	dispose(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.emitTimer) {
			clearTimeout(this.emitTimer);
			this.emitTimer = null;
		}
		this.entries.clear();
		this.pendingIds.clear();
		this.listeners.clear();
	}

	// ---------- 内部 ----------

	/**
	 * 内部条目 → 对外条目。
	 *
	 * 显式列字段而不是 `{...rest}` 解构：内部条目上挂着回调与上一帧快照，
	 * 这些东西一旦顺着 IPC 漏出去要么序列化失败、要么把整屏历史推给渲染端。
	 * 白名单式转换让「以后给内部条目加字段」不会意外变成一次数据泄漏。
	 */
	private toPublic(entry: InternalEntry): RuntimeEntry {
		return {
			id: entry.id,
			kind: entry.kind,
			harness: entry.harness,
			label: entry.label,
			cwd: entry.cwd,
			state: entry.state,
			failure: entry.failure,
			jobRunId: entry.jobRunId,
			ptyId: entry.ptyId,
			bridgeCallId: entry.bridgeCallId,
			startedAt: entry.startedAt,
			lastOutputAt: entry.lastOutputAt,
			updatedAt: entry.updatedAt,
			exitedAt: entry.exitedAt,
			exitCode: entry.exitCode,
			tail: entry.tail,
		};
	}

	private applyState(
		entry: InternalEntry,
		state: RuntimeState,
		failure: FailureSignal | null,
	): void {
		// error 是「粘性」的：一旦报错，后续屏幕重绘不该把它悄悄抹掉，
		// 只有真正的新输出（noteOutput 判定为正常）或退出才能改写。
		const sameState = entry.state === state;
		const sameFailure = entry.failure?.kind === failure?.kind;
		if (sameState && sameFailure) {
			entry.updatedAt = Date.now();
			return;
		}
		entry.state = state;
		entry.failure = failure;
		entry.updatedAt = Date.now();
		this.markChanged(entry.id);
	}

	private ensureTimer(): void {
		if (this.timer) return;
		this.timer = setInterval(() => this.tick(), TICK_MS);
		// 监测循环不该拖住应用退出
		this.timer.unref?.();
	}

	private maybeStopTimer(): void {
		if (this.entries.size > 0 || !this.timer) return;
		clearInterval(this.timer);
		this.timer = null;
	}

	private tick(): void {
		const now = Date.now();
		for (const entry of [...this.entries.values()]) {
			// 退出条目保留一段时间供 UI 展示，然后清掉
			if (entry.state === "exited") {
				if (entry.exitedAt && now - entry.exitedAt > EXITED_RETENTION_MS) {
					this.unregister(entry.id);
				}
				continue;
			}

			if (entry.sampler) {
				this.pollScreen(entry, now);
			}

			// 卡死判定：安静太久，且不是「在等你输入」
			if (
				entry.stallDetection &&
				entry.state !== "idle" &&
				entry.state !== "stalled" &&
				now - entry.lastOutputAt > this.stallThresholdMs
			) {
				this.applyState(
					entry,
					"stalled",
					classifyFailure({ text: entry.tail, stalled: true }),
				);
			}
		}
		this.maybeStopTimer();
	}

	/** 轮询一个 pty 的虚拟屏并据此更新状态。 */
	private pollScreen(entry: InternalEntry, now: number): void {
		let screen = "";
		try {
			screen = entry.sampler?.() ?? "";
		} catch {
			// 虚拟屏已释放：让卡死判定接管，不在这里猜测
			entry.sampler = null;
			return;
		}
		if (!screen.trim()) return;

		const changed = entry.prevScreen !== null && screen !== entry.prevScreen;
		if (changed) entry.lastOutputAt = now;
		entry.prevScreen = screen;

		const tail = tailOf(screen);
		entry.tail = tail.slice(-TAIL_CHARS);

		// 1. 报错优先：屏幕上留着 API Error 就是 error，哪怕它还在闪光标
		const failure = classifyFailure({ text: tail });
		if (failure) {
			this.applyState(entry, "error", failure);
			return;
		}
		// 2. 明确的「正在执行」特征
		if (WORKING_PATTERNS.some((re) => re.test(tail))) {
			this.applyState(entry, "working", null);
			return;
		}
		// 3. 屏幕静止 + 就绪特征 = 在等输入
		if (!changed && IDLE_PATTERNS.some((re) => re.test(tail))) {
			this.applyState(entry, "idle", null);
			return;
		}
		// 4. 屏幕在变 = 在干活
		if (changed) {
			this.applyState(entry, "working", null);
		}
		// 5. 其余情况维持原状态——判不出来就不改，不做推测
	}

	private markChanged(id: string): void {
		this.pendingIds.add(id);
		this.scheduleEmit();
	}

	private scheduleEmit(): void {
		if (this.emitTimer) return;
		this.emitTimer = setTimeout(() => {
			this.emitTimer = null;
			const ids = [...this.pendingIds];
			this.pendingIds.clear();
			if (!ids.length || !this.listeners.size) return;
			// 变更条目里已被移除的，用一个 exited 占位告诉前端把它去掉
			const payload = ids.map(
				(id) =>
					this.get(id) ?? {
						id,
						kind: "bridge" as RuntimeKind,
						harness: "",
						label: "",
						cwd: null,
						state: "exited" as RuntimeState,
						failure: null,
						jobRunId: null,
						ptyId: null,
						bridgeCallId: null,
						startedAt: 0,
						lastOutputAt: 0,
						updatedAt: Date.now(),
						exitedAt: Date.now(),
						exitCode: null,
						tail: "",
					},
			);
			for (const listener of this.listeners) {
				try {
					listener(payload);
				} catch (error) {
					logger.warn({
						msg: "运行态监听器抛错",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}, EMIT_THROTTLE_MS);
		this.emitTimer.unref?.();
	}
}

export const harnessRuntimeMonitor = new HarnessRuntimeMonitor();

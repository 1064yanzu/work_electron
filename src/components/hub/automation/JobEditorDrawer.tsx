/**
 * JobEditorDrawer —— 新建 / 编辑自动化任务。
 *
 * 表单的组织顺序照着用户脑子里的顺序走：**让谁干 → 干什么 → 什么时候干 →
 * 出错了怎么办**。最后一段（重试策略）默认折叠，因为默认值对大多数人够用，
 * 但要能展开——「我的 API 老断」这个诉求最终就落在那几个数字上。
 *
 * 两处刻意的措辞：
 * - 写权限的说明直说风险，不含糊。无人值守时开写权限是用户的显式选择。
 * - 完成判据一栏明确写「只判错误信号」，避免用户以为系统会验收任务成果。
 */
import { useMemo, useState } from "react";
import { ChevronDown, FolderOpen, X } from "lucide-react";
import {
	saveAutomationJob,
	type HarnessJobRow,
	type HarnessJobTriggerRow,
} from "../../../lib/api/harnessAutomation";
import { invoke } from "../../../lib/tauriCompat";
import { cn } from "../../../lib/utils";
import { useFocusTrap } from "../../ui/FocusTrap";
import { toast } from "../../ui/Toast";
import { EXEC_MODE_LABEL } from "./automationUtils";

type TriggerType = HarnessJobTriggerRow["type"];

const WEEKDAYS = [
	{ value: 1, label: "一" },
	{ value: 2, label: "二" },
	{ value: 3, label: "三" },
	{ value: 4, label: "四" },
	{ value: 5, label: "五" },
	{ value: 6, label: "六" },
	{ value: 0, label: "日" },
];

/** 把 `once` 的时间戳与 datetime-local 的字符串互转。 */
function toLocalInput(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JobEditorDrawer({
	job,
	harnesses,
	defaultCwd,
	onClose,
	onSaved,
}: {
	job: HarnessJobRow | null;
	harnesses: { id: string; label: string; kind: "cli" | "web" | "app" }[];
	defaultCwd: string | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	// 只有 CLI 入口能被自动化驱动：Web 站点靠 DOM 注入，无人值守时
	// 一次 DOM 变化就会让任务静默失败；本应用 Agent 走的是另一套运行时。
	const cliHarnesses = useMemo(
		() => harnesses.filter((h) => h.kind === "cli"),
		[harnesses],
	);

	const [name, setName] = useState(job?.name ?? "");
	const [targetHarness, setTargetHarness] = useState(
		job?.target_harness ?? cliHarnesses[0]?.id ?? "claude-code",
	);
	const [execMode, setExecMode] = useState<"headless" | "pty">(
		job?.exec_mode ?? "headless",
	);
	const [cwd, setCwd] = useState(job?.cwd ?? defaultCwd ?? "");
	const [prompt, setPrompt] = useState(job?.prompt ?? "");
	const [allowWrite, setAllowWrite] = useState(job?.allow_write ?? false);

	// 先取成局部常量再判别，让 TS 能按 type 字段窄化到具体的触发器分支
	const initialTrigger = job?.trigger ?? null;
	const [triggerType, setTriggerType] = useState<TriggerType>(
		initialTrigger?.type ?? "daily",
	);
	const [dailyTime, setDailyTime] = useState(
		initialTrigger?.type === "daily" ? initialTrigger.time : "02:00",
	);
	const [weekdays, setWeekdays] = useState<number[]>(
		initialTrigger?.type === "daily" ? initialTrigger.weekdays : [],
	);
	const [intervalMinutes, setIntervalMinutes] = useState(
		initialTrigger?.type === "interval" ? initialTrigger.minutes : 60,
	);
	const [onceAt, setOnceAt] = useState(
		toLocalInput(
			initialTrigger?.type === "once"
				? initialTrigger.at
				: Date.now() + 3_600_000,
		),
	);

	const [windowEnabled, setWindowEnabled] = useState(Boolean(job?.window));
	const [windowStart, setWindowStart] = useState(job?.window?.start ?? "01:00");
	const [windowEnd, setWindowEnd] = useState(job?.window?.end ?? "06:00");

	const [showAdvanced, setShowAdvanced] = useState(false);
	const [maxAttempts, setMaxAttempts] = useState(job?.max_attempts ?? 5);
	const [failover, setFailover] = useState(job?.failover_enabled ?? false);
	const [misfire, setMisfire] = useState<"skip" | "runOnce">(
		job?.retry_policy.misfire ?? "skip",
	);
	const [timeoutMinutes, setTimeoutMinutes] = useState(
		job?.timeout_ms ? Math.round(job.timeout_ms / 60_000) : 0,
	);
	const [saving, setSaving] = useState(false);

	// 焦点陷阱：Tab 循环 + Esc（经 overlayStack 只由栈顶消费）+ 关闭后焦点回归
	const trapRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });

	const pickCwd = async () => {
		try {
			const result = await invoke<{ path: string | null }>(
				"system_pick_directory",
				{ title: "选择任务的工作目录" },
			);
			if (result?.path) setCwd(result.path);
		} catch {
			// 对话框被取消或该命令不可用：让用户手填即可，不打断
		}
	};

	const buildTrigger = (): HarnessJobTriggerRow => {
		if (triggerType === "manual") return { type: "manual" };
		if (triggerType === "once") {
			return { type: "once", at: new Date(onceAt).getTime() };
		}
		if (triggerType === "interval") {
			return { type: "interval", minutes: Math.max(1, intervalMinutes) };
		}
		return { type: "daily", time: dailyTime, weekdays };
	};

	const submit = async () => {
		if (!name.trim()) {
			toast.error("给任务起个名字");
			return;
		}
		if (!prompt.trim()) {
			toast.error("任务指令不能为空");
			return;
		}
		if (execMode === "pty" && !cwd.trim()) {
			toast.error("可视终端形态必须指定工作目录");
			return;
		}
		setSaving(true);
		try {
			await saveAutomationJob({
				id: job?.id ?? null,
				name: name.trim(),
				target_harness: targetHarness,
				exec_mode: execMode,
				cwd: cwd.trim() || null,
				prompt: prompt.trim(),
				allow_write: allowWrite,
				trigger: buildTrigger(),
				window: windowEnabled ? { start: windowStart, end: windowEnd } : null,
				max_attempts: maxAttempts,
				failover_enabled: failover,
				retry_policy: { misfire },
				timeout_ms: timeoutMinutes > 0 ? timeoutMinutes * 60_000 : null,
			});
			toast.success(job ? "任务已更新" : "任务已创建");
			onSaved();
		} catch (error) {
			toast.error(
				`保存失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="absolute inset-0 z-30 flex justify-end animate-in fade-in duration-150">
			{/* 遮罩：点击关闭。表单比接力抽屉长得多，压暗底层有助于聚焦 */}
			<button
				type="button"
				aria-label="关闭"
				className="flex-1 bg-black/25 backdrop-blur-[1px]"
				onClick={onClose}
			/>
			{/* 背景必须是实心的。这里曾写成 bg-bg —— 项目里没有这个类名，
			    结果整个抽屉透明，底层的入口轨道和面板文字全叠上来没法看。 */}
			<div
				ref={trapRef}
				className="w-[420px] max-w-full h-full bg-surface dark:bg-cream-950 border-l border-border shadow-float flex flex-col animate-slide-in-right"
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
					<span className="text-xs font-medium text-text-secondary">
						{job ? "编辑任务" : "新建自动化任务"}
					</span>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded text-text-light hover:text-text-secondary transition duration-150"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-5">
					{/* ---------- 让谁干 ---------- */}
					<Field label="任务名称">
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="例如：夜间跑一遍类型检查并修复"
							className={inputCls}
						/>
					</Field>

					<Field label="交给哪个入口">
						{cliHarnesses.length ? (
							<select
								value={targetHarness}
								onChange={(e) => setTargetHarness(e.target.value)}
								className={inputCls}
							>
								{cliHarnesses.map((h) => (
									<option key={h.id} value={h.id}>
										{h.label}
									</option>
								))}
							</select>
						) : (
							<p className="text-2xs text-warning leading-relaxed">
								本机没有检测到可用的 CLI 入口。自动化只支持 CLI （Web 站点靠 DOM
								注入驱动，无人值守时一次页面改版就会静默失败）。
							</p>
						)}
					</Field>

					<Field label="执行形态">
						<div className="flex gap-1.5">
							{(["headless", "pty"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => setExecMode(mode)}
									className={cn(
										"flex-1 px-2 py-1.5 rounded-lg text-xs transition duration-150 border",
										execMode === mode
											? "border-terracotta/40 bg-terracotta/[0.1] text-terracotta"
											: "border-border text-text-muted hover:text-text-secondary",
									)}
								>
									{EXEC_MODE_LABEL[mode]}
								</button>
							))}
						</div>
						<p className="text-2xs text-text-light mt-1.5 leading-relaxed">
							{execMode === "headless"
								? "后台子进程运行，安静、可并发，输出直接落库。"
								: "起一个终端标签页跑 TUI，全过程可见，随时可以接管交互。"}
						</p>
					</Field>

					<Field label="工作目录">
						<div className="flex gap-1.5">
							<input
								value={cwd}
								onChange={(e) => setCwd(e.target.value)}
								placeholder="/path/to/project"
								className={cn(inputCls, "flex-1 font-mono text-2xs")}
							/>
							<button
								type="button"
								onClick={() => void pickCwd()}
								title="选择目录"
								className="px-2 rounded-lg border border-border text-text-light hover:text-text-secondary transition duration-150"
							>
								<FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
							</button>
						</div>
					</Field>

					{/* ---------- 干什么 ---------- */}
					<Field label="任务指令">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={5}
							placeholder="要它做什么，写清楚。这段话会作为首条指令发给目标 AI。"
							className={cn(inputCls, "resize-none leading-relaxed")}
						/>
					</Field>

					<label className="flex items-start gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={allowWrite}
							onChange={(e) => setAllowWrite(e.target.checked)}
							className="mt-1 accent-terracotta"
						/>
						<span className="min-w-0">
							<span className="block text-xs text-text-secondary">
								允许修改文件
							</span>
							<span className="block text-2xs text-text-light leading-relaxed mt-0.5">
								关闭时只能读取和分析。开启后目标 AI
								会直接改这个目录里的文件，且无人值守、没有逐条审阅的机会——
								建议先确保工作区已提交。
							</span>
						</span>
					</label>

					{/* ---------- 什么时候干 ---------- */}
					<Field label="触发方式">
						<div className="grid grid-cols-2 gap-1.5">
							{(
								[
									["daily", "每天 / 每周"],
									["interval", "每隔一段时间"],
									["once", "指定时刻一次"],
									["manual", "仅手动"],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									type="button"
									onClick={() => setTriggerType(value)}
									className={cn(
										"px-2 py-1.5 rounded-lg text-xs transition duration-150 border",
										triggerType === value
											? "border-terracotta/40 bg-terracotta/[0.1] text-terracotta"
											: "border-border text-text-muted hover:text-text-secondary",
									)}
								>
									{label}
								</button>
							))}
						</div>
					</Field>

					{triggerType === "daily" && (
						<>
							<Field label="时刻">
								<input
									type="time"
									value={dailyTime}
									onChange={(e) => setDailyTime(e.target.value)}
									className={inputCls}
								/>
							</Field>
							<Field label="星期（不选 = 每天）">
								<div className="flex gap-1">
									{WEEKDAYS.map((day) => (
										<button
											key={day.value}
											type="button"
											onClick={() =>
												setWeekdays((prev) =>
													prev.includes(day.value)
														? prev.filter((d) => d !== day.value)
														: [...prev, day.value],
												)
											}
											className={cn(
												"w-7 h-7 rounded-lg text-xs transition duration-150 border",
												weekdays.includes(day.value)
													? "border-terracotta/40 bg-terracotta/[0.1] text-terracotta"
													: "border-border text-text-muted hover:text-text-secondary",
											)}
										>
											{day.label}
										</button>
									))}
								</div>
							</Field>
						</>
					)}

					{triggerType === "interval" && (
						<Field label="间隔（分钟）">
							<input
								type="number"
								min={1}
								value={intervalMinutes}
								onChange={(e) => setIntervalMinutes(Number(e.target.value))}
								className={inputCls}
							/>
						</Field>
					)}

					{triggerType === "once" && (
						<Field label="执行时刻">
							<input
								type="datetime-local"
								value={onceAt}
								onChange={(e) => setOnceAt(e.target.value)}
								className={inputCls}
							/>
						</Field>
					)}

					{triggerType !== "manual" && triggerType !== "once" && (
						<div>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={windowEnabled}
									onChange={(e) => setWindowEnabled(e.target.checked)}
									className="accent-terracotta"
								/>
								<span className="text-xs text-text-secondary">
									只在时间窗内执行
								</span>
							</label>
							{windowEnabled && (
								<div className="flex items-center gap-2 mt-2">
									<input
										type="time"
										value={windowStart}
										onChange={(e) => setWindowStart(e.target.value)}
										className={cn(inputCls, "flex-1")}
									/>
									<span className="text-xs text-text-light">至</span>
									<input
										type="time"
										value={windowEnd}
										onChange={(e) => setWindowEnd(e.target.value)}
										className={cn(inputCls, "flex-1")}
									/>
								</div>
							)}
							<p className="text-2xs text-text-light mt-1.5 leading-relaxed">
								到点但不在窗口内时推迟到窗口开启。可以跨零点（如 22:00 至
								06:00）。
							</p>
						</div>
					)}

					{/* ---------- 出错了怎么办 ---------- */}
					<div>
						<button
							type="button"
							onClick={() => setShowAdvanced((v) => !v)}
							className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition duration-150"
						>
							<ChevronDown
								className={cn(
									"w-3 h-3 transition duration-150",
									showAdvanced && "rotate-180",
								)}
								strokeWidth={1.5}
							/>
							失败重试策略
						</button>

						{showAdvanced && (
							<div className="mt-3 space-y-4 pl-4 border-l border-border/60">
								<p className="text-2xs text-text-light leading-relaxed">
									自动化只判定<b className="font-medium">错误信号</b>
									（429、5xx、连接中断、卡死等），不判定任务本身有没有做完。
									跑完这一轮没有出现可识别的错误就算这轮结束——
									活干得怎么样，还是要你自己看输出。
								</p>

								<Field label="最多尝试几次">
									<input
										type="number"
										min={1}
										max={50}
										value={maxAttempts}
										onChange={(e) => setMaxAttempts(Number(e.target.value))}
										className={inputCls}
									/>
									<p className="text-2xs text-text-light mt-1 leading-relaxed">
										重试会尽量<b className="font-medium">接着上次的进度续跑</b>
										（用原生会话续接），而不是从头重来。鉴权失败、余额耗尽这类
										重试解决不了的问题会直接停下等你处理，不消耗重试次数。
									</p>
								</Field>

								<Field label="单次超时（分钟，0 = 用默认值）">
									<input
										type="number"
										min={0}
										value={timeoutMinutes}
										onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
										className={inputCls}
									/>
								</Field>

								<label className="flex items-start gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={failover}
										onChange={(e) => setFailover(e.target.checked)}
										className="mt-1 accent-terracotta"
									/>
									<span className="min-w-0">
										<span className="block text-xs text-text-secondary">
											连续失败后换一个入口继续
										</span>
										<span className="block text-2xs text-text-light leading-relaxed mt-0.5">
											按设置里「代码改写」能力的路由顺序，挑一个已安装且未被限额的
											CLI 接手。换入口后会重新发起，不能续接原会话。
										</span>
									</span>
								</label>

								<Field label="错过触发时刻（应用没开 / 机器睡着）">
									<div className="flex gap-1.5">
										{(
											[
												["skip", "跳过，等下一次"],
												["runOnce", "补跑一次"],
											] as const
										).map(([value, label]) => (
											<button
												key={value}
												type="button"
												onClick={() => setMisfire(value)}
												className={cn(
													"flex-1 px-2 py-1.5 rounded-lg text-xs transition duration-150 border",
													misfire === value
														? "border-terracotta/40 bg-terracotta/[0.1] text-terracotta"
														: "border-border text-text-muted hover:text-text-secondary",
												)}
											>
												{label}
											</button>
										))}
									</div>
								</Field>
							</div>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2 px-4 py-3 border-t border-border/60 shrink-0">
					<button
						type="button"
						onClick={onClose}
						className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary transition duration-150"
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => void submit()}
						disabled={saving || !cliHarnesses.length}
						className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition duration-150"
					>
						{saving ? "保存中…" : job ? "保存修改" : "创建任务"}
					</button>
				</div>
			</div>
		</div>
	);
}

// 输入框底色要和面板底色（bg-surface）拉开，否则只剩一条边框在提示"这里能输入"
const inputCls =
	"w-full px-2.5 py-1.5 text-xs bg-cream-50 dark:bg-cream-900/40 border border-border rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-150";

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<span className="block text-2xs text-text-light mb-1.5">{label}</span>
			{children}
		</div>
	);
}

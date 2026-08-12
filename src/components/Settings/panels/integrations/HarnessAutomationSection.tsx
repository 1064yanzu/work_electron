/**
 * HarnessAutomationSection — 设置面板 · AI 自动化的全局配置。
 *
 * 任务本身在 Hub 的「自动化」面板里建，这里管的是**跨任务的全局行为**：
 * 总开关、并发上限、防休眠、卡死判定阈值、失败通知。
 *
 * 三个开关值得解释清楚而不是只给个标题：
 * - 防休眠会影响电池，但夜间任务的成败常常就取决于它；
 * - 电池供电时跳过定时触发，是为了避免第二天早上电脑没电；
 * - 卡死阈值调太短会把正常的长思考误判成卡死然后重跑，白烧额度。
 */
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getHubSettings,
	saveHubSettings,
	type HarnessHubSettingsRow,
} from "../../../../lib/api/harnessBridge";
import { toast } from "../../../ui/Toast";
import { settingsAnchorProps } from "../../fieldRegistry";
import {
	SettingsCardSection,
	SettingsChipGroup,
	SettingsRow,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";

const CONCURRENCY_OPTIONS = [
	{ value: "1", label: "1 个" },
	{ value: "2", label: "2 个" },
	{ value: "3", label: "3 个" },
	{ value: "4", label: "4 个" },
];

const STALL_OPTIONS = [
	{ value: String(5 * 60_000), label: "5 分钟" },
	{ value: String(10 * 60_000), label: "10 分钟" },
	{ value: String(20 * 60_000), label: "20 分钟" },
	{ value: String(40 * 60_000), label: "40 分钟" },
];

export function HarnessAutomationSection() {
	const [settings, setSettings] = useState<HarnessHubSettingsRow | null>(null);

	const reload = useCallback(async () => {
		setSettings(await getHubSettings());
	}, []);

	useEffect(() => {
		void reload().catch((error: unknown) => {
			toast.error(
				`读取自动化配置失败：${error instanceof Error ? error.message : String(error)}`,
			);
		});
	}, [reload]);

	const patch = async (next: Partial<HarnessHubSettingsRow>) => {
		try {
			setSettings(await saveHubSettings(next));
		} catch (error) {
			toast.error(
				`保存失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	if (!settings) {
		return (
			<div className="flex items-center gap-2 py-8 text-[12.5px] text-text-light">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				正在读取自动化配置…
			</div>
		);
	}

	return (
		<>
			<div {...settingsAnchorProps("integrations.harnessHub.automation")}>
				<SettingsCardSection
					title="定时任务"
					description="让 AI 在你不在的时候把活干了：到点自动起一个 CLI 跑写好的指令，中途遇到限流、上游 5xx、连接中断会自己等、自己接着上次的进度续跑。任务在 Hub 的「自动化」面板里创建。"
				>
					<SettingsRow
						label="启用定时触发"
						description="关闭后已有任务不再自动触发，但仍可在 Hub 里手动运行。"
						action={
							<SettingsSwitch
								checked={settings.automation_enabled}
								onChange={(next) => void patch({ automation_enabled: next })}
							/>
						}
					/>
					<SettingsRow
						label="同时最多跑几个"
						description="超出的任务排队等待。跑得再多也只是几个 agent 互相抢 CPU 和额度，不会更快。"
						action={
							<SettingsChipGroup
								size="sm"
								value={String(settings.automation_max_concurrent)}
								options={CONCURRENCY_OPTIONS}
								onChange={(value) =>
									void patch({ automation_max_concurrent: Number(value) })
								}
							/>
						}
					/>
					<SettingsRow
						label="任务运行时阻止系统休眠"
						description="定了凌晨两点的任务、机器一点半睡了，什么都不会发生。开启后有任务在跑时会阻止系统挂起应用——会更费电，任务全部结束后自动解除。"
						action={
							<SettingsSwitch
								checked={settings.automation_prevent_sleep}
								onChange={(next) =>
									void patch({ automation_prevent_sleep: next })
								}
							/>
						}
					/>
					<SettingsRow
						label="电池供电时跳过定时触发"
						description="夜间任务动辄跑几十分钟，不插电跑完多半意味着第二天开不了机。手动运行不受此限制。"
						action={
							<SettingsSwitch
								checked={settings.automation_skip_on_battery}
								onChange={(next) =>
									void patch({ automation_skip_on_battery: next })
								}
							/>
						}
					/>
				</SettingsCardSection>
			</div>

			<div {...settingsAnchorProps("integrations.harnessHub.automationRetry")}>
				<SettingsCardSection
					title="失败处理"
					description="自动化只判定错误信号（429、5xx、连接中断、卡死等），不判定任务本身有没有做完——跑完一轮没有出现可识别的错误就算这轮结束。鉴权失败、余额耗尽这类重试解决不了的问题会直接停下等你处理。"
				>
					<SettingsRow
						label="多久没有输出算卡死"
						description="超过这个时长没有任何输出且不是在等你输入，就中止并重试。调太短会把正常的长思考误判成卡死，白白重跑一遍。"
						action={
							<SettingsChipGroup
								size="sm"
								value={String(settings.automation_stalled_threshold_ms)}
								options={STALL_OPTIONS}
								onChange={(value) =>
									void patch({
										automation_stalled_threshold_ms: Number(value),
									})
								}
							/>
						}
					/>
					<SettingsRow
						label="新建任务默认重试次数"
						description="每个任务可以单独覆盖。重试会尽量接着上次的会话续跑，而不是从头重来。"
						action={
							<AttemptsInput
								value={settings.automation_default_max_attempts}
								onCommit={(n) =>
									void patch({ automation_default_max_attempts: n })
								}
							/>
						}
					/>
					<SettingsRow
						label="失败时发系统通知"
						description="任务重试用尽或遇到需要人工处理的问题时提醒你——夜里跑挂了，第二天总得有人知道。"
						action={
							<SettingsSwitch
								checked={settings.automation_notify_on_failure}
								onChange={(next) =>
									void patch({ automation_notify_on_failure: next })
								}
							/>
						}
					/>
				</SettingsCardSection>
			</div>
		</>
	);
}

function AttemptsInput({
	value,
	onCommit,
}: {
	value: number;
	onCommit: (n: number) => void;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	return (
		<div className="flex items-center gap-1.5">
			<input
				type="number"
				min={1}
				max={50}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onBlur={() => {
					const n = Number(text);
					if (!Number.isFinite(n) || n < 1) {
						setText(String(value));
						return;
					}
					onCommit(Math.round(Math.min(50, n)));
				}}
				className="w-[72px] rounded-lg border border-border bg-surface px-2.5 py-1 text-right text-[12.5px] tabular-nums text-text-secondary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/8 dark:bg-cream-900/40"
			/>
			<span className="text-[12px] text-text-light">次</span>
		</div>
	);
}

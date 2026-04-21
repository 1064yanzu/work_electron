/**
 * 渠道能力开关区块 —— 在各渠道卡片内复用。
 *
 * 覆盖阶段 3 开放的五项 features：
 *   - streaming.mode（off / edit / card）
 *   - typing.enabled
 *   - interactive.enabled
 *   - dedupe.persistent
 *   - sequential_delivery
 *
 * card 模式仅飞书渠道允许，其它渠道会隐藏该选项。
 */

import {
	CircleDot,
	MessageSquareDot,
	MousePointerClick,
	Redo2,
	Shield,
} from "lucide-react";
import type { ReactNode } from "react";
import { Select } from "../../../ui/Select";
import {
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import type { RemoteChannelFeatureConfig } from "../../../../lib/api";

export const DEFAULT_CHANNEL_FEATURES: RemoteChannelFeatureConfig = {
	streaming: { mode: "edit" },
	typing: { enabled: true },
	interactive: { enabled: true },
	dedupe: { persistent: true },
	sequential_delivery: true,
};

export const DEFAULT_FEISHU_FEATURES: RemoteChannelFeatureConfig = {
	...DEFAULT_CHANNEL_FEATURES,
	streaming: { mode: "card" },
};

type ChannelFeatureTogglesProps = {
	/** 当前值；为空时按 fallback 回显 */
	value: RemoteChannelFeatureConfig | undefined;
	/** 回调：接受新值 */
	onChange: (next: RemoteChannelFeatureConfig) => void;
	/** 是否允许 card 模式（仅飞书） */
	allowCardStreaming?: boolean;
	/** 禁用所有开关 */
	disabled?: boolean;
	/** 回填默认值 */
	fallback?: RemoteChannelFeatureConfig;
};

function renderRow(
	icon: ReactNode,
	title: string,
	subtitle: string,
	control: ReactNode,
) {
	return (
		<div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
			<div className="flex items-start gap-3 min-w-0">
				<div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
					{icon}
				</div>
				<div className="min-w-0">
					<div className="text-sm font-medium text-text-primary">{title}</div>
					<div className="mt-0.5 text-xs text-text-secondary leading-relaxed">
						{subtitle}
					</div>
				</div>
			</div>
			<div className="flex-shrink-0 self-center">{control}</div>
		</div>
	);
}

export function ChannelFeatureToggles({
	value,
	onChange,
	allowCardStreaming = false,
	disabled = false,
	fallback = DEFAULT_CHANNEL_FEATURES,
}: ChannelFeatureTogglesProps) {
	const effective: RemoteChannelFeatureConfig = value ?? fallback;

	const patch = (next: Partial<RemoteChannelFeatureConfig>) => {
		onChange({
			...effective,
			...next,
		});
	};

	const streamingOptions = [
		{ label: "关闭（整段输出）", value: "off" as const },
		{ label: "Edit 流式（编辑消息）", value: "edit" as const },
		...(allowCardStreaming
			? [{ label: "CardKit 卡片流式", value: "card" as const }]
			: []),
	];

	return (
		<div className="space-y-3 rounded-2xl border border-zinc-200/70 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
			<div>
				<SettingsSectionTitle className="mb-0.5 text-base">
					能力开关
				</SettingsSectionTitle>
				<p className="text-xs text-text-secondary">
					控制本渠道的 streaming / typing / 按钮 / 去重等运行时行为。
				</p>
			</div>

			<div className="grid grid-cols-1 gap-2.5">
				{renderRow(
					<CircleDot className="h-4 w-4" />,
					"流式输出模式",
					"off：Agent 一次性整段发出；edit：通过编辑首条消息逐帧追加；card：飞书 CardKit 卡片",
					<Select
						value={effective.streaming.mode}
						onChange={(e) => {
							patch({
								streaming: {
									mode: e.target
										.value as RemoteChannelFeatureConfig["streaming"]["mode"],
								},
							});
						}}
						options={streamingOptions}
						disabled={disabled}
					/>,
				)}

				{renderRow(
					<MessageSquareDot className="h-4 w-4" />,
					"Typing 指示",
					"Agent 响应期间向对方显示正在输入",
					<SettingsSwitch
						checked={effective.typing.enabled}
						onChange={(next) => {
							patch({ typing: { enabled: next } });
						}}
						disabled={disabled}
					/>,
				)}

				{renderRow(
					<MousePointerClick className="h-4 w-4" />,
					"交互按钮",
					"审批场景使用按钮/菜单组件（关闭后回退到文本命令）",
					<SettingsSwitch
						checked={effective.interactive.enabled}
						onChange={(next) => {
							patch({ interactive: { enabled: next } });
						}}
						disabled={disabled}
					/>,
				)}

				{renderRow(
					<Shield className="h-4 w-4" />,
					"持久化去重",
					"跨进程重启的 24h 消息去重（位于 userData/remote-control/dedupe）",
					<SettingsSwitch
						checked={effective.dedupe.persistent}
						onChange={(next) => {
							patch({ dedupe: { persistent: next } });
						}}
						disabled={disabled}
					/>,
				)}

				{renderRow(
					<Redo2 className="h-4 w-4" />,
					"顺序投递",
					"同一会话内出站消息严格按接收顺序发出（避免乱序 reply）",
					<SettingsSwitch
						checked={effective.sequential_delivery}
						onChange={(next) => {
							patch({ sequential_delivery: next });
						}}
						disabled={disabled}
					/>,
				)}
			</div>
		</div>
	);
}

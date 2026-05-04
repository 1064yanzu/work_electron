/**
 * 渠道能力矩阵 —— 横向一览 6 个渠道在 10 项能力上的覆盖度。
 * 数据来源：list_remote_channel_capabilities IPC，基于后端 channelCapabilityRegistry。
 *
 * 用途：
 *   - 让用户一眼看清每个渠道当前支持什么
 *   - Agent 调度时「某渠道不支持」的可视化参考
 */

import { Check, CircleAlert, Minus, RefreshCw, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../ui/Button";
import { toast } from "../../../ui/Toast";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";
import {
	listRemoteChannelCapabilities,
	type RemoteChannelCapabilities,
	type RemoteChannelCapabilityEntry,
} from "../../../../lib/api";

const CAPABILITY_COLUMNS: {
	key: keyof RemoteChannelCapabilities;
	label: string;
	hint: string;
}[] = [
	{ key: "text", label: "文本", hint: "纯文本收发" },
	{ key: "card", label: "富卡片", hint: "飞书/Slack BlockKit/Discord Embed" },
	{ key: "streaming", label: "流式", hint: "Agent 输出逐帧更新" },
	{ key: "typing", label: "Typing", hint: "响应期间显示输入中" },
	{ key: "interactive", label: "交互按钮", hint: "审批按钮/菜单" },
	{ key: "editMessage", label: "编辑", hint: "编辑已发消息" },
	{ key: "reactions", label: "表情", hint: "表情反应" },
	{ key: "pin", label: "置顶", hint: "置顶消息" },
	{ key: "media", label: "媒体", hint: "图片/文件" },
	{ key: "deleteMessage", label: "删除", hint: "删除已发消息" },
];

function StatusBadge({
	status,
}: {
	status: RemoteChannelCapabilityEntry["status"];
}) {
	switch (status) {
		case "sdk":
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-mint-500/15 px-2 py-0.5 text-[11px] font-medium text-mint-600">
					<Check className="h-3 w-3" strokeWidth={1.5} />
					SDK
				</span>
			);
		case "legacy":
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
					<Wrench className="h-3 w-3" strokeWidth={1.5} />
					Legacy
				</span>
			);
		default:
			return (
				<span className="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2 py-0.5 text-[11px] font-medium text-text-muted">
					<CircleAlert className="h-3 w-3" strokeWidth={1.5} />
					Placeholder
				</span>
			);
	}
}

function CapabilityCell({ value }: { value: boolean }) {
	if (value) {
		return (
			<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-mint-500/15 text-mint-600">
				<Check className="h-3.5 w-3.5" strokeWidth={1.5} />
			</span>
		);
	}
	return (
		<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-warm-300/60 text-text-light">
			<Minus className="h-3.5 w-3.5" />
		</span>
	);
}

export function ChannelCapabilityMatrix() {
	const [loading, setLoading] = useState(true);
	const [entries, setEntries] = useState<RemoteChannelCapabilityEntry[]>([]);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const list = await listRemoteChannelCapabilities();
			setEntries(list);
		} catch (error) {
			toast.error(
				`加载能力矩阵失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	return (
		<SettingsSectionCard className="p-5 space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<SettingsSectionTitle className="mb-1">能力矩阵</SettingsSectionTitle>
					<p className="text-sm text-text-secondary">
						各渠道当前支持能力一览。
						<span className="text-mint-600 font-medium">SDK</span>
						：已迁移到新 ChannelPluginSDK；
						<span className="text-peach-500 font-medium"> Legacy</span>
						：未迁移但运行良好；
						<span className="text-text-muted font-medium"> Placeholder</span>
						：占位，尚未实装。
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					loading={loading}
					onClick={() => void reload()}
				>
					<RefreshCw className="h-3.5 w-3.5" />
					刷新
				</Button>
			</div>

			<div className="overflow-x-auto rounded-2xl border border-border/70 bg-surface">
				<table className="min-w-full text-sm">
					<thead>
						<tr className="border-b border-border/60 bg-warm-50/60 text-xs uppercase tracking-wider text-text-muted/60">
							<th className="sticky left-0 z-10 bg-warm-50/60 px-4 py-3 text-left font-medium/60">
								渠道
							</th>
							<th className="px-3 py-3 text-left font-medium">状态</th>
							{CAPABILITY_COLUMNS.map((col) => (
								<th
									key={col.key}
									className="px-3 py-3 text-center font-medium whitespace-nowrap"
									title={col.hint}
								>
									{col.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{entries.length === 0 && !loading ? (
							<tr>
								<td
									colSpan={CAPABILITY_COLUMNS.length + 2}
									className="px-4 py-10 text-center text-text-muted"
								>
									暂无数据
								</td>
							</tr>
						) : null}
						{entries.map((entry) => (
							<tr
								key={entry.channel}
								className="border-b border-border last:border-b-0/80"
							>
								<td className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium text-text-primary whitespace-nowrap">
									{entry.label}
								</td>
								<td className="px-3 py-3">
									<StatusBadge status={entry.status} />
								</td>
								{CAPABILITY_COLUMNS.map((col) => (
									<td key={col.key} className="px-3 py-3 text-center">
										<CapabilityCell value={entry.capabilities[col.key]} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</SettingsSectionCard>
	);
}

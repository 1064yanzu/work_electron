// 数据概览 — 资料/笔记数 + 输出文稿数 + 总占用
//
// 从 DataSettings 主文件抽出的纯展示组件。
//
// 三张卡片依次弹入，数值从 0 滚上来。这里适合做数字补间是因为**数据只加载一次**：
// 打开面板 → 一次 IPC → 一次定值。流式变化的计数器（比如对话里的 token 统计）
// 不能这么做——每来一个新值就重启一次 0.7s 补间，屏幕上显示的永远是滞后值。

import { useRef } from "react";

import { countTo, EASE, useGsapMotion } from "../../../../lib/motion";
import type { DataStats } from "../../../../lib/api";
import { SettingsCardSection } from "../../ui/SettingsPrimitives";

interface DataOverviewProps {
	dataStats: DataStats;
	formatSize: (bytes: number) => string;
}

export function DataOverview({ dataStats, formatSize }: DataOverviewProps) {
	const scopeRef = useRef<HTMLDivElement>(null);

	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const scope = scopeRef.current;
			if (!scope) return;
			gsap.from(scope.querySelectorAll("[data-stat-card]"), {
				opacity: 0,
				y: amp(12),
				scale: 0.96,
				duration: dur(0.42),
				ease: EASE.spring,
				stagger: expressive ? 0.06 : 0,
				clearProps: "transform,opacity",
			});
		},
		{ dependencies: [] },
	);

	return (
		<SettingsCardSection title="数据概览" bodyClassName="p-5">
			<div ref={scopeRef} className="divide-y divide-border/60">
				<StatRow
					value={(dataStats.sources_count ?? 0) + (dataStats.notes_count ?? 0)}
					label="资料与笔记"
				/>
				<StatRow value={dataStats.outputs_count ?? 0} label="输出文稿" />
				<StatRow
					value={formatSize(
						(dataStats.database_size ?? 0) + (dataStats.media_size ?? 0),
					)}
					label="总占用"
				/>
			</div>
		</SettingsCardSection>
	);
}

// 紧凑键值行:label 左、数值右,替代大数字统计卡;保留数字滚动补间
function StatRow({ value, label }: { value: string | number; label: string }) {
	const valueRef = useRef<HTMLSpanElement>(null);

	// 只有纯数字才滚；"总占用"是带单位的字符串，滚起来单位会跟着乱跳
	useGsapMotion(
		() => {
			if (typeof value !== "number" || value <= 0) return;
			const tween = countTo(valueRef.current, 0, value, {
				format: (v) => String(Math.round(v)),
			});
			return () => tween?.kill();
		},
		{ dependencies: [value] },
	);

	return (
		<div data-stat-card className="flex items-center justify-between py-2">
			<span className="text-xs text-text-secondary">{label}</span>
			<span
				ref={valueRef}
				className="tabular-nums text-sm font-medium text-text-primary"
			>
				{value}
			</span>
		</div>
	);
}

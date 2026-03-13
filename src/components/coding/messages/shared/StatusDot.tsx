/**
 * 共享状态指示器 - 工具调用执行状态圆点
 */
import type { SessionToolCall } from "../../../../lib/stores/codingSessionTypes";

interface StatusDotProps {
	status: SessionToolCall["status"];
	size?: "sm" | "md";
}

export function StatusDot({ status, size = "sm" }: StatusDotProps) {
	const sizeClass = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";

	if (status === "running") {
		return (
			<div
				className={`${sizeClass} rounded-full bg-[#D96C46] animate-pulse shrink-0`}
			/>
		);
	}
	if (status === "completed") {
		return (
			<div className={`${sizeClass} rounded-full bg-emerald-500 shrink-0`} />
		);
	}
	if (status === "error") {
		return (
			<div className={`${sizeClass} rounded-full bg-red-500 shrink-0`} />
		);
	}
	return (
		<div className={`${sizeClass} rounded-full bg-zinc-300 shrink-0`} />
	);
}

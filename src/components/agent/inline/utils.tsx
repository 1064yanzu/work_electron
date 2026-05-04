// AgentTraceInline 的小工具函数 — 从巨石中拆出来便于复用与单独测试

import {
	BookOpen,
	CheckCircle2,
	Clock,
	FolderOpen,
	Globe,
	Loader2,
	MessageSquare,
	Search,
	Wrench,
	XCircle,
} from "lucide-react";
import type React from "react";
import {
	TOOL_ICONS,
	type ToolCall,
	type ToolType,
} from "../../../lib/agent/types";

const ToolIconMap: Record<string, React.ElementType> = {
	Search,
	BookOpen,
	Globe,
	FolderOpen,
	MessageSquare,
	Wrench,
};

export function getToolIcon(type: ToolType): React.ElementType {
	const iconName = TOOL_ICONS[type];
	return ToolIconMap[iconName] || Wrench;
}

export function ToolStatusIcon({ status }: { status: ToolCall["status"] }) {
	switch (status) {
		case "running":
			return <Loader2 className="w-3.5 h-3.5 animate-spin text-focus" />;
		case "completed":
			return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
		case "error":
			return <XCircle className="w-3.5 h-3.5 text-error" />;
		default:
			return <Clock className="w-3.5 h-3.5 text-text-light" />;
	}
}

export function formatDurationMs(ms?: number): string {
	if (!ms || ms <= 0) return "";
	return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * ToolCallsGroup - 简化的工具调用组
 * 
 * 直接渲染工具调用列表,不添加额外包装
 */

import { useMemo } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import ToolCallInline from "../agent/ToolCallInline";
import { SkillCard } from "../agent/SkillCard";

export type ToolCallRef = {
	taskId: string;
	toolCallId: string;
	name?: string;
	status?: ToolCall["status"];
	input?: any;
	output?: any;
	error?: string;
};

export function ToolCallsGroup({ calls }: { calls: ToolCallRef[] }) {
	const { currentTask, taskHistory } = useAgentStore();

	const uniqueCalls = useMemo(() => {
		const seen = new Set<string>();
		const out: ToolCallRef[] = [];
		for (const c of calls) {
			const key = `${c.taskId}:${c.toolCallId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(c);
		}
		return out;
	}, [calls]);

	const resolved = useMemo(() => {
		const tasksById = new Map<string, typeof currentTask | null>();
		if (currentTask) tasksById.set(currentTask.id, currentTask);
		for (const t of taskHistory) tasksById.set(t.id, t);

		const resolvedCalls: ToolCall[] = [];
		const resolvedByKey = new Map<string, ToolCall>();
		for (const ref of uniqueCalls) {
			const task = tasksById.get(ref.taskId) || null;
			const tc = task?.toolCalls.find((x) => x.id === ref.toolCallId) || null;
			if (tc) {
				resolvedCalls.push(tc);
				resolvedByKey.set(`${ref.taskId}:${ref.toolCallId}`, tc);
			}
		}
		return { resolvedCalls, resolvedByKey };
	}, [uniqueCalls, currentTask, taskHistory]);

	// 特殊处理:单个 Skill 调用显示 SkillCard
	if (
		resolved.resolvedCalls.length === 1 &&
		resolved.resolvedCalls[0].type === "skill_call"
	) {
		const skillExecution = resolved.resolvedCalls[0].metadata?.skillExecution;
		if (skillExecution) {
			return (
				<div className="my-1">
					<SkillCard skill={skillExecution} compact />
				</div>
			);
		}
	}

	// 直接渲染工具调用列表
	return (
		<div className="space-y-0.5">
			{uniqueCalls.map((c) => {
				const resolvedCall = resolved.resolvedByKey.get(
					`${c.taskId}:${c.toolCallId}`,
				);
				
				if (resolvedCall) {
					return (
						<ToolCallInline
							key={`${c.taskId}:${c.toolCallId}`}
							taskId={c.taskId}
							toolCallId={c.toolCallId}
						/>
					);
				}

				// Fallback: 从持久化数据构造
				const fallbackData: ToolCall | undefined = c.name
					? {
							id: c.toolCallId,
							type: (c.name as any) || "custom",
							name: c.name,
							status: c.status || "pending",
							input: c.input || {},
							output: c.output,
							error: c.error,
						}
					: undefined;

				if (fallbackData) {
					return (
						<ToolCallInline
							key={`${c.taskId}:${c.toolCallId}`}
							taskId={c.taskId}
							toolCallId={c.toolCallId}
							initialData={fallbackData}
						/>
					);
				}

				return null;
			})}
		</div>
	);
}

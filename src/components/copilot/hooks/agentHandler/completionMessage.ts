import type { agentStore } from "@/lib/agent/store";
import type { parseDocProtocolFinal } from "@/lib/chat/docProtocol";
import { createMessage } from "@/lib/chat/types";

export function buildCompletionAssistantMessage(input: {
	result: string;
	protocol: ReturnType<typeof parseDocProtocolFinal>;
	activeModel: string | null;
	inlineTraceEnabled: boolean;
	currentTaskId: string | null;
	finalState: ReturnType<typeof agentStore.getState>;
	currentSkill: ReturnType<typeof agentStore.getState>["currentSkill"];
}): ReturnType<typeof createMessage> {
	const {
		result,
		protocol,
		activeModel,
		inlineTraceEnabled,
		currentTaskId,
		finalState,
		currentSkill,
	} = input;

	const assistantMessage = createMessage("assistant", result, {
		isStreaming: false,
		model: activeModel ?? undefined,
		metadata:
			protocol.kind === "create" || protocol.kind === "update"
				? { fileUpdates: [protocol.fileUpdate] }
				: undefined,
	});

	const finalSkillState = currentSkill;
	const skillBlocks = finalSkillState
		? [
				{
					type: "skill_execution" as const,
					skillName: finalSkillState.skillName,
					skillPath: finalSkillState.skillPath,
					status: finalSkillState.status,
					steps: finalSkillState.steps,
					loadedFiles: finalSkillState.loadedFiles,
					detectedScene: finalSkillState.detectedScene,
				},
			]
		: [];

	const baseBlocks: any[] = [
		...(assistantMessage.content.trim()
			? [{ type: "text" as const, text: assistantMessage.content }]
			: []),
		...skillBlocks,
	];

	// 成功时也把工具调用轨迹挂到消息 blocks，方便用户端直接看到 code_execute 等执行情况
	if (currentTaskId) {
		const toolCalls = finalState.currentTask?.toolCalls || [];
		const toolCallBlocks = toolCalls.map((tc) => ({
			type: "tool_call" as const,
			taskId: currentTaskId,
			toolCallId: tc.id,
			name: tc.name,
			status: tc.status,
		}));

		const imageBlocks = toolCalls
			.flatMap((tc) => {
				const output = tc.output as any;
				const paths = Array.isArray(output?.image_paths)
					? (output.image_paths as string[])
					: [];
				return paths
					.filter(
						(p) =>
							typeof p === "string" &&
							p.trim().length > 0 &&
							!p.trim().startsWith("data:image/") &&
							!p.trim().startsWith("http://") &&
							!p.trim().startsWith("https://"),
					)
					.map((p) => ({
						type: "image" as const,
						path: p,
						title: tc.name || "图片",
					}));
			})
			.filter((b) => !!b.path);

		// 去重，避免多次收集同一张图
		const uniqueImageBlocks: typeof imageBlocks = [];
		const seenImg = new Set<string>();
		for (const b of imageBlocks) {
			if (seenImg.has(b.path)) continue;
			seenImg.add(b.path);
			uniqueImageBlocks.push(b);
		}
		const fileUpdateBlocks = Array.isArray(
			(assistantMessage.metadata as any)?.fileUpdates,
		)
			? (assistantMessage.metadata as any).fileUpdates.map((update: any) => ({
					type: "file_update" as const,
					update,
				}))
			: [];
		assistantMessage.metadata = {
			...(assistantMessage.metadata || {}),
			...(inlineTraceEnabled
				? {}
				: { trace: { type: "agent_task", taskId: currentTaskId } }),
			blocks: [
				...baseBlocks,
				...uniqueImageBlocks,
				...(inlineTraceEnabled ? [] : toolCallBlocks),
				...fileUpdateBlocks,
			],
		};
	} else if (baseBlocks.length > 0) {
		assistantMessage.metadata = {
			...(assistantMessage.metadata || {}),
			blocks: baseBlocks,
		};
	}

	return assistantMessage;
}

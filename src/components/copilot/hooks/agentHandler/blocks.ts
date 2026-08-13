import { agentStore } from "@/lib/agent/store";
import {
	isTextCoveredByFinalText,
	joinTextBlocks,
} from "@/lib/chat/blockTextMerge";
import type { parseDocProtocolFinal } from "@/lib/chat/docProtocol";
import type { StreamBlocksBuilder } from "@/lib/chat/streamBlocksBuilder";
import {
	getTaskImageArtifactPaths,
	normalizeRuntimeText,
	replaceDataImageMarkdownWithPaths,
} from "@/lib/chat/streamHelpers";
import type { ChatMessageBlock } from "@/lib/chat/types";

export interface SkillBlockHolder {
	current: ChatMessageBlock | null;
}

export interface AgentBlocksDeps {
	streamBuilder: StreamBlocksBuilder;
	getCurrentTaskId: () => string | null;
	lastSkillBlockHolder: SkillBlockHolder;
}

export function buildAgentSkillBlocks(
	deps: AgentBlocksDeps,
): ChatMessageBlock[] {
	const { streamBuilder, lastSkillBlockHolder } = deps;
	const currentTaskId = deps.getCurrentTaskId();
	const blocks: ChatMessageBlock[] = streamBuilder.getBlocks();

	// 如果任务步骤（TodoWrite）已生成，用专门的 task_list 卡片承接
	if (currentTaskId) {
		const task = agentStore.getState().currentTask;
		const todos = task?.metadata ? (task.metadata as any).todos : undefined;
		const hasTodos = Array.isArray(todos) && todos.length > 0;
		if (hasTodos) {
			blocks.unshift({ type: "task_list", taskId: currentTaskId } as any);
		}
	}

	const currentSkill = agentStore.getState().currentSkill;
	if (currentSkill) {
		const skillBlock = {
			type: "skill_execution",
			skillName: currentSkill.skillName,
			skillPath: currentSkill.skillPath,
			status: currentSkill.status,
			steps: currentSkill.steps,
			loadedFiles: currentSkill.loadedFiles,
			detectedScene: currentSkill.detectedScene,
		} as any;
		lastSkillBlockHolder.current = skillBlock;
		blocks.push(skillBlock);
	}

	return blocks;
}

export function buildAgentFinalBlocks(
	finalText: string,
	protocol: ReturnType<typeof parseDocProtocolFinal>,
	deps: AgentBlocksDeps,
): ChatMessageBlock[] {
	const { streamBuilder, lastSkillBlockHolder } = deps;
	const currentTaskId = deps.getCurrentTaskId();
	const taskImagePaths = getTaskImageArtifactPaths(
		agentStore.getState().currentTask?.artifacts,
	);
	const blocks: ChatMessageBlock[] = streamBuilder.getBlocks().map((b) => {
		if (b.type !== "text") return b;
		return {
			type: "text",
			text: replaceDataImageMarkdownWithPaths(
				normalizeRuntimeText(b.text),
				taskImagePaths,
			),
		} as const;
	});

	// Keep Todo list card after completion
	if (currentTaskId) {
		const task = agentStore.getState().currentTask;
		const todos = task?.metadata ? (task.metadata as any).todos : undefined;
		const hasTodos = Array.isArray(todos) && todos.length > 0;
		if (hasTodos) {
			blocks.unshift({ type: "task_list", taskId: currentTaskId } as any);
		}
	}

	if (protocol.kind === "create" || protocol.kind === "update") {
		blocks.push({
			type: "file_update",
			update: protocol.fileUpdate,
		} as any);
	}

	// Prefer last seen skill block to avoid it disappearing after completion
	const currentSkill = agentStore.getState().currentSkill;
	if (currentSkill) {
		lastSkillBlockHolder.current = {
			type: "skill_execution",
			skillName: currentSkill.skillName,
			skillPath: currentSkill.skillPath,
			status: currentSkill.status,
			steps: currentSkill.steps,
			loadedFiles: currentSkill.loadedFiles,
			detectedScene: currentSkill.detectedScene,
		} as any;
	}
	if (lastSkillBlockHolder.current) blocks.push(lastSkillBlockHolder.current);

	const normalizedFinal = replaceDataImageMarkdownWithPaths(
		normalizeRuntimeText(finalText),
		taskImagePaths,
	);
	const existingText = joinTextBlocks(blocks);
	if (
		normalizedFinal.trim() &&
		isTextCoveredByFinalText(existingText, normalizedFinal)
	) {
		// 已流式输出的文本与工具卡片有时序对应关系；最终快照覆盖它时只去重，不重排。
	} else if (
		normalizedFinal.trim() &&
		normalizedFinal.trim() !== existingText.trim()
	) {
		blocks.push({ type: "text", text: normalizedFinal } as any);
	}

	// 将任务里的图片产物回填到消息 blocks，确保图片消息与中间栏产物保持一致
	const hasImageMarkdownInText =
		/!\[[^\]]*]\((?!data:)[^)]+\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|tif|tiff)(\?[^)]*)?\)/i.test(
			normalizedFinal,
		);
	if (currentTaskId && !hasImageMarkdownInText) {
		const task = agentStore.getState().currentTask;
		const existingImagePaths = new Set(
			blocks
				.filter(
					(b): b is Extract<ChatMessageBlock, { type: "image" }> =>
						b.type === "image",
				)
				.map((b) => String(b.path || "").trim()),
		);
		const imageBlocks =
			task?.artifacts
				?.filter(
					(a) =>
						a.type === "image" &&
						typeof a.url === "string" &&
						a.url.trim().length > 0 &&
						!a.url.trim().startsWith("data:image/") &&
						!a.url.trim().startsWith("http://") &&
						!a.url.trim().startsWith("https://"),
				)
				.map((a) => ({
					type: "image" as const,
					path: String(a.url),
					title: a.title || "图片",
				}))
				.filter((b) => {
					const p = String(b.path || "").trim();
					if (!p) return false;
					if (existingImagePaths.has(p)) return false;
					existingImagePaths.add(p);
					return true;
				}) || [];

		blocks.push(...imageBlocks);
	}

	return blocks;
}

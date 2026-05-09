// useDiffCapture - 监听 Agent 工具调用，自动捕获文件 Diff 数据
// 当 Edit/Write 工具完成时，提取前后内容并创建 diff 记录

import { useEffect, useRef } from "react";
import { agentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { type FileDiff, diffStore } from "../../lib/stores/diffStore";
import { inferLanguage } from "../../lib/utils/diffUtils";

type FileSnapshot = {
	existed: boolean;
	content: string;
};

/**
 * 判断是否为文件写入/编辑类的工具调用
 */
function isFileWriteToolCall(toolCall: ToolCall): boolean {
	const name = (toolCall.name || "").toLowerCase();
	const type = toolCall.type;
	return (
		name.includes("write") ||
		name.includes("edit") ||
		name.includes("patch") ||
		type === "file_write" ||
		type === "doc_update" ||
		type === "doc_patch"
	);
}

/**
 * 从工具调用中提取文件路径
 */
function extractFilePath(toolCall: ToolCall): string {
	const input = toolCall.input || {};
	return String(input.file_path || input.path || input.file || "").trim();
}

/**
 * 从 Edit 类工具中提取 old_string 和 new_string
 */
function extractEditStrings(
	toolCall: ToolCall,
): { oldString: string; newString: string } | null {
	const input = toolCall.input || {};
	const oldString = input.old_string || input.oldString;
	const newString = input.new_string || input.newString;
	if (typeof oldString === "string" && typeof newString === "string") {
		return { oldString, newString };
	}
	return null;
}

/**
 * 从 Write 类工具中提取写入内容
 */
function extractWriteContent(toolCall: ToolCall): string | null {
	const input = toolCall.input || {};
	const content = input.content;
	if (typeof content === "string") return content;
	return null;
}

/**
 * 尝试通过 Electron IPC 读取文件内容
 */
async function readFileContent(filePath: string): Promise<string | null> {
	try {
		const content = await (window as any).electronAPI?.invoke(
			"read_file_utf8",
			{
				path: filePath,
			},
		);
		return typeof content === "string" ? content : null;
	} catch {
		return null;
	}
}

async function readFileSnapshot(filePath: string): Promise<FileSnapshot> {
	const content = await readFileContent(filePath);
	return {
		existed: content !== null,
		content: content ?? "",
	};
}

/**
 * Hook：监听 Agent store 工具调用变化，自动为文件操作创建 diff 记录
 */
export function useDiffCapture() {
	// 已处理的工具调用 ID 集合
	const processedIds = useRef(new Set<string>());
	const beforeSnapshots = useRef(new Map<string, FileSnapshot>());
	const beforeSnapshotPromises = useRef(
		new Map<string, Promise<FileSnapshot>>(),
	);

	useEffect(() => {
		const unsubscribe = agentStore.onEvent(async (event) => {
			if (event.type === "task_started") {
				processedIds.current.clear();
				beforeSnapshots.current.clear();
				beforeSnapshotPromises.current.clear();
				diffStore.clearDiffs();
				return;
			}

			if (
				event.type === "tool_started" ||
				event.type === "tool_input_updated"
			) {
				const toolCall = event.toolCall;
				if (!isFileWriteToolCall(toolCall)) return;
				if (
					beforeSnapshots.current.has(toolCall.id) ||
					beforeSnapshotPromises.current.has(toolCall.id)
				) {
					return;
				}
				const filePath = extractFilePath(toolCall);
				if (!filePath) return;
				const snapshotPromise = readFileSnapshot(filePath).then((snapshot) => {
					beforeSnapshots.current.set(toolCall.id, snapshot);
					beforeSnapshotPromises.current.delete(toolCall.id);
					return snapshot;
				});
				beforeSnapshotPromises.current.set(toolCall.id, snapshotPromise);
				return;
			}

			// 只在工具调用完成时处理
			if (event.type !== "tool_completed") return;

			const state = agentStore.getState();
			const toolCall = state.currentTask?.toolCalls.find(
				(tc) => tc.id === event.toolCallId,
			);

			if (!toolCall || !isFileWriteToolCall(toolCall)) return;
			if (processedIds.current.has(toolCall.id)) return;
			processedIds.current.add(toolCall.id);

			const filePath = extractFilePath(toolCall);
			if (!filePath) return;

			const name = (toolCall.name || "").toLowerCase();
			const before =
				beforeSnapshots.current.get(toolCall.id) ||
				(await beforeSnapshotPromises.current.get(toolCall.id)) ||
				(await readFileSnapshot(filePath));

			try {
				let oldContent = before.content;
				let newContent = "";

				if (name.includes("edit") || name.includes("patch")) {
					// Edit 工具完成后磁盘上已经是新内容；旧内容优先使用工具开始前快照。
					const editStrings = extractEditStrings(toolCall);
					const currentContent = await readFileContent(filePath);
					if (currentContent !== null) {
						newContent = currentContent;
					} else if (editStrings) {
						oldContent = before.existed
							? before.content
							: editStrings.oldString;
						newContent = editStrings.newString;
					}
				} else if (name.includes("write")) {
					// Write 工具：content 是新内容
					const writeContent = extractWriteContent(toolCall);
					if (writeContent !== null) {
						const currentContent = await readFileContent(filePath);
						newContent = currentContent ?? writeContent;
					}
				}

				if (before.existed && before.content === newContent) return;

				// 创建 diff 记录
				const diff: FileDiff = {
					id: `diff-${toolCall.id}`,
					filePath,
					oldContent,
					newContent,
					status: "pending",
					timestamp: Date.now(),
					toolCallId: toolCall.id,
					taskId: event.taskId,
					toolName: toolCall.name,
					language: inferLanguage(filePath),
					oldFileExisted: before.existed,
				};

				diffStore.addDiff(diff);
				beforeSnapshots.current.delete(toolCall.id);
				beforeSnapshotPromises.current.delete(toolCall.id);
			} catch (err) {
				console.warn("[useDiffCapture] 捕获 diff 失败:", err);
			}
		});

		return () => {
			unsubscribe();
		};
	}, []);

	// 当任务完成时清理已处理记录（为下一个任务做准备）
	useEffect(() => {
		const unsubscribe = agentStore.onEvent((event) => {
			if (event.type === "task_completed" || event.type === "task_error") {
				// 不清除 diff 数据（用户可能还需要查看），只清除处理记录
				processedIds.current.clear();
			}
		});

		return () => {
			unsubscribe();
		};
	}, []);
}

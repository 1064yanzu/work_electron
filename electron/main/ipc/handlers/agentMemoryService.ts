/**
 * Agent 长期记忆服务（Markdown 文件式）
 *
 * 实际实现住在 ipc/handlers/agentSdk/memoryFileStore.ts；这里仅做一层薄
 * 封装，给 handler 层和外部模块（如远控、设置面板）提供统一入口。
 *
 * 历史：本模块曾经是 SQLite 表 + 后台 LLM 自动提取的实现，已于本次重构
 * 删除全部自动提取链路；记忆写入完全由 Agent 显式调用 memory 工具触发。
 */
import {
	getMemoryStats as _getMemoryStats,
	getMemoryPreview as _getMemoryPreview,
	readFile as _readFile,
	writeFile as _writeFile,
	type MemoryFileName,
	type MemoryFileSnapshot,
} from "./agentSdk/memoryFileStore";

export type { MemoryFileName, MemoryFileSnapshot };

export async function readMemoryFile(
	name: MemoryFileName,
): Promise<MemoryFileSnapshot> {
	return _readFile(name);
}

export async function writeMemoryFile(
	name: MemoryFileName,
	content: string,
): Promise<MemoryFileSnapshot> {
	return _writeFile(name, content);
}

export async function getMemoryStats() {
	return _getMemoryStats();
}

export async function getMemoryPreview(): Promise<string> {
	return _getMemoryPreview();
}

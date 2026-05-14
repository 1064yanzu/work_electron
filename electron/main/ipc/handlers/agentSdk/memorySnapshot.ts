/**
 * Run 级冻结快照 —— 在 Agent run 启动时一次性把三件套读入内存并冻结，
 * 同一 run 的所有调用都看相同快照，避免 run 进行中条目变动导致前后不一致。
 *
 * 注入文本格式（拼到 systemPrompt.append 最前面）：
 *   === AGENT MEMORY (frozen, <runId>, <iso>) ===
 *   [SOUL]
 *   ...soul body...
 *
 *   [USER]
 *   ...user body...
 *
 *   [MEMORY]
 *   ...memory body...
 *   === END MEMORY ===
 *
 * 三个文件总注入预算 ≤ 7000 字符（≈ 2500 token）。任何文件超限以截断
 * + "… (truncated)" 兜底，避免污染 prompt。
 */
import { readFile } from "./memoryFileStore";

export interface MemorySnapshot {
	runId: string;
	frozenAt: number;
	soul: string;
	user: string;
	memory: string;
}

const TOTAL_BUDGET_CHARS = 7000;
const snapshots = new Map<string, MemorySnapshot>();

export async function loadAndFreezeMemorySnapshot(
	runId: string,
): Promise<MemorySnapshot> {
	const existing = snapshots.get(runId);
	if (existing) return existing;
	const [soul, user, memory] = await Promise.all([
		readFile("soul"),
		readFile("user"),
		readFile("memory"),
	]);
	const snapshot: MemorySnapshot = {
		runId,
		frozenAt: Date.now(),
		soul: soul.content,
		user: user.content,
		memory: memory.content,
	};
	snapshots.set(runId, snapshot);
	return snapshot;
}

export function getSnapshot(runId: string): MemorySnapshot | null {
	return snapshots.get(runId) ?? null;
}

export function releaseSnapshot(runId: string): void {
	snapshots.delete(runId);
}

export function listActiveSnapshotIds(): string[] {
	return Array.from(snapshots.keys());
}

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max).trimEnd()}\n… (truncated)`;
}

export function renderMemoryPromptSection(snapshot: MemorySnapshot): string {
	const hasAny =
		snapshot.soul.trim() || snapshot.user.trim() || snapshot.memory.trim();
	if (!hasAny) {
		return "";
	}

	// 总预算分配：SOUL 优先，然后 USER，然后 MEMORY
	let remaining = TOTAL_BUDGET_CHARS;
	const soulBody = truncate(snapshot.soul.trim(), Math.min(3000, remaining));
	remaining -= soulBody.length;
	const userBody = truncate(
		snapshot.user.trim(),
		Math.max(0, Math.min(1500, remaining)),
	);
	remaining -= userBody.length;
	const memoryBody = truncate(
		snapshot.memory.trim(),
		Math.max(0, Math.min(2400, remaining)),
	);

	const iso = new Date(snapshot.frozenAt).toISOString();
	const header = `=== AGENT MEMORY (frozen, ${snapshot.runId}, ${iso}) ===`;
	const footer = `=== END MEMORY ===`;

	const sections: string[] = [];
	sections.push(header);
	sections.push(
		"以下三段是用户长期记忆，按「灵魂 / 用户偏好 / 通用记忆」顺序排列，请严格遵守 SOUL 中的人格设定，并把 USER 与 MEMORY 视作高优先级背景知识，与当前会话冲突时以最新用户指令为准。",
	);
	if (soulBody) {
		sections.push("\n[SOUL]");
		sections.push(soulBody);
	}
	if (userBody) {
		sections.push("\n[USER]");
		sections.push(userBody);
	}
	if (memoryBody) {
		sections.push("\n[MEMORY]");
		sections.push(memoryBody);
	}
	sections.push(footer);
	return sections.join("\n");
}

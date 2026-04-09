/**
 * Diff 文件操作层
 * 将 diffStore 的状态更新与真实文件系统操作解耦
 * Accept → 写入 newContent 到磁盘 → 更新 store 状态
 * Reject → 还原 oldContent 到磁盘 → 更新 store 状态
 */

import { toast } from "../../components/ui/Toast";
import { invoke } from "../tauriCompat";
import { diffStore } from "../stores/diffStore";

/**
 * 接受单个 diff：将 newContent 写入磁盘
 */
export async function acceptDiff(diffId: string): Promise<boolean> {
	const diff = diffStore.getState().diffs[diffId];
	if (!diff || diff.status !== "pending") return false;

	try {
		const result = await invoke<{ success: boolean }>("write_file_safe", {
			path: diff.filePath,
			content: diff.newContent,
			create_dirs: !diff.oldContent, // 新建文件时自动创建目录
		});

		if (result?.success) {
			diffStore.updateDiffStatus(diffId, "accepted");
			toast.success(`文件已写入：${getFileName(diff.filePath)}`);
			return true;
		}
		toast.error("写入失败");
		return false;
	} catch (err) {
		toast.error(
			`写入失败：${err instanceof Error ? err.message : String(err)}`,
		);
		return false;
	}
}

/**
 * 拒绝单个 diff：将 oldContent 还原到磁盘，或删除新建的文件
 */
export async function rejectDiff(diffId: string): Promise<boolean> {
	const diff = diffStore.getState().diffs[diffId];
	if (!diff || diff.status !== "pending") return false;

	try {
		if (!diff.oldContent) {
			// 新建文件被拒绝 → 删除文件
			await invoke<{ success: boolean }>("delete_file_safe", {
				path: diff.filePath,
			});
		} else {
			// 已有文件被修改 → 还原 oldContent
			await invoke<{ success: boolean }>("write_file_safe", {
				path: diff.filePath,
				content: diff.oldContent,
			});
		}

		diffStore.updateDiffStatus(diffId, "rejected");
		toast.success(`文件已还原：${getFileName(diff.filePath)}`);
		return true;
	} catch (err) {
		toast.error(
			`还原失败：${err instanceof Error ? err.message : String(err)}`,
		);
		return false;
	}
}

/**
 * 批量接受所有 pending diff
 */
export async function acceptAllDiffs(): Promise<{
	accepted: number;
	failed: number;
}> {
	const diffs = Object.values(diffStore.getState().diffs).filter(
		(d) => d.status === "pending",
	);

	let accepted = 0;
	let failed = 0;

	for (const diff of diffs) {
		const ok = await acceptDiff(diff.id);
		if (ok) accepted++;
		else failed++;
	}

	if (accepted > 0 && failed === 0) {
		toast.success(`已接受全部 ${accepted} 个文件变更`);
	} else if (failed > 0) {
		toast.warning(`${accepted} 个成功，${failed} 个失败`);
	}

	return { accepted, failed };
}

/**
 * 批量拒绝所有 pending diff
 */
export async function rejectAllDiffs(): Promise<{
	rejected: number;
	failed: number;
}> {
	const diffs = Object.values(diffStore.getState().diffs).filter(
		(d) => d.status === "pending",
	);

	let rejected = 0;
	let failed = 0;

	for (const diff of diffs) {
		const ok = await rejectDiff(diff.id);
		if (ok) rejected++;
		else failed++;
	}

	if (rejected > 0 && failed === 0) {
		toast.success(`已还原全部 ${rejected} 个文件变更`);
	} else if (failed > 0) {
		toast.warning(`${rejected} 个成功，${failed} 个失败`);
	}

	return { rejected, failed };
}

// === 工具函数 ===

function getFileName(filePath: string): string {
	return filePath.split(/[\\/]/).pop() || filePath;
}

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { designFinishToThread } from "../../lib/api/design";
import { layoutStore, workspaceStore } from "../../lib/stores";
import { Button } from "../ui/Button";
import { toast } from "../ui/Toast";
import type { DesignSession } from "../../../electron/shared/types";

/**
 * 「完成设计 → 去写代码」组合操作：
 *   1. 把工作目录复制到目标线程的 designs/<session-name>/
 *   2. 切到 editor 视图，展开左栏
 *   3. 把 currentThreadPath 设到目标线程（如果用户传了新线程）
 */
interface ExitDesignButtonProps {
	session: DesignSession;
	threadPath?: string;
	threadTitle?: string;
}

export function ExitDesignButton({
	session,
	threadPath,
	threadTitle,
}: ExitDesignButtonProps) {
	const [running, setRunning] = useState(false);

	const handleClick = async () => {
		if (!threadPath) {
			toast.warning(
				"还没有选定的线程目录。请先在 Threads 里选/建一个线程，再回来完成设计。",
			);
			return;
		}
		try {
			setRunning(true);
			const result = await designFinishToThread({
				session_id: session.id,
				thread_path: threadPath,
				subfolder_name: session.title,
			});
			workspaceStore.setCurrentThreadScope(
				result.thread_path,
				threadTitle || session.title,
			);
			layoutStore.setMainView("editor");
			layoutStore.setLeftSidebarCollapsed(false);
			layoutStore.setLeftSidebarView("files");
			toast.success(`设计稿已落到「${threadTitle || "线程"}/designs/」`);
		} catch (err) {
			console.error("[ExitDesignButton] finish failed", err);
			toast.error(
				`完成失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setRunning(false);
		}
	};

	return (
		<Button
			type="button"
			variant="action"
			size="sm"
			disabled={running || !threadPath}
			onClick={() => void handleClick()}
			icon={<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />}
			iconPosition="right"
			title={
				threadPath
					? "把设计稿安置到当前线程并切回编辑器"
					: "请先在 Threads 选一个线程"
			}
		>
			{running ? "完成中..." : "完成 → 写代码"}
		</Button>
	);
}

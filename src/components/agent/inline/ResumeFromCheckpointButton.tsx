// 从检查点恢复任务执行的按钮 — 自检本任务是否有可用 checkpoint，有则展示按钮
//
// 从 AgentTraceInline 主文件抽出，便于独立测试与维护。

import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteCheckpoint, getCheckpoint } from "../../../lib/agent/api";
import { cn } from "../../../lib/utils";

export function ResumeFromCheckpointButton({ taskId }: { taskId: string }) {
	const [isLoading, setIsLoading] = useState(false);
	const [hasCheckpoint, setHasCheckpoint] = useState<boolean | null>(null);
	const [error, setError] = useState<string | null>(null);

	// 检查是否有检查点
	useEffect(() => {
		const checkForCheckpoint = async () => {
			try {
				const checkpoint = await getCheckpoint(taskId);
				setHasCheckpoint(!!checkpoint);
			} catch {
				setHasCheckpoint(false);
			}
		};
		checkForCheckpoint();
	}, [taskId]);

	const handleResume = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const checkpoint = await getCheckpoint(taskId);
			if (!checkpoint) {
				setError("未找到检查点");
				return;
			}

			// 动态导入避免循环依赖
			const { agentExecutor } = await import("../../../lib/agent/executor");

			// 使用检查点数据恢复执行
			const metadata = checkpoint.metadata as {
				query?: string;
				systemPrompt?: string;
				model?: string;
			};

			await agentExecutor.executeCustomTask(
				metadata.query || "继续之前的任务",
				metadata.systemPrompt,
				{},
				{
					resumeSessionId: checkpoint.sdk_session_id,
					workingDirectory: checkpoint.sandbox_dir,
				},
			);

			// 成功后删除检查点
			await deleteCheckpoint(taskId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "恢复失败");
		} finally {
			setIsLoading(false);
		}
	};

	// 没有检查点或正在检查时不显示
	if (hasCheckpoint === null || hasCheckpoint === false) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<button
				onClick={handleResume}
				disabled={isLoading}
				className={cn(
					"flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform]",
					isLoading
						? "bg-warm-200 text-text-light cursor-wait"
						: "bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm hover:shadow",
				)}
			>
				{isLoading ? (
					<>
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						恢复中...
					</>
				) : (
					<>
						<RotateCcw className="w-3.5 h-3.5" />
						从断点继续
					</>
				)}
			</button>
			{error && <div className="text-xs text-error text-center">{error}</div>}
		</div>
	);
}

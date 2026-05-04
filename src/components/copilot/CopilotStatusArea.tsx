import type React from "react";
import { PermissionList } from "../agent";

type PermissionListProps = React.ComponentProps<typeof PermissionList>;

interface CopilotStatusAreaProps extends PermissionListProps {}

export function CopilotStatusArea({
	requests,
	onRespond,
}: CopilotStatusAreaProps) {
	if (requests.length === 0) return null;

	return (
		<div className="px-4 pb-3 shrink-0">
			<div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-peach-100/70 dark:bg-amber-900/10 p-3">
				<div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
					需要授权才能继续执行工具（例如联网搜索）
				</div>
				<PermissionList requests={requests} onRespond={onRespond} />
			</div>
		</div>
	);
}

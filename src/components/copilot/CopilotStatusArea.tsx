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
			<div className="rounded-2xl border border-warning/30 bg-warning-muted p-3">
				<div className="text-xs font-medium text-warning mb-2">
					需要授权才能继续执行工具（例如联网搜索）
				</div>
				<PermissionList requests={requests} onRespond={onRespond} />
			</div>
		</div>
	);
}

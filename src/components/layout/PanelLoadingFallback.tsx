/**
 * PanelLoadingFallback —— 面板 lazy 加载时的骨架占位。
 *
 * 从 App.tsx 抽出来的：中栏分屏后每个组都要用它，再留在 App 里就得从上往下
 * 一路传 props。
 */
import { Skeleton } from "../ui/Skeleton";

export function PanelLoadingFallback() {
	return (
		<div className="h-full w-full flex flex-col gap-3 p-4">
			<Skeleton className="h-8 w-2/3" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-5/6" />
			<Skeleton className="h-4 w-3/4" />
			<div className="flex-1" />
			<Skeleton className="h-10 w-full rounded-xl" />
		</div>
	);
}

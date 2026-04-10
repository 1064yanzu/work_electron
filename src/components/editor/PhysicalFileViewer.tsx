import { memo } from "react";
import { cn } from "../../lib/utils";
import { FileTypePreview } from "./FileTypePreview";
import type { EditorDensity } from "./useEditorUiPrefs";

interface PhysicalFileViewerProps {
	fileName: string;
	content: string;
	filePath?: string;
	density?: EditorDensity;
	onContextMenu?: (e: React.MouseEvent) => void;
}

/** 纯展示组件：渲染从项目文件树打开的非 markdown 物理文件 */
export const PhysicalFileViewer = memo(function PhysicalFileViewer({
	fileName,
	content,
	filePath,
	density = "comfortable",
	onContextMenu,
}: PhysicalFileViewerProps) {
	return (
		<div className="h-full overflow-y-auto scrollbar-hide bg-white/72 dark:bg-zinc-950/35">
			<div className={cn("mx-auto max-w-[860px] px-6 py-7 sm:px-8 sm:py-8")}>
				<h2 className="text-[18px] leading-tight mb-4 font-medium text-zinc-600 dark:text-zinc-300 truncate">
					{fileName}
				</h2>

				<div onContextMenu={onContextMenu} className="max-w-none">
					<FileTypePreview
						fileName={fileName}
						content={content}
						density={density}
						emptyText="文件内容为空。"
						filePath={filePath}
					/>
				</div>
			</div>
		</div>
	);
});

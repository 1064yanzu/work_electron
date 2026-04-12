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
	const isPdf = /\.pdf$/i.test(fileName);
	return (
		<div className="h-full overflow-y-auto scrollbar-hide bg-white/72 dark:bg-zinc-950/35">
			<div
				className={cn(
					"mx-auto",
					isPdf ? "max-w-none px-3 py-3 sm:px-4 sm:py-4" : "max-w-[920px] px-5 py-5 sm:px-6 sm:py-6",
				)}
			>
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

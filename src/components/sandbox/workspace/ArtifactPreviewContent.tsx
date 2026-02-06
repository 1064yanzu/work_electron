import { memo } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";
import { FilePreviewContent } from "./FilePreviewContent";

interface ArtifactPreviewContentProps {
	file: SandboxFile | null;
	previewMode: "preview" | "source";
	onSetPreviewMode: (mode: "preview" | "source") => void;
	onLoadContent: (fileId: string) => Promise<void>;
}

export const ArtifactPreviewContent = memo(function ArtifactPreviewContent({
	file,
	previewMode,
	onSetPreviewMode,
	onLoadContent,
}: ArtifactPreviewContentProps) {
	return (
		<FilePreviewContent
			file={file}
			previewMode={previewMode}
			onSetPreviewMode={onSetPreviewMode}
			onLoadContent={onLoadContent}
			emptyTitle="暂无预览"
			emptyDescription="选择一个产物开始预览"
		/>
	);
});

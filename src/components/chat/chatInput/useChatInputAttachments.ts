import { type RefObject, useCallback } from "react";
import {
	buildPastedFileName,
	saveContextAttachmentFromFile,
} from "../../../lib/chat/attachmentFiles";
import { workspaceStore } from "../../../lib/workspaceStore";
import { toast } from "../../ui/Toast";

interface UseChatInputAttachmentsArgs {
	disabled: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * 处理 ChatInput 的本地文件 / 剪贴板附件。
 *
 * 拆出原因：
 * - `appendFilesToContext` / `handleFileSelect` / `handlePaste` 三段是相互耦合的附件入口，
 *   原文件里掺杂在主组件中难以阅读
 * - 与主组件的耦合点仅有 `disabled` 与 `fileInputRef`，可以纯参数化
 */
export function useChatInputAttachments({
	disabled,
	fileInputRef,
}: UseChatInputAttachmentsArgs) {
	const addFileToContext = workspaceStore.addFileToContext.bind(workspaceStore);

	const appendFilesToContext = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return 0;

			let successCount = 0;
			for (const [index, file] of files.entries()) {
				try {
					const normalizedFileName =
						file.name?.trim() || buildPastedFileName(file, index);
					const attachment = await saveContextAttachmentFromFile(
						file,
						normalizedFileName,
					);
					addFileToContext(attachment);
					successCount += 1;
				} catch (err) {
					console.error("读取文件失败:", err);
				}
			}

			return successCount;
		},
		[addFileToContext],
	);

	const handleFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files ?? []);
			if (files.length === 0) return;

			try {
				const successCount = await appendFilesToContext(files);
				if (successCount > 1) {
					toast.success(`已添加 ${successCount} 个附件`);
				}
			} catch (err) {
				console.error("读取文件失败:", err);
				toast.error("添加附件失败");
			} finally {
				// 清空 input 以便允许重复选择同名文件
				e.target.value = "";
			}
		},
		[appendFilesToContext],
	);

	const handlePaste = useCallback(
		async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
			if (disabled) return;

			const files = Array.from(e.clipboardData.items)
				.filter((item) => item.kind === "file")
				.map((item) => item.getAsFile())
				.filter((file): file is File => file instanceof File);
			if (files.length === 0) return;

			e.preventDefault();
			try {
				const successCount = await appendFilesToContext(files);
				if (successCount === 0) {
					toast.error("剪贴板里的文件添加失败");
					return;
				}
				toast.success(
					successCount === 1
						? "已从剪贴板添加附件"
						: `已从剪贴板添加 ${successCount} 个附件`,
				);
			} catch (error) {
				console.error("粘贴附件失败:", error);
				toast.error("粘贴附件失败");
			}
		},
		[appendFilesToContext, disabled],
	);

	const triggerFilePicker = useCallback(() => {
		fileInputRef.current?.click();
	}, [fileInputRef]);

	return {
		handleFileSelect,
		handlePaste,
		triggerFilePicker,
	};
}

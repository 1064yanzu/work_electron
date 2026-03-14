import { formatFilePath, inferLanguage } from "../../../lib/utils/diffUtils";

export function getPreviewPathLabel(
	filePath: string | null,
	projectPath: string | null,
): string {
	if (!filePath) return "未选择文件";
	return formatFilePath(filePath, projectPath ?? undefined);
}

export function getPreviewLanguageLabel(filePath: string | null): string {
	if (!filePath) return "text";
	return inferLanguage(filePath);
}

export function splitPreviewLines(
	content: string,
): Array<{ number: number; text: string }> {
	const normalized = content.replace(/\r\n/g, "\n");
	return normalized.split("\n").map((text, index) => ({
		number: index + 1,
		text,
	}));
}

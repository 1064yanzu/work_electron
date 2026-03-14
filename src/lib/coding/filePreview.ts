import { inferLanguage } from "../utils/diffUtils";
import { codingWorkspaceStore } from "../stores/codingWorkspaceStore";
import { invoke } from "../tauriCompat";

export interface CodingFilePreviewResult {
	path: string;
	content: string;
	truncated: boolean;
	language: string;
	/** 文件类型：text（正常文本）、image（图片）、svg（SVG 图像）、binary（其他二进制） */
	fileType: "text" | "image" | "svg" | "binary";
}

/** 图片文件扩展名集合 */
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"ico",
	"bmp",
	"tiff",
	"tif",
	"avif",
]);

/** 二进制文件扩展名集合（除图片外） */
const BINARY_EXTENSIONS = new Set([
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	"zip",
	"gz",
	"tar",
	"rar",
	"7z",
	"pdf",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"mp3",
	"mp4",
	"wav",
	"avi",
	"mov",
	"flv",
	"wmv",
	"exe",
	"dll",
	"so",
	"dylib",
	"db",
	"sqlite",
	"sqlite3",
]);

/** 通过文件扩展名判断文件类型 */
export function detectFileType(
	filePath: string,
): CodingFilePreviewResult["fileType"] {
	const ext = filePath.split(".").pop()?.toLowerCase() || "";
	if (ext === "svg") return "svg";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (BINARY_EXTENSIONS.has(ext)) return "binary";
	return "text";
}

/** 判断是否为图片文件（含 SVG） */
export function isImageFile(filePath: string): boolean {
	const type = detectFileType(filePath);
	return type === "image" || type === "svg";
}

export async function readCodingFilePreview(
	filePath: string,
): Promise<CodingFilePreviewResult> {
	const fileType = detectFileType(filePath);

	// 对于纯二进制文件（不含 SVG），不读取内容
	if (fileType === "binary") {
		return {
			path: filePath,
			content: "",
			truncated: false,
			language: inferLanguage(filePath),
			fileType: "binary",
		};
	}

	// 对于图片文件，不读取文本内容，直接标记为图片
	if (fileType === "image") {
		return {
			path: filePath,
			content: "",
			truncated: false,
			language: "image",
			fileType: "image",
		};
	}

	// SVG 和普通文本文件正常读取
	const result = await invoke<{ content: string; truncated: boolean }>(
		"coding_read_file",
		{
			path: filePath,
		},
	);
	return {
		path: filePath,
		content: result.content,
		truncated: result.truncated,
		language: inferLanguage(filePath),
		fileType,
	};
}

export async function openCodingFilePreview(filePath: string): Promise<void> {
	codingWorkspaceStore.setSelectedFile(filePath);
	// 在中间面板打开文件 Tab（代码查看器）
	codingWorkspaceStore.openCenterTab(filePath);
	try {
		const result = await readCodingFilePreview(filePath);
		codingWorkspaceStore.setSelectedFilePreview({
			path: result.path,
			content: result.content,
			truncated: result.truncated,
		});
	} catch (error) {
		codingWorkspaceStore.setSelectedFilePreviewError(
			filePath,
			error instanceof Error ? error.message : String(error),
		);
	}
}

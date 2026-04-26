import { saveTempFile } from "../api";

interface SavedAttachmentInput {
	title: string;
	content: string;
	filePath: string;
	size?: number;
	mimeType?: string;
}

function inferExtension(fileName: string, mimeType?: string): string {
	const normalizedName = fileName.trim().toLowerCase();
	const ext = normalizedName.split(".").pop()?.trim();
	if (ext && ext !== normalizedName) return ext;

	switch (mimeType) {
		case "image/png":
			return "png";
		case "image/jpeg":
			return "jpg";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		case "image/svg+xml":
			return "svg";
		case "application/pdf":
			return "pdf";
		case "text/markdown":
			return "md";
		case "application/json":
			return "json";
		default:
			return "txt";
	}
}

function inferPrefix(fileName: string): string {
	const base = fileName.split(/[/\\]/).pop() || fileName;
	const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
	return stem.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "file";
}

function isLikelyTextFile(file: File, fileName: string): boolean {
	if (
		file.type?.startsWith("text/") ||
		file.type === "application/json" ||
		file.type === "application/xml" ||
		file.type === "application/javascript"
	) {
		return true;
	}

	const normalizedName = fileName.toLowerCase();
	return (
		normalizedName.endsWith(".md") ||
		normalizedName.endsWith(".markdown") ||
		normalizedName.endsWith(".txt") ||
		normalizedName.endsWith(".json") ||
		normalizedName.endsWith(".csv") ||
		normalizedName.endsWith(".ts") ||
		normalizedName.endsWith(".tsx") ||
		normalizedName.endsWith(".js") ||
		normalizedName.endsWith(".jsx") ||
		normalizedName.endsWith(".py") ||
		normalizedName.endsWith(".java") ||
		normalizedName.endsWith(".go") ||
		normalizedName.endsWith(".rs") ||
		normalizedName.endsWith(".xml") ||
		normalizedName.endsWith(".yml") ||
		normalizedName.endsWith(".yaml") ||
		normalizedName.endsWith(".toml") ||
		normalizedName.endsWith(".ini") ||
		normalizedName.endsWith(".log")
	);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buf);
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

function formatTimestamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		"-",
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join("");
}

export function buildPastedFileName(file: File, index = 0): string {
	if (file.name?.trim()) return file.name.trim();

	const extension = inferExtension("", file.type);
	const baseName = file.type.startsWith("image/")
		? "pasted-image"
		: "pasted-file";
	const suffix = index > 0 ? `-${index + 1}` : "";
	return `${baseName}-${formatTimestamp(new Date())}${suffix}.${extension}`;
}

export async function saveContextAttachmentFromFile(
	file: File,
	fileName = file.name,
): Promise<SavedAttachmentInput> {
	const normalizedFileName = fileName.trim() || buildPastedFileName(file);
	const extension = inferExtension(normalizedFileName, file.type);
	const prefix = inferPrefix(normalizedFileName);
	const isText = isLikelyTextFile(file, normalizedFileName);
	const content = isText
		? await file.text()
		: arrayBufferToBase64(await file.arrayBuffer());
	const temp = await saveTempFile({
		content,
		extension,
		prefix,
		encoding: isText ? "utf-8" : "base64",
	});

	return {
		title: normalizedFileName,
		content: isText ? content : "",
		filePath: temp.path,
		size: file.size,
		mimeType: file.type || undefined,
	};
}

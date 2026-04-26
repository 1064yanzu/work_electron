const HTML_PREVIEW_EXTENSIONS = new Set(["html", "htm", "svg"]);

function normalizeExtension(input: string): string {
	return String(input || "")
		.trim()
		.toLowerCase()
		.replace(/^\./, "");
}

export function getFileExtensionFromPath(input: string): string {
	const normalized = String(input || "")
		.trim()
		.split(/[?#]/)[0]
		.split(/[\\/]/)
		.pop();
	if (!normalized) return "";
	const dot = normalized.lastIndexOf(".");
	if (dot < 0) return "";
	return normalizeExtension(normalized.slice(dot + 1));
}

export function isHtmlPreviewExtension(input: string): boolean {
	return HTML_PREVIEW_EXTENSIONS.has(normalizeExtension(input));
}

export function isHtmlPreviewPath(input: string): boolean {
	return isHtmlPreviewExtension(getFileExtensionFromPath(input));
}

const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|webp|gif|bmp|tiff?|ico)$/i;
const FILE_URL_REGEX = /file:\/\/[^\s)>\]}]+/gi;
const ABS_PATH_IMAGE_REGEX =
	/(?:\/Users\/[^\s)>\]}]+|\/home\/[^\s)>\]}]+|\/Volumes\/[^\s)>\]}]+)\.(?:png|jpe?g|webp|gif|bmp|tiff?|ico)/gi;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
const MARKDOWN_LINK_REGEX = /(?<!!)\[([^\]]*)\]\(([^)\n]+)\)/g;

function stripMarkdownAngleWrap(input: string): string {
	const value = String(input || "").trim();
	if (value.startsWith("<") && value.endsWith(">") && value.length >= 2) {
		return value.slice(1, -1).trim();
	}
	return value;
}

function stripMarkdownOptionalTitle(input: string): string {
	const value = String(input || "").trim();
	const matched = value.match(/^(.*?)(?:\s+(?:"[^"]*"|'[^']*'))$/);
	if (!matched?.[1]) return value;
	return String(matched[1]).trim();
}

function normalizeMarkdownHref(input: string): string {
	const withoutTitle = stripMarkdownOptionalTitle(input);
	return stripMarkdownAngleWrap(withoutTitle);
}

function normalizeFileUrlToPath(input: string): string {
	const value = String(input || "").trim();
	if (!value) return "";
	if (!value.toLowerCase().startsWith("file://")) return value;
	try {
		const url = new URL(value);
		return decodeURIComponent(url.pathname || "");
	} catch {
		return value.replace(/^file:\/\//i, "");
	}
}

function normalizeForExtCheck(pathLike: string): string {
	const withoutWrap = stripMarkdownAngleWrap(pathLike);
	return withoutWrap.replace(/[?#].*$/, "").trim();
}

function isLikelyImagePath(pathLike: string): boolean {
	return IMAGE_FILE_EXT_REGEX.test(normalizeForExtCheck(pathLike));
}

function isLikelyLocalImagePath(pathLike: string): boolean {
	const value = String(pathLike || "")
		.trim()
		.toLowerCase();
	if (!value) return false;
	if (!isLikelyImagePath(value)) return false;
	if (value.startsWith("http://") || value.startsWith("https://")) return false;
	if (value.startsWith("data:image/")) return false;
	if (/^[a-z]+:\/\//i.test(value) && !value.startsWith("file://")) return false;
	return true;
}

function collectLocalImagePath(candidate: string): string | null {
	const normalized = normalizeFileUrlToPath(normalizeMarkdownHref(candidate));
	if (!isLikelyLocalImagePath(normalized)) return null;
	return normalized;
}

export function extractLocalImagePathsFromText(text: string): {
	imagePaths: string[];
	cleanedText: string;
} {
	const found = new Set<string>();
	let cleaned = String(text || "");

	cleaned = cleaned.replace(
		MARKDOWN_IMAGE_REGEX,
		(match: string, alt: string, href: string) => {
			const imagePath = collectLocalImagePath(href);
			if (!imagePath) return match;
			found.add(imagePath);
			const altText = String(alt || "").trim();
			return altText ? `（图片：${altText}）` : "";
		},
	);

	cleaned = cleaned.replace(
		MARKDOWN_LINK_REGEX,
		(match: string, label: string, href: string) => {
			const imagePath = collectLocalImagePath(href);
			if (!imagePath) return match;
			found.add(imagePath);
			return label?.trim() ? `[${label}]` : "";
		},
	);

	cleaned = cleaned.replace(FILE_URL_REGEX, (match: string) => {
		const normalized = normalizeFileUrlToPath(match);
		if (isLikelyLocalImagePath(normalized)) {
			found.add(normalized);
			return "";
		}
		return match;
	});

	cleaned = cleaned.replace(ABS_PATH_IMAGE_REGEX, (match: string) => {
		if (isLikelyLocalImagePath(match)) {
			found.add(match);
			return "";
		}
		return match;
	});

	cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
	cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
	return {
		imagePaths: Array.from(found),
		cleanedText: cleaned,
	};
}

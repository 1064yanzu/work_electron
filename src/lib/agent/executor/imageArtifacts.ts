import { safeInvoke } from "@/lib/tauriBridge";
import { getBasename, stripTrailingSlash, uniqStrings } from "./pathUtils";

const IMAGE_FILE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
	"tif",
	"tiff",
]);

const DATA_IMAGE_URL_RE =
	/data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
export const DATA_IMAGE_URL_LIMIT = 1;

function extensionFromDataImageMime(raw: string): string {
	const mime = String(raw || "")
		.toLowerCase()
		.trim();
	if (!mime) return "png";
	if (mime === "jpeg") return "jpg";
	if (mime === "svg+xml") return "svg";
	return mime.replace(/[^a-z0-9]+/g, "") || "png";
}

function collectDataImageUrlsFromString(
	raw: string,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const text = String(raw || "");
	if (!text || text.length > 8_000_000) return [];
	const found: string[] = [];
	DATA_IMAGE_URL_RE.lastIndex = 0;
	let match: RegExpExecArray | null = null;
	while ((match = DATA_IMAGE_URL_RE.exec(text)) !== null) {
		if (!match[0]) continue;
		found.push(match[0]);
		if (found.length >= limit) break;
	}
	return found;
}

export function collectDataImageUrlsFromUnknown(
	value: unknown,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const found = new Set<string>();
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number) => {
		if (v === null || v === undefined) return;
		if (depth > 8 || found.size >= limit) return;
		if (typeof v === "string") {
			for (const item of collectDataImageUrlsFromString(
				v,
				limit - found.size,
			)) {
				found.add(item);
				if (found.size >= limit) break;
			}
			return;
		}
		if (Array.isArray(v)) {
			for (const item of v) {
				visit(item, depth + 1);
				if (found.size >= limit) break;
			}
			return;
		}
		if (typeof v !== "object") return;
		if (seen.has(v)) return;
		seen.add(v);
		for (const item of Object.values(v as Record<string, unknown>)) {
			visit(item, depth + 1);
			if (found.size >= limit) break;
		}
	};

	visit(value, 0);
	return [...found];
}

export async function persistDataImageUrlToSandbox(input: {
	dataUrl: string;
	sandboxDir?: string;
	prefix?: string;
}): Promise<string | null> {
	const sandboxDir = String(input.sandboxDir || "").trim();
	if (!sandboxDir) return null;
	const match = String(input.dataUrl || "").match(
		/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i,
	);
	if (!match) return null;
	const ext = extensionFromDataImageMime(match[1] || "png");
	const base64Data = match[2] || "";
	if (!base64Data) return null;

	const fileName = `${input.prefix || "generated-image"}-${Date.now()}-${Math.random()
		.toString(36)
		.slice(2, 8)}.${ext}`;
	const filePath = `${stripTrailingSlash(sandboxDir)}/images/${fileName}`;

	await safeInvoke<{ success: boolean }>("write_file_safe", {
		payload: {
			path: filePath,
			content: base64Data,
			encoding: "base64",
			create_dirs: true,
		},
	});
	return filePath;
}

export function mergeImagePathsIntoToolOutput(
	toolOutput: unknown,
	imagePaths: string[],
): unknown {
	const paths = uniqStrings(imagePaths);
	if (paths.length === 0) return toolOutput;
	if (
		toolOutput &&
		typeof toolOutput === "object" &&
		!Array.isArray(toolOutput)
	) {
		const record = toolOutput as Record<string, unknown>;
		const existing = Array.isArray(record.image_paths)
			? record.image_paths.filter((v): v is string => typeof v === "string")
			: [];
		return {
			...record,
			image_paths: uniqStrings([...existing, ...paths]),
		};
	}
	return {
		image_paths: paths,
	};
}

function stripWrapping(value: string): string {
	let s = String(value || "").trim();
	const pairs: Array<[string, string]> = [
		['"', '"'],
		["'", "'"],
		["`", "`"],
		["<", ">"],
	];
	let changed = true;
	while (changed) {
		changed = false;
		for (const [l, r] of pairs) {
			if (s.startsWith(l) && s.endsWith(r) && s.length >= 2) {
				s = s.slice(1, -1).trim();
				changed = true;
			}
		}
	}
	return s;
}

function hasImageFileExtension(value: string): boolean {
	const s = String(value || "")
		.trim()
		.replace(/^file:\/\//i, "")
		.split("#")[0]
		.split("?")[0];
	const base = getBasename(s);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return false;
	const ext = base.slice(dot + 1).toLowerCase();
	return IMAGE_FILE_EXTENSIONS.has(ext);
}

function isAbsolutePath(value: string): boolean {
	const s = String(value || "").trim();
	return s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s);
}

function normalizeImageFilePathCandidate(
	raw: string,
	sandboxDir?: string,
): string | null {
	let value = stripWrapping(raw)
		.replace(/^file:\/\//i, "")
		.trim();
	try {
		value = decodeURIComponent(value);
	} catch {}
	if (!value) return null;
	if (value.startsWith("data:image/")) return null;
	if (value.startsWith("http://") || value.startsWith("https://")) return null;
	if (/[<>|;&]/.test(value)) return null;
	if (!hasImageFileExtension(value)) return null;
	if (isLikelyShellImageCommand(value)) return null;

	if (isAbsolutePath(value)) return value;
	if (value.startsWith("~/")) return value;

	if (sandboxDir) {
		const base = stripTrailingSlash(sandboxDir);
		const rel = value
			.replace(/^\.\/+/, "")
			.replace(/\\/g, "/")
			.replace(/^\/+/, "");
		return `${base}/${rel}`;
	}

	return value;
}

function isLikelyShellImageCommand(value: string): boolean {
	const normalized = String(value || "").trim();
	if (!normalized) return false;
	if (
		/^(ffmpeg|magick|convert|python|python3|node|bash|sh|zsh)\s/i.test(
			normalized,
		)
	) {
		return true;
	}
	if (
		/\s-(i|ss|vf|filter|frames?|frames:v|loop|t|to|itsoffset)\b/i.test(
			normalized,
		)
	) {
		return true;
	}
	if (
		/\.(mp4|mov|mkv|avi|webm|wav|mp3)\b/i.test(normalized) &&
		/\.(png|jpg|jpeg|gif|webp|svg)\b/i.test(normalized) &&
		/\s/.test(normalized)
	) {
		return true;
	}
	return false;
}

function extractImagePathsFromString(
	raw: string,
	sandboxDir?: string,
): string[] {
	const value = String(raw || "");
	if (!value.trim()) return [];

	const found = new Set<string>();

	const addCandidate = (candidate: string) => {
		const normalized = normalizeImageFilePathCandidate(candidate, sandboxDir);
		if (normalized) found.add(normalized);
	};

	// Markdown image syntax: ![alt](<path/to/file with spaces.png>)
	for (const match of value.matchAll(/!\[[^\]]*]\((?:<)?([^)\n>]+)(?:>)?\)/g)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	// Quoted absolute/relative paths (supports spaces)
	for (const match of value.matchAll(
		/["'`]([^"'`\n]+\.[A-Za-z0-9]{2,6})["'`]/g,
	)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	// Unquoted filesystem-like paths (no spaces)
	for (const match of value.matchAll(
		/(?:^|[\s(])((?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])[^"'\n()<>{}]*?\.[A-Za-z0-9]{2,6})(?=$|[\s),])/g,
	)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	return [...found];
}

export function collectImageFilePathsFromToolOutput(
	output: unknown,
	sandboxDir?: string,
): string[] {
	const found = new Set<string>();
	const visited = new Set<unknown>();

	const add = (candidate: string) => {
		const normalized = normalizeImageFilePathCandidate(candidate, sandboxDir);
		if (normalized) found.add(normalized);
	};

	const visit = (value: unknown, depth: number) => {
		if (value === null || value === undefined) return;
		if (depth > 8) return;

		if (typeof value === "string") {
			for (const candidate of extractImagePathsFromString(value, sandboxDir)) {
				add(candidate);
			}
			const trimmed = value.trim();
			if (
				(trimmed.startsWith("{") || trimmed.startsWith("[")) &&
				trimmed.length <= 200_000
			) {
				try {
					visit(JSON.parse(trimmed), depth + 1);
				} catch {}
			}
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}

		if (typeof value !== "object") return;
		if (visited.has(value)) return;
		visited.add(value);

		const record = value as Record<string, unknown>;
		for (const [key, v] of Object.entries(record)) {
			const lowerKey = key.toLowerCase();

			if (
				typeof v === "string" &&
				(lowerKey.includes("image") ||
					lowerKey.includes("img") ||
					lowerKey.endsWith("path") ||
					lowerKey.endsWith("url") ||
					lowerKey.includes("file"))
			) {
				add(v);
			}

			if (
				Array.isArray(v) &&
				(lowerKey.includes("image") ||
					lowerKey.endsWith("paths") ||
					lowerKey.includes("files"))
			) {
				for (const item of v) {
					if (typeof item === "string") add(item);
				}
			}

			visit(v, depth + 1);
		}
	};

	visit(output, 0);
	return [...found];
}

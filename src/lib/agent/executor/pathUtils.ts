// Include both ASCII and full-width Chinese punctuation that may cause issues with SDK tools
const ILLEGAL_FILENAME_CHARS_RE =
	/[<>:"/\\|?*\u0000-\u001F？！""''“”‘’：；【】（）《》、，。]/g;

export function sanitizeFilename(name: string): string {
	const base = String(name || "file")
		.normalize("NFC")
		.trim();
	const normalized = base.replace(ILLEGAL_FILENAME_CHARS_RE, "_");
	const collapsed = normalized.replace(/\s+/g, " ").trim();
	// Also collapse multiple underscores
	const cleanUnderscores = collapsed.replace(/_+/g, "_");
	const withoutTrailingDotsOrSpaces = cleanUnderscores
		.replace(/[. _]+$/g, "")
		.trim();
	const safe =
		withoutTrailingDotsOrSpaces === "." || withoutTrailingDotsOrSpaces === ".."
			? "file"
			: withoutTrailingDotsOrSpaces;
	return safe.length > 0 ? safe.slice(0, 180) : "file";
}

export function ensureExtension(name: string, ext: string): string {
	const e = ext.startsWith(".") ? ext : `.${ext}`;
	if (name.toLowerCase().endsWith(e.toLowerCase())) return name;
	return `${name}${e}`;
}

export function getBasename(p: string): string {
	const s = String(p || "");
	const parts = s.split(/[/\\]/).filter(Boolean);
	return parts.length > 0 ? (parts[parts.length - 1] as string) : s;
}

export function stripTrailingSlash(p: string): string {
	return String(p || "").replace(/[\\/]+$/, "");
}

export function splitExtension(name: string): { stem: string; ext: string } {
	const s = String(name || "").trim();
	const base = getBasename(s);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return { stem: base, ext: "" };
	return { stem: base.slice(0, dot), ext: base.slice(dot) };
}

export function extFromMime(mimeType?: string): string {
	const mt = String(mimeType || "")
		.toLowerCase()
		.trim();
	if (!mt) return "";
	if (mt === "text/markdown") return ".md";
	if (mt.startsWith("text/")) return ".txt";
	if (mt === "application/json") return ".json";
	if (mt === "application/pdf") return ".pdf";
	return "";
}

export function uniqStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const s = String(value || "").trim();
		if (!s || seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

export function normalizePathKey(value: string): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.toLowerCase();
}

export function simpleFingerprint(text: string): string {
	let hash = 2166136261;
	const raw = String(text || "");
	for (let i = 0; i < raw.length; i++) {
		hash ^= raw.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `${hash >>> 0}`;
}

export function chooseSandboxFileName(input: {
	title: string;
	sourcePath: string;
	mimeType?: string;
}): string {
	const titleBase = getBasename(input.title);
	const { stem: titleStem, ext: titleExt } = splitExtension(titleBase);
	const { ext: pathExt } = splitExtension(
		getBasename(stripTrailingSlash(input.sourcePath)),
	);
	const ext = titleExt || pathExt || extFromMime(input.mimeType);
	const stemRaw = titleExt ? titleStem : titleBase;
	const safeStem = sanitizeFilename(stemRaw);
	return ext ? ensureExtension(safeStem, ext) : safeStem;
}

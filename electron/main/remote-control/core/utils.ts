export function clampString(input: string, limit: number): string {
	const normalized = String(input || "").trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

export function parseJsonSafely<T>(raw: string | null | undefined): T | null {
	if (!raw || typeof raw !== "string") return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function uniqStrings(input: string[]): string[] {
	return [...new Set(input.map((v) => String(v || "").trim()).filter(Boolean))];
}

export function nowTs(): number {
	return Date.now();
}

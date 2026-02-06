const SDK_SESSION_ID_MAX_LEN = 256;
const SDK_SESSION_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;

export function normalizeSdkSessionId(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > SDK_SESSION_ID_MAX_LEN) return undefined;
	if (!SDK_SESSION_ID_RE.test(trimmed)) return undefined;
	return trimmed;
}

export function isSdkSessionId(value: unknown): value is string {
	return normalizeSdkSessionId(value) !== undefined;
}

import { isSdkSessionId, normalizeSdkSessionId } from "../../shared/sdkSession";

const STRICT_UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStrictUuid(value: unknown): value is string {
	if (typeof value !== "string") return false;
	return STRICT_UUID_RE.test(value.trim());
}

// Backward-compatible export name. For SDK session ids we allow a broader format.
export function isUuid(value: unknown): value is string {
	return isSdkSessionId(value);
}

export { isSdkSessionId, normalizeSdkSessionId };

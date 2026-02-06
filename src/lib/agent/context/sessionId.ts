import {
	isSdkSessionId,
	normalizeSdkSessionId,
} from "../../../../shared/sdkSession";

export { isSdkSessionId, normalizeSdkSessionId };

export function resolveResumeSessionId(value: unknown): string | undefined {
	return normalizeSdkSessionId(value);
}

type AnyRecord = Record<string, unknown>;

export type FeishuApiErrorInfo = {
	code?: number;
	msg?: string;
	message?: string;
	logId?: string;
};

function asRecord(value: unknown): AnyRecord | null {
	if (!value || typeof value !== "object") return null;
	return value as AnyRecord;
}

function toStringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function walkUnknownTree(
	value: unknown,
	visitor: (node: AnyRecord) => void,
	seen = new Set<unknown>(),
): void {
	if (!value || typeof value !== "object") return;
	if (seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const item of value) {
			walkUnknownTree(item, visitor, seen);
		}
		return;
	}
	const node = value as AnyRecord;
	visitor(node);
	for (const nested of Object.values(node)) {
		walkUnknownTree(nested, visitor, seen);
	}
}

export function extractFeishuApiErrorInfo(error: unknown): FeishuApiErrorInfo {
	const root = asRecord(error);
	const response = asRecord(root?.response);
	const data = asRecord(response?.data);
	const rawError = asRecord(data?.error);
	let code =
		toNumberOrUndefined(root?.code) ??
		toNumberOrUndefined(data?.code) ??
		toNumberOrUndefined(rawError?.code);
	let msg =
		toStringOrUndefined(root?.msg) ??
		toStringOrUndefined(data?.msg) ??
		toStringOrUndefined(rawError?.msg);
	let message =
		toStringOrUndefined(root?.message) ??
		toStringOrUndefined(data?.message) ??
		toStringOrUndefined(rawError?.message);
	let logId =
		toStringOrUndefined(data?.log_id) ??
		toStringOrUndefined(rawError?.log_id);

	if (!code || !msg || !message || !logId) {
		walkUnknownTree(error, (node) => {
			if (!code) {
				code = toNumberOrUndefined(node.code);
			}
			if (!msg) {
				msg = toStringOrUndefined(node.msg);
			}
			if (!message) {
				message = toStringOrUndefined(node.message);
			}
			if (!logId) {
				logId =
					toStringOrUndefined(node.log_id) ??
					toStringOrUndefined(node.logId);
			}
		});
	}

	return {
		code,
		msg,
		message,
		logId,
	};
}

export function isFeishuPermissionDenied(error: unknown): boolean {
	return extractFeishuApiErrorInfo(error).code === 99991672;
}

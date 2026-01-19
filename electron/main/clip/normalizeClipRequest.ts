import type { ClipPayload } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const s = value.trim();
	return s.length > 0 ? s : undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (Array.isArray(value)) {
		const items = value
			.map((v) => asString(v))
			.filter((v): v is string => Boolean(v));
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === "string") {
		const items = value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		return items.length > 0 ? items : undefined;
	}
	return undefined;
}

export type NormalizeClipResult =
	| { ok: true; payload: ClipPayload }
	| { ok: false; error: string };

export function normalizeClipRequest(input: unknown): NormalizeClipResult {
	const obj = asRecord(input);
	if (!obj) return { ok: false, error: "Invalid JSON body" };

	const title =
		asString(obj.title) ??
		asString(obj.page_title) ??
		asString(obj.pageTitle) ??
		asString(obj.document_title);
	const url =
		asString(obj.url) ?? asString(obj.page_url) ?? asString(obj.pageUrl);

	const selectedText =
		asString(obj.selection_text) ??
		asString(obj.selectedText) ??
		asString(obj.selectionText);
	const html =
		asString(obj.content_html) ??
		asString(obj.html) ??
		asString(obj.contentHtml);
	const text =
		asString(obj.content_markdown) ??
		asString(obj.contentMarkdown) ??
		asString(obj.text);

	const createdAt =
		asNumber(obj.captured_at) ??
		asNumber(obj.capturedAt) ??
		asNumber(obj.createdAt);
	const projectId = asString(obj.project_id) ?? asString(obj.projectId);
	const folderId = asString(obj.folder_id) ?? asString(obj.folderId);
	const tags = asStringArray(obj.tags);

	const sourceRaw = asString(obj.source);
	const source: ClipPayload["source"] =
		sourceRaw === "manual"
			? "manual"
			: sourceRaw === "unknown"
				? "unknown"
				: "browser_extension";

	if (!title || !url) {
		return { ok: false, error: "Missing required fields: title, url" };
	}

	return {
		ok: true,
		payload: {
			title,
			url,
			selectedText,
			html,
			text,
			createdAt,
			projectId,
			folderId,
			tags,
			source,
		},
	};
}

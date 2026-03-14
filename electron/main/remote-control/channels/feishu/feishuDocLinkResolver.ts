import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import {
	extractFeishuApiErrorInfo,
	isFeishuPermissionDenied,
} from "./feishuApiError";

type PrefetchStatus = "success" | "error" | "unsupported";

type DocCandidate = {
	url: string;
	kind: "docx" | "wiki";
	token: string;
};

type DocPrefetchEntry = {
	url: string;
	kind: "docx" | "wiki";
	token: string;
	status: PrefetchStatus;
	documentId?: string;
	title?: string;
	content?: string;
	detail?: string;
};

export type FeishuResolvedContextFile = {
	title: string;
	suggestedName: string;
	content: string;
	metadata: Record<string, string>;
};

export type FeishuDocResolveResult = {
	contextBlock: string;
	contextFiles: FeishuResolvedContextFile[];
};

const MAX_DOC_TEXT_CHARS = 10_000;
const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;
const SCOPE_BLOCK_COOLDOWN_MS = 30 * 60 * 1000;
const URL_REDACTED_TEXT = "[链接已隐藏]";

function toStringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncateContent(raw: string): { content: string; truncated: boolean } {
	if (raw.length <= MAX_DOC_TEXT_CHARS) {
		return { content: raw, truncated: false };
	}
	return {
		content: raw.slice(0, MAX_DOC_TEXT_CHARS),
		truncated: true,
	};
}

function redactUrls(raw: string): string {
	return String(raw || "").replace(URL_REGEX, URL_REDACTED_TEXT);
}

function sanitizeFileNameSegment(raw: string): string {
	return String(raw || "")
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
		.replace(/\s+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 64);
}

export class FeishuDocLinkResolver {
	private wikiScopeBlockedUntil = 0;
	private docxScopeBlockedUntil = 0;
	private lastScopeHintAt = 0;

	constructor(
		private readonly client: Lark.Client,
		private readonly logger: Logger,
	) {}

	private markScopeBlocked(kind: "wiki" | "docx"): void {
		const until = Date.now() + SCOPE_BLOCK_COOLDOWN_MS;
		if (kind === "wiki") {
			this.wikiScopeBlockedUntil = until;
		} else {
			this.docxScopeBlockedUntil = until;
		}
		if (Date.now() - this.lastScopeHintAt > 60_000) {
			this.lastScopeHintAt = Date.now();
			this.logger.info({
				msg: "feishu doc prefetch scope blocked",
				kind,
				blockedUntil: until,
			});
		}
	}

	private isScopeBlocked(kind: "wiki" | "docx"): boolean {
		const now = Date.now();
		return kind === "wiki"
			? now < this.wikiScopeBlockedUntil
			: now < this.docxScopeBlockedUntil;
	}

	private collectCandidates(text: string): DocCandidate[] {
		const links = text.match(URL_REGEX) ?? [];
		const dedupe = new Set<string>();
		const candidates: DocCandidate[] = [];
		for (const link of links) {
			let parsed: URL;
			try {
				parsed = new URL(link);
			} catch {
				continue;
			}
			const segments = parsed.pathname.split("/").filter(Boolean);
			for (let i = 0; i < segments.length - 1; i++) {
				const segment = segments[i]?.toLowerCase();
				const token = segments[i + 1];
				if (!token) continue;
				if (segment !== "docx" && segment !== "wiki") continue;
				const key = `${segment}:${token}`;
				if (dedupe.has(key)) continue;
				dedupe.add(key);
				candidates.push({
					url: link,
					kind: segment,
					token,
				});
				break;
			}
		}
		return candidates;
	}

	private async fetchDocxContent(
		documentId: string,
	): Promise<{
		ok: boolean;
		content?: string;
		detail?: string;
		code?: number;
	}> {
		const response = await this.client.docx.v1.document.rawContent({
			path: { document_id: documentId },
		});
		if (response.code !== 0) {
			return {
				ok: false,
				code: response.code,
				detail: `code=${response.code ?? "unknown"} msg=${response.msg ?? "unknown error"}`,
			};
		}
		const content = toStringOrUndefined(response.data?.content);
		if (!content) {
			return {
				ok: false,
				detail: "文档纯文本为空。",
			};
		}
		return {
			ok: true,
			content,
		};
	}

	private async resolveDocxCandidate(
		candidate: DocCandidate,
	): Promise<DocPrefetchEntry> {
		if (this.isScopeBlocked("docx")) {
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "error",
				documentId: candidate.token,
				detail:
					"应用缺少 docx 文档读取权限，已临时跳过预取。请在飞书开放平台开通文档读取 scope。",
			};
		}
		try {
			const fetched = await this.fetchDocxContent(candidate.token);
			if (!fetched.ok) {
				if (fetched.code === 99991672) {
					this.markScopeBlocked("docx");
				}
				return {
					url: candidate.url,
					kind: candidate.kind,
					token: candidate.token,
					status: "error",
					documentId: candidate.token,
					detail: fetched.detail,
				};
			}
			const trimmed = truncateContent(fetched.content || "");
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "success",
				documentId: candidate.token,
				content: trimmed.content,
				detail: trimmed.truncated
					? `文档内容已截断到 ${MAX_DOC_TEXT_CHARS} 字符。`
					: undefined,
			};
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			if (isFeishuPermissionDenied(error)) {
				this.markScopeBlocked("docx");
			}
			this.logger.warn({
				msg: "feishu docx prefetch failed",
				token: candidate.token,
				error: detail,
			});
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "error",
				documentId: candidate.token,
				detail,
			};
		}
	}

	private async resolveWikiCandidate(
		candidate: DocCandidate,
	): Promise<DocPrefetchEntry> {
		if (this.isScopeBlocked("wiki")) {
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "error",
				detail:
					"应用缺少 wiki 读取权限，已临时跳过预取。请在飞书开放平台开通 wiki scope。",
			};
		}
		try {
			const nodeResp = await this.client.wiki.v2.space.getNode({
				params: { token: candidate.token },
			});
			if (nodeResp.code !== 0) {
				if (nodeResp.code === 99991672) {
					this.markScopeBlocked("wiki");
				}
				return {
					url: candidate.url,
					kind: candidate.kind,
					token: candidate.token,
					status: "error",
					detail: `code=${nodeResp.code ?? "unknown"} msg=${nodeResp.msg ?? "unknown error"}`,
				};
			}
			const node = nodeResp.data?.node;
			const objType = node?.obj_type;
			const objToken = toStringOrUndefined(node?.obj_token);
			const nodeTitle = toStringOrUndefined(node?.title);
			if (objType !== "docx" || !objToken) {
				return {
					url: candidate.url,
					kind: candidate.kind,
					token: candidate.token,
					status: "unsupported",
					title: nodeTitle,
					detail: `wiki 节点类型 ${objType ?? "unknown"} 暂不支持预取。`,
				};
			}
			const fetched = await this.fetchDocxContent(objToken);
			if (!fetched.ok) {
				if (fetched.code === 99991672) {
					this.markScopeBlocked("docx");
				}
				return {
					url: candidate.url,
					kind: candidate.kind,
					token: candidate.token,
					status: "error",
					documentId: objToken,
					title: nodeTitle,
					detail: fetched.detail,
				};
			}
			const trimmed = truncateContent(fetched.content || "");
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "success",
				documentId: objToken,
				title: nodeTitle,
				content: trimmed.content,
				detail: trimmed.truncated
					? `文档内容已截断到 ${MAX_DOC_TEXT_CHARS} 字符。`
					: undefined,
			};
		} catch (error) {
			const info = extractFeishuApiErrorInfo(error);
			const detail =
				info.msg ||
				info.message ||
				(error instanceof Error ? error.message : String(error));
			if (isFeishuPermissionDenied(error)) {
				this.markScopeBlocked("wiki");
			}
			this.logger.warn({
				msg: "feishu wiki prefetch failed",
				token: candidate.token,
				error: detail,
			});
			return {
				url: candidate.url,
				kind: candidate.kind,
				token: candidate.token,
				status: "error",
				detail,
			};
		}
	}

	async resolve(text: string): Promise<FeishuDocResolveResult> {
		const candidates = this.collectCandidates(text);
		if (candidates.length === 0) {
			return {
				contextBlock: "",
				contextFiles: [],
			};
		}
		const results: DocPrefetchEntry[] = [];
		for (const candidate of candidates) {
			if (candidate.kind === "docx") {
				results.push(await this.resolveDocxCandidate(candidate));
				continue;
			}
			results.push(await this.resolveWikiCandidate(candidate));
		}
		return {
			contextBlock: this.buildContextBlock(results),
			contextFiles: this.buildContextFiles(results),
		};
	}

	async resolveContextBlock(text: string): Promise<string> {
		const result = await this.resolve(text);
		return result.contextBlock;
	}

	private buildContextBlock(entries: DocPrefetchEntry[]): string {
		if (!entries.length) return "";
		const lines: string[] = [
			"[系统上下文：飞书文档预取（已通过飞书 OpenAPI 处理）]",
			"- 约束：已预取的文档会写入本次任务沙盒本地文件，请优先 Read 本地文件。",
			"- 约束：不要再调用 WebFetch/WebSearch 访问飞书文档原链接。",
		];
		for (const [index, item] of entries.entries()) {
			lines.push(`链接 ${index + 1}:`);
			lines.push(`- 类型: ${item.kind}`);
			lines.push(`- token: ${item.token}`);
			if (item.documentId) {
				lines.push(`- document_id: ${item.documentId}`);
			}
			lines.push(`- 预取状态: ${item.status}`);
			if (item.detail) {
				lines.push(`- 详情: ${redactUrls(item.detail)}`);
			}
			if (item.content) {
				lines.push("- 结果: 已提取正文，将在任务启动时写入沙盒本地文件。");
			}
		}
		return lines.join("\n");
	}

	private buildContextFiles(
		entries: DocPrefetchEntry[],
	): FeishuResolvedContextFile[] {
		const files: FeishuResolvedContextFile[] = [];
		for (const [index, item] of entries.entries()) {
			if (!item.content) continue;
			const canonicalToken = item.documentId || item.token;
			const base = sanitizeFileNameSegment(
				item.title || `feishu_${item.kind}_${canonicalToken}`,
			);
			const safeBase = base || `feishu_${item.kind}_${index + 1}`;
			const suggestedName = `${safeBase}.md`;
			const title = item.title || `飞书文档 ${index + 1}`;
			files.push({
				title,
				suggestedName,
				content: item.content,
				metadata: {
					kind: item.kind,
					token: item.token,
					document_id: canonicalToken,
				},
			});
		}
		return files;
	}
}

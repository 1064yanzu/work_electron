import * as Lark from "@larksuiteoapi/node-sdk";
import { resolveWikiTokenToDocx } from "./tokenResolver";
import type { FeishuUserIdType } from "./types";

function toUserIdType(value: unknown): FeishuUserIdType | undefined {
	if (value === "open_id" || value === "union_id" || value === "user_id") {
		return value;
	}
	return undefined;
}

export class FeishuDocxApiAdapter {
	constructor(private readonly client: Lark.Client) {}

	async docxCreateDocument(input: {
		title?: string;
		folder_token?: string;
	}) {
		return this.client.docx.v1.document.create({
			data: {
				title: input.title,
				folder_token: input.folder_token,
			},
		});
	}

	async docxGetDocument(input: { document_id: string }) {
		return this.client.docx.v1.document.get({
			path: { document_id: input.document_id },
		});
	}

	async docxGetRawContent(input: { document_id: string; lang?: number }) {
		return this.client.docx.v1.document.rawContent({
			path: { document_id: input.document_id },
			params: typeof input.lang === "number" ? { lang: input.lang } : undefined,
		});
	}

	async docxListBlocks(input: {
		document_id: string;
		page_size?: number;
		page_token?: string;
		document_revision_id?: number;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlock.list({
			path: { document_id: input.document_id },
			params: {
				page_size: input.page_size,
				page_token: input.page_token,
				document_revision_id: input.document_revision_id,
				user_id_type: toUserIdType(input.user_id_type),
			},
		});
	}

	async docxGetBlock(input: {
		document_id: string;
		block_id: string;
		document_revision_id?: number;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlock.get({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				document_revision_id: input.document_revision_id,
				user_id_type: toUserIdType(input.user_id_type),
			},
		});
	}

	async docxGetChildren(input: {
		document_id: string;
		block_id: string;
		page_size?: number;
		page_token?: string;
		with_descendants?: boolean;
		document_revision_id?: number;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlockChildren.get({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				page_size: input.page_size,
				page_token: input.page_token,
				with_descendants: input.with_descendants,
				document_revision_id: input.document_revision_id,
				user_id_type: toUserIdType(input.user_id_type),
			},
		});
	}

	async docxCreateChildren(input: {
		document_id: string;
		block_id: string;
		children: unknown[];
		index?: number;
		document_revision_id?: number;
		client_token?: string;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlockChildren.create({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				document_revision_id: input.document_revision_id,
				client_token: input.client_token,
				user_id_type: toUserIdType(input.user_id_type),
			},
			data: {
				index: input.index,
				// 工具层已做基础参数校验，这里按 SDK 目标结构透传运行时 JSON。
				children: input.children as any[],
			},
		});
	}

	async docxCreateDescendant(input: {
		document_id: string;
		block_id: string;
		children_id: string[];
		descendants: unknown[];
		index?: number;
		document_revision_id?: number;
		client_token?: string;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlockDescendant.create({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				document_revision_id: input.document_revision_id,
				client_token: input.client_token,
				user_id_type: toUserIdType(input.user_id_type),
			},
			data: {
				children_id: input.children_id,
				index: input.index,
				// 工具层已做基础参数校验，这里按 SDK 目标结构透传运行时 JSON。
				descendants: input.descendants as any[],
			},
		});
	}

	async docxUpdateBlock(input: {
		document_id: string;
		block_id: string;
		request: Record<string, unknown>;
		document_revision_id?: number;
		client_token?: string;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlock.patch({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				document_revision_id: input.document_revision_id,
				client_token: input.client_token,
				user_id_type: toUserIdType(input.user_id_type),
			},
			data: input.request,
		});
	}

	async docxBatchUpdateBlocks(input: {
		document_id: string;
		requests: Array<Record<string, unknown>>;
		document_revision_id?: number;
		client_token?: string;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.documentBlock.batchUpdate({
			path: { document_id: input.document_id },
			params: {
				document_revision_id: input.document_revision_id,
				client_token: input.client_token,
				user_id_type: toUserIdType(input.user_id_type),
			},
			data: {
				requests: input.requests,
			},
		});
	}

	async docxDeleteChildrenRange(input: {
		document_id: string;
		block_id: string;
		start_index: number;
		end_index: number;
		document_revision_id?: number;
		client_token?: string;
	}) {
		return this.client.docx.v1.documentBlockChildren.batchDelete({
			path: {
				document_id: input.document_id,
				block_id: input.block_id,
			},
			params: {
				document_revision_id: input.document_revision_id,
				client_token: input.client_token,
			},
			data: {
				start_index: input.start_index,
				end_index: input.end_index,
			},
		});
	}

	async docxConvertContent(input: {
		content_type: "markdown" | "html";
		content: string;
		user_id_type?: string;
	}) {
		return this.client.docx.v1.document.convert({
			params: {
				user_id_type: toUserIdType(input.user_id_type),
			},
			data: {
				content_type: input.content_type,
				content: input.content,
			},
		});
	}

	async docsGetContentLegacy(input: {
		doc_token: string;
		doc_type?: "docx";
		content_type?: "markdown";
		lang?: "zh" | "en" | "ja";
	}) {
		return this.client.docs.v1.content.get({
			params: {
				doc_token: input.doc_token,
				doc_type: input.doc_type || "docx",
				content_type: input.content_type || "markdown",
				lang: input.lang,
			},
		});
	}

	async driveDeleteDocFile(input: { file_token: string }) {
		return this.client.drive.v1.file.delete({
			path: {
				file_token: input.file_token,
			},
			params: {
				type: "docx",
			},
		});
	}

	async wikiResolveToDocx(input: { token: string }) {
		return resolveWikiTokenToDocx(this.client, input.token);
	}
}

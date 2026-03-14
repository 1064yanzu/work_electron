import { createFeishuDocxClient } from "./clientFactory";
import { mapFeishuDocxToolError } from "./errorMapper";
import { FeishuDocxApiAdapter } from "./apiAdapter";
import { FEISHU_DOCX_TOOL_REGISTRY } from "./toolRegistry";
import type {
	FeishuDocxExecutionConfig,
	FeishuDocxToolDescriptor,
	FeishuDocxToolName,
} from "./types";

function asRecord(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("参数必须是 JSON 对象");
	}
	return input as Record<string, unknown>;
}

function optionalString(
	obj: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = obj[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function requiredString(obj: Record<string, unknown>, key: string): string {
	const value = optionalString(obj, key);
	if (!value) {
		throw new Error(`缺少必填字符串参数: ${key}`);
	}
	return value;
}

function optionalNumber(
	obj: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = obj[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	return undefined;
}

function requiredNumber(obj: Record<string, unknown>, key: string): number {
	const value = optionalNumber(obj, key);
	if (typeof value !== "number") {
		throw new Error(`缺少必填数字参数: ${key}`);
	}
	return value;
}

function requiredArray(
	obj: Record<string, unknown>,
	key: string,
): Array<Record<string, unknown>> {
	const value = obj[key];
	if (!Array.isArray(value)) {
		throw new Error(`缺少必填数组参数: ${key}`);
	}
	return value as Array<Record<string, unknown>>;
}

function requiredStringArray(
	obj: Record<string, unknown>,
	key: string,
): string[] {
	const value = obj[key];
	if (!Array.isArray(value)) {
		throw new Error(`缺少必填字符串数组参数: ${key}`);
	}
	const parsed = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	if (parsed.length === 0) {
		throw new Error(`参数 ${key} 至少包含一个字符串`);
	}
	return parsed;
}

function requiredObject(
	obj: Record<string, unknown>,
	key: string,
): Record<string, unknown> {
	const value = obj[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`缺少必填对象参数: ${key}`);
	}
	return value as Record<string, unknown>;
}

const WRITE_TOOLS = new Set<FeishuDocxToolName>([
	"docx_create_document",
	"docx_create_children",
	"docx_create_descendant",
	"docx_update_block",
	"docx_batch_update_blocks",
	"docx_delete_children_range",
	"drive_delete_doc_file",
]);

export class FeishuDocxToolExecutor {
	constructor(private readonly config: FeishuDocxExecutionConfig) {}

	listTools(): FeishuDocxToolDescriptor[] {
		return FEISHU_DOCX_TOOL_REGISTRY;
	}

	async executeTool(toolName: string, rawArgs: unknown): Promise<unknown> {
		const args = asRecord(rawArgs ?? {});
		const typedName = toolName as FeishuDocxToolName;
		const toolDef = FEISHU_DOCX_TOOL_REGISTRY.find(
			(item) => item.name === typedName,
		);
		if (!toolDef) {
			throw new Error(`未知工具: ${toolName}`);
		}

		if (WRITE_TOOLS.has(typedName) && !this.config.enableDocWriteOps) {
			throw new Error("当前配置禁止文档写操作（enableDocWriteOps=false）");
		}
		if (
			typedName === "drive_delete_doc_file" &&
			!this.config.enableDocFileDelete
		) {
			throw new Error("当前配置禁止文档级删除（enableDocFileDelete=false）");
		}
		if (
			typedName === "docs_get_content_legacy" &&
			!this.config.enableLegacyDocsRead
		) {
			throw new Error(
				"当前配置关闭旧 Docs 读取兼容（enableLegacyDocsRead=false）",
			);
		}

		const client = createFeishuDocxClient(this.config);
		const adapter = new FeishuDocxApiAdapter(client);
		try {
			switch (typedName) {
				case "docx_create_document":
					return adapter.docxCreateDocument({
						title: optionalString(args, "title"),
						folder_token: optionalString(args, "folder_token"),
					});
				case "docx_get_document":
					return adapter.docxGetDocument({
						document_id: requiredString(args, "document_id"),
					});
				case "docx_get_raw_content":
					return adapter.docxGetRawContent({
						document_id: requiredString(args, "document_id"),
						lang: optionalNumber(args, "lang"),
					});
				case "docx_list_blocks":
					return adapter.docxListBlocks({
						document_id: requiredString(args, "document_id"),
						page_size: optionalNumber(args, "page_size"),
						page_token: optionalString(args, "page_token"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_get_block":
					return adapter.docxGetBlock({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_get_children":
					return adapter.docxGetChildren({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						page_size: optionalNumber(args, "page_size"),
						page_token: optionalString(args, "page_token"),
						with_descendants:
							typeof args.with_descendants === "boolean"
								? args.with_descendants
								: undefined,
						document_revision_id: optionalNumber(args, "document_revision_id"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_create_children":
					return adapter.docxCreateChildren({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						children: requiredArray(args, "children"),
						index: optionalNumber(args, "index"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						client_token: optionalString(args, "client_token"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_create_descendant":
					return adapter.docxCreateDescendant({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						children_id: requiredStringArray(args, "children_id"),
						descendants: requiredArray(args, "descendants"),
						index: optionalNumber(args, "index"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						client_token: optionalString(args, "client_token"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_update_block":
					return adapter.docxUpdateBlock({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						request: requiredObject(args, "request"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						client_token: optionalString(args, "client_token"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_batch_update_blocks":
					return adapter.docxBatchUpdateBlocks({
						document_id: requiredString(args, "document_id"),
						requests: requiredArray(args, "requests"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						client_token: optionalString(args, "client_token"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				case "docx_delete_children_range":
					return adapter.docxDeleteChildrenRange({
						document_id: requiredString(args, "document_id"),
						block_id: requiredString(args, "block_id"),
						start_index: requiredNumber(args, "start_index"),
						end_index: requiredNumber(args, "end_index"),
						document_revision_id: optionalNumber(args, "document_revision_id"),
						client_token: optionalString(args, "client_token"),
					});
				case "docx_convert_content": {
					const contentType = optionalString(args, "content_type");
					if (contentType !== "markdown" && contentType !== "html") {
						throw new Error("content_type 仅支持 markdown 或 html");
					}
					return adapter.docxConvertContent({
						content_type: contentType,
						content: requiredString(args, "content"),
						user_id_type: optionalString(args, "user_id_type"),
					});
				}
				case "docs_get_content_legacy": {
					const lang = optionalString(args, "lang");
					if (lang && lang !== "zh" && lang !== "en" && lang !== "ja") {
						throw new Error("lang 仅支持 zh/en/ja");
					}
					return adapter.docsGetContentLegacy({
						doc_token: requiredString(args, "doc_token"),
						doc_type: "docx",
						content_type: "markdown",
						lang: lang as "zh" | "en" | "ja" | undefined,
					});
				}
				case "drive_delete_doc_file":
					return adapter.driveDeleteDocFile({
						file_token: requiredString(args, "file_token"),
					});
				case "wiki_resolve_to_docx":
					return adapter.wikiResolveToDocx({
						token: requiredString(args, "token"),
					});
				default:
					throw new Error(`未知工具: ${typedName}`);
			}
		} catch (error) {
			throw mapFeishuDocxToolError(error);
		}
	}
}

export type FeishuUserIdType = "open_id" | "union_id" | "user_id";

export type FeishuDocxToolName =
	| "docx_create_document"
	| "docx_get_document"
	| "docx_get_raw_content"
	| "docx_list_blocks"
	| "docx_get_block"
	| "docx_get_children"
	| "docx_create_children"
	| "docx_create_descendant"
	| "docx_update_block"
	| "docx_batch_update_blocks"
	| "docx_delete_children_range"
	| "docx_convert_content"
	| "docs_get_content_legacy"
	| "drive_delete_doc_file"
	| "wiki_resolve_to_docx";

export type FeishuDocxToolCategory = "read" | "write" | "danger";

export type FeishuDocxExecutionConfig = {
	appId: string;
	appSecret: string;
	domain: "feishu" | "lark";
	enableDocWriteOps: boolean;
	enableDocFileDelete: boolean;
	enableLegacyDocsRead: boolean;
};

export type FeishuDocxToolDescriptor = {
	name: FeishuDocxToolName;
	description: string;
	category: FeishuDocxToolCategory;
	inputSchema: Record<string, unknown>;
};

import type { FeishuDocxToolDescriptor } from "./types";

const DOC_ID_SCHEMA = {
	type: "string",
	description: "Docx 文档 ID（document_id）",
};

const BLOCK_ID_SCHEMA = {
	type: "string",
	description: "Block ID",
};

export const FEISHU_DOCX_TOOL_REGISTRY: FeishuDocxToolDescriptor[] = [
	{
		name: "docx_create_document",
		description: "创建 Docx 文档",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				folder_token: { type: "string" },
			},
		},
	},
	{
		name: "docx_get_document",
		description: "获取 Docx 文档基本信息",
		category: "read",
		inputSchema: {
			type: "object",
			properties: { document_id: DOC_ID_SCHEMA },
			required: ["document_id"],
		},
	},
	{
		name: "docx_get_raw_content",
		description: "获取 Docx 文档纯文本",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				lang: { type: "number" },
			},
			required: ["document_id"],
		},
	},
	{
		name: "docx_list_blocks",
		description: "获取文档所有块（分页）",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				page_size: { type: "number" },
				page_token: { type: "string" },
				document_revision_id: { type: "number" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id"],
		},
	},
	{
		name: "docx_get_block",
		description: "获取指定块",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				document_revision_id: { type: "number" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "block_id"],
		},
	},
	{
		name: "docx_get_children",
		description: "获取指定块子块",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				page_size: { type: "number" },
				page_token: { type: "string" },
				with_descendants: { type: "boolean" },
				document_revision_id: { type: "number" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "block_id"],
		},
	},
	{
		name: "docx_create_children",
		description: "在指定块下创建子块",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				children: { type: "array" },
				index: { type: "number" },
				document_revision_id: { type: "number" },
				client_token: { type: "string" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "block_id", "children"],
		},
	},
	{
		name: "docx_create_descendant",
		description: "创建嵌套块",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				children_id: { type: "array", items: { type: "string" } },
				descendants: { type: "array" },
				index: { type: "number" },
				document_revision_id: { type: "number" },
				client_token: { type: "string" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "block_id", "children_id", "descendants"],
		},
	},
	{
		name: "docx_update_block",
		description: "更新单个块内容",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				request: { type: "object" },
				document_revision_id: { type: "number" },
				client_token: { type: "string" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "block_id", "request"],
		},
	},
	{
		name: "docx_batch_update_blocks",
		description: "批量更新块",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				requests: { type: "array" },
				document_revision_id: { type: "number" },
				client_token: { type: "string" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["document_id", "requests"],
		},
	},
	{
		name: "docx_delete_children_range",
		description: "删除指定父块的子块区间",
		category: "write",
		inputSchema: {
			type: "object",
			properties: {
				document_id: DOC_ID_SCHEMA,
				block_id: BLOCK_ID_SCHEMA,
				start_index: { type: "number" },
				end_index: { type: "number" },
				document_revision_id: { type: "number" },
				client_token: { type: "string" },
			},
			required: ["document_id", "block_id", "start_index", "end_index"],
		},
	},
	{
		name: "docx_convert_content",
		description: "把 Markdown/HTML 转换为 Docx 块结构",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				content_type: { type: "string", enum: ["markdown", "html"] },
				content: { type: "string" },
				user_id_type: {
					type: "string",
					enum: ["open_id", "union_id", "user_id"],
				},
			},
			required: ["content_type", "content"],
		},
	},
	{
		name: "docs_get_content_legacy",
		description: "旧 Docs API 兼容读取正文",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				doc_token: { type: "string" },
				doc_type: { type: "string", enum: ["docx"] },
				content_type: { type: "string", enum: ["markdown"] },
				lang: { type: "string", enum: ["zh", "en", "ja"] },
			},
			required: ["doc_token"],
		},
	},
	{
		name: "drive_delete_doc_file",
		description: "删除 Docx 文件（高风险）",
		category: "danger",
		inputSchema: {
			type: "object",
			properties: {
				file_token: { type: "string" },
			},
			required: ["file_token"],
		},
	},
	{
		name: "wiki_resolve_to_docx",
		description: "把 Wiki token 解析为 Docx document_id",
		category: "read",
		inputSchema: {
			type: "object",
			properties: {
				token: { type: "string" },
			},
			required: ["token"],
		},
	},
];

// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：chatHistory（共 7 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	ChatHistoryMessageInput,
	ChatHistoryMessageRow,
	ChatHistorySessionInput,
	ChatHistorySessionRow,
} from "./common";

export interface ChatHistoryIpcSchema {
	// ==================
	// Chat 历史（SQLite 后端，F2）
	// ==================
	/** 列出全部会话（仅元数据 + 消息数 + 末条预览，不带全文） */
	chat_history_list_sessions: {
		input: Record<string, never>;
		output: { sessions: ChatHistorySessionRow[] };
	};
	/** 拉取单个会话的全部消息（按 seq 升序） */
	chat_history_get_messages: {
		input: { session_id: string };
		output: { messages: ChatHistoryMessageRow[] };
	};
	/**
	 * 批量 upsert 会话消息（单事务）。
	 * - `replace: true` 时先清空该会话已有消息再写入（整会话重排/替换）；
	 * - `delete_ids` 与 upsert 同批执行（用于截断式删除）。
	 */
	chat_history_save_messages: {
		input: {
			session_id: string;
			messages: ChatHistoryMessageInput[];
			replace?: boolean;
			delete_ids?: string[];
		};
		output: { success: boolean; saved: number; deleted: number };
	};
	/** upsert 会话元数据行 */
	chat_history_upsert_session: {
		input: ChatHistorySessionInput;
		output: { success: boolean };
	};
	/** 删除会话（消息级联删除） */
	chat_history_delete_session: {
		input: { session_id: string };
		output: { success: boolean };
	};
	/** localStorage → SQLite 分片导入（幂等，INSERT OR REPLACE） */
	chat_history_migrate_import: {
		input: {
			sessions: Array<
				ChatHistorySessionInput & { messages: ChatHistoryMessageInput[] }
			>;
		};
		output: {
			success: boolean;
			imported_sessions: number;
			imported_messages: number;
		};
	};
	/** 消息全文搜索（SQL LIKE），按时间倒序 */
	chat_history_search: {
		input: { q: string; limit?: number };
		output: {
			results: Array<{
				session_id: string;
				message_id: string;
				role: string;
				snippet: string;
				created_at: number;
			}>;
		};
	};
}

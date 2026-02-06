/**
 * 聊天数据压缩和精简工具
 * 使用 LZ-String 压缩 JSON 数据，并精简存储结构
 */

import LZString from "lz-string";
import type {
	ChatMessage,
	ChatMessageBlock,
	ChatSession,
	ChatState,
} from "./types";

// 存储版本号
export const STORAGE_VERSION = 2;

// ============ 精简数据类型 ============

// 工具调用状态缩写映射

/** 精简存储的消息块 */
type CompactBlock =
	| { t: "text"; c: string } // text content
	| { t: "img"; p: string; l?: string } // image path, label
	| {
			t: "th";
			l: string;
			c: string;
			ph?: string;
			d?: number;
			s?: string;
			m?: string;
			tr?: boolean;
	  } // thought: label, content, phase, duration
	| { t: "tl"; id: string } // task_list
	| { t: "at"; id: string } // agent_task
	| { t: "tc"; id: string; tid: string; n?: string; s?: string } // tool_call: id, taskId, name, status
	| { t: "fu"; f: string; tp: "c" | "u"; a: number; d: number } // file_update
	| {
			t: "sk";
			n: string; // skillName
			p: string; // skillPath
			s: string; // status
			st: any[]; // steps
			lf: any[]; // loadedFiles
			sc?: string; // detectedScene
	  }; // skill_execution

/** 精简存储的消息元数据 */
interface CompactMetadata {
	aid?: string; // agentMessageId
	tcIds?: string[]; // toolCallIds for lazy loading
	fus?: Array<{ f: string; t: "c" | "u"; a: number; d: number }>; // fileUpdates
	bs?: CompactBlock[]; // blocks
}

/** 精简存储的消息 */
interface CompactMessage {
	id: string;
	r: "u" | "a" | "s" | "t"; // role: user/assistant/system/trace
	c: string; // content
	ts: number; // timestamp
	m?: string; // model
	md?: CompactMetadata; // metadata
}

/** 精简存储的会话 */
interface CompactSession {
	id: string;
	t: string; // title
	ms: CompactMessage[]; // messages
	ca: number; // createdAt
	ua: number; // updatedAt
	m?: string; // model
	asid?: string; // agentSessionId
	ssid?: string; // sdkSessionId
}

/** 精简存储的状态 */
interface CompactChatState {
	v: number; // version
	ss: CompactSession[]; // sessions
	aid: string | null; // activeSessionId
}

// ============ 压缩/解压函数 ============

/**
 * 压缩字符串数据
 */
export function compressData(data: string): string {
	return LZString.compressToUTF16(data);
}

/**
 * 解压字符串数据
 */
export function decompressData(compressed: string): string {
	const result = LZString.decompressFromUTF16(compressed);
	if (result === null) {
		throw new Error("Failed to decompress data");
	}
	return result;
}

/**
 * 检测是否为压缩格式
 * 压缩数据通常以特定字符开头，而 JSON 以 { 或 [ 开头
 */
export function isCompressedFormat(data: string): boolean {
	if (!data || data.length === 0) return false;
	const firstChar = data.charAt(0);
	// JSON 格式以 { 或 [ 开头
	return firstChar !== "{" && firstChar !== "[";
}

// ============ 数据精简函数 ============

const ROLE_MAP: Record<string, "u" | "a" | "s" | "t"> = {
	user: "u",
	assistant: "a",
	system: "s",
	trace: "t",
};

const ROLE_REVERSE_MAP: Record<
	string,
	"user" | "assistant" | "system" | "trace"
> = {
	u: "user",
	a: "assistant",
	s: "system",
	t: "trace",
};

// STATUS_REVERSE_MAP 用于还原状态

const STATUS_REVERSE_MAP: Record<
	string,
	"pending" | "running" | "completed" | "error" | "cancelled"
> = {
	p: "pending",
	r: "running",
	c: "completed",
	e: "error",
	x: "cancelled",
};

/**
 * 精简消息块
 */
function compactBlock(block: ChatMessageBlock): CompactBlock {
	switch (block.type) {
		case "text":
			return { t: "text", c: block.text };
		case "image":
			return { t: "img", p: block.path, l: block.title };
		case "thought":
			return {
				t: "th",
				l: block.title,
				c: block.content,
				ph: block.phase,
				d: block.durationMs,
				s: block.source,
				m: block.model,
				tr: block.truncated,
			};
		case "task_list":
			return { t: "tl", id: block.taskId };
		case "agent_task":
			return { t: "at", id: block.taskId };
		case "tool_call":
			// 工具调用只保留必要信息，详情从后端加载
			return {
				t: "tc",
				id: block.toolCallId,
				tid: block.taskId,
				n: block.name,
				s: block.status,
			};
		case "file_update":
			return {
				t: "fu",
				f: block.update.fileName,
				tp: block.update.type === "create" ? "c" : "u",
				a: block.update.additions,
				d: block.update.deletions,
			};
		case "skill_execution":
			return {
				t: "sk",
				n: block.skillName,
				p: block.skillPath,
				s: block.status,
				st: block.steps,
				lf: block.loadedFiles,
				sc: block.detectedScene,
			};
	}
}

/**
 * 还原消息块
 */
function expandBlock(compact: CompactBlock): ChatMessageBlock {
	switch (compact.t) {
		case "text":
			return { type: "text", text: compact.c };
		case "img":
			return { type: "image", path: compact.p, title: compact.l };
		case "th":
			return {
				type: "thought",
				title: compact.l,
				content: compact.c,
				phase: compact.ph,
				durationMs: compact.d,
				source: compact.s,
				model: compact.m,
				truncated: compact.tr,
			};
		case "tl":
			return { type: "task_list", taskId: compact.id };
		case "at":
			return { type: "agent_task", taskId: compact.id };
		case "tc":
			return {
				type: "tool_call",
				toolCallId: compact.id,
				taskId: compact.tid,
				name: compact.n,
				status: compact.s ? STATUS_REVERSE_MAP[compact.s] : undefined,
			};
		case "fu":
			return {
				type: "file_update",
				update: {
					fileName: compact.f,
					type: compact.tp === "c" ? "create" : "update",
					additions: compact.a,
					deletions: compact.d,
				},
			};
		case "sk":
			return {
				type: "skill_execution",
				skillName: compact.n,
				skillPath: compact.p,
				status: compact.s,
				steps: compact.st,
				loadedFiles: compact.lf,
				detectedScene: compact.sc,
			};
	}
}

/**
 * 精简消息
 */
function compactMessage(msg: ChatMessage): CompactMessage {
	const compact: CompactMessage = {
		id: msg.id,
		r: ROLE_MAP[msg.role] || "u",
		c: msg.content,
		ts: msg.timestamp,
	};

	if (msg.model) compact.m = msg.model;

	if (msg.metadata) {
		const md: CompactMetadata = {};
		if (msg.metadata.agentMessageId) md.aid = msg.metadata.agentMessageId;

		// 精简 fileUpdates
		if (msg.metadata.fileUpdates && msg.metadata.fileUpdates.length > 0) {
			md.fus = msg.metadata.fileUpdates.map((fu) => ({
				f: fu.fileName,
				t: fu.type === "create" ? ("c" as const) : ("u" as const),
				a: fu.additions,
				d: fu.deletions,
			}));
		}

		// 精简 blocks
		if (msg.metadata.blocks && msg.metadata.blocks.length > 0) {
			md.bs = msg.metadata.blocks.map(compactBlock);
		}

		if (Object.keys(md).length > 0) {
			compact.md = md;
		}
	}

	return compact;
}

/**
 * 还原消息
 */
function expandMessage(compact: CompactMessage): ChatMessage {
	const msg: ChatMessage = {
		id: compact.id,
		role: ROLE_REVERSE_MAP[compact.r] || "user",
		content: compact.c,
		timestamp: compact.ts,
	};

	if (compact.m) msg.model = compact.m;

	if (compact.md) {
		const metadata: ChatMessage["metadata"] = {};
		if (compact.md.aid) metadata.agentMessageId = compact.md.aid;

		// 还原 fileUpdates
		if (compact.md.fus && compact.md.fus.length > 0) {
			metadata.fileUpdates = compact.md.fus.map((fu) => ({
				fileName: fu.f,
				type: fu.t === "c" ? ("create" as const) : ("update" as const),
				additions: fu.a,
				deletions: fu.d,
			}));
		}

		// 还原 blocks
		if (compact.md.bs && compact.md.bs.length > 0) {
			metadata.blocks = compact.md.bs.map(expandBlock);
		}

		if (Object.keys(metadata).length > 0) {
			msg.metadata = metadata;
		}
	}

	return msg;
}

/**
 * 精简会话
 */
function compactSession(session: ChatSession): CompactSession {
	const compact: CompactSession = {
		id: session.id,
		t: session.title,
		ms: session.messages.map(compactMessage),
		ca: session.createdAt,
		ua: session.updatedAt,
	};

	if (session.model) compact.m = session.model;
	if (session.agentSessionId) compact.asid = session.agentSessionId;
	if (session.sdkSessionId) compact.ssid = session.sdkSessionId;

	return compact;
}

/**
 * 还原会话
 */
function expandSession(compact: CompactSession): ChatSession {
	return {
		id: compact.id,
		title: compact.t,
		messages: compact.ms.map(expandMessage),
		createdAt: compact.ca,
		updatedAt: compact.ua,
		model: compact.m,
		agentSessionId: compact.asid,
		sdkSessionId: compact.ssid,
	};
}

/**
 * 精简整个状态用于存储
 */
export function compactChatState(state: ChatState): CompactChatState {
	return {
		v: STORAGE_VERSION,
		ss: state.sessions.map(compactSession),
		aid: state.activeSessionId,
	};
}

/**
 * 从精简格式还原状态
 */
export function expandChatState(
	compact: CompactChatState,
): Pick<ChatState, "sessions" | "activeSessionId"> {
	return {
		sessions: compact.ss.map(expandSession),
		activeSessionId: compact.aid,
	};
}

// ============ V1 数据迁移 ============

interface V1Data {
	sessions: ChatSession[];
	activeSessionId: string | null;
}

/**
 * 检测并迁移 V1 数据
 */
export function migrateFromV1(oldData: V1Data): CompactChatState {
	console.log("[compression] Migrating from V1 format...");
	return {
		v: STORAGE_VERSION,
		ss: oldData.sessions.map(compactSession),
		aid: oldData.activeSessionId,
	};
}

/**
 * 安全解析存储数据，自动处理格式检测和迁移
 */
export function parseStoredData(
	rawData: string,
): Pick<ChatState, "sessions" | "activeSessionId"> | null {
	try {
		let jsonStr: string;
		let parsedData: any;

		if (isCompressedFormat(rawData)) {
			// 新的压缩格式
			jsonStr = decompressData(rawData);
			parsedData = JSON.parse(jsonStr);

			if (parsedData.v === STORAGE_VERSION) {
				// 当前版本
				return expandChatState(parsedData as CompactChatState);
			} else if (parsedData.v && parsedData.v < STORAGE_VERSION) {
				// 旧版本压缩格式，需要迁移
				console.log(
					`[compression] Migrating from V${parsedData.v} to V${STORAGE_VERSION}`,
				);
				return expandChatState(parsedData as CompactChatState);
			}
		} else {
			// 旧的 JSON 格式 (V1)
			parsedData = JSON.parse(rawData);

			if (parsedData.sessions) {
				// V1 格式，需要迁移
				const migrated = migrateFromV1(parsedData as V1Data);
				return expandChatState(migrated);
			}
		}

		return null;
	} catch (e) {
		console.error("[compression] Failed to parse stored data:", e);
		return null;
	}
}

/**
 * 序列化并压缩状态用于存储
 */
export function serializeForStorage(state: ChatState): string {
	const compact = compactChatState(state);
	const json = JSON.stringify(compact);
	return compressData(json);
}

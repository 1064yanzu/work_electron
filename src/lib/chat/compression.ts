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
export const STORAGE_VERSION = 3;

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
	| {
			t: "tc";
			id: string;
			tid: string;
			n?: string;
			tt?: string;
			s?: string;
			i?: any;
			o?: any;
			e?: string;
	  } // tool_call: id, taskId, name, toolType, status, input, output, error
	| {
			t: "fu";
			f: string;
			p?: string;
			tp: "c" | "u";
			a: number;
			d: number;
			s?: "r" | "c" | "e";
			tcid?: string;
	  } // file_update
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
	fus?: Array<{
		f: string;
		p?: string;
		t: "c" | "u";
		a: number;
		d: number;
		s?: "r" | "c" | "e";
		tcid?: string;
	}>; // fileUpdates
	bs?: CompactBlock[]; // blocks
	tr?: { t: "a" | "tc"; tid: string; tcid?: string }; // trace
	tid?: string; // taskId
	sd?: string; // sandboxDir
	af?: Array<{ t: string; p: string; k?: "f" | "d"; s?: number }>; // attachedFiles
	tu?: {
		p: number;
		c: number;
		t: number;
		cr?: number;
		cc?: number;
		cost?: number;
	}; // tokenUsage
	x?: Record<string, unknown>; // extra metadata (forward-compatible)
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
	cwd?: string; // working directory
	p?: boolean; // pinned
	ar?: boolean; // archived
	src?: {
		t: "l" | "r"; // local / remote
		rsid?: string; // remoteSessionId
		ch?: string; // channelId
		pn?: string; // peerName
		pid?: string; // peerId
	};
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

const STATUS_MAP: Record<
	"pending" | "running" | "completed" | "error" | "cancelled",
	string
> = {
	pending: "p",
	running: "r",
	completed: "c",
	error: "e",
	cancelled: "x",
};

const FILE_UPDATE_STATUS_MAP = {
	running: "r",
	completed: "c",
	error: "e",
} as const;

const FILE_UPDATE_STATUS_REVERSE_MAP = {
	r: "running",
	c: "completed",
	e: "error",
} as const;

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
			// 工具调用保留可回放必要信息，避免历史会话回显丢失
			return {
				t: "tc",
				id: block.toolCallId,
				tid: block.taskId,
				n: block.name,
				tt: block.toolType,
				s: block.status ? STATUS_MAP[block.status] || block.status : undefined,
				i: block.input,
				o: block.output,
				e: block.error,
			};
		case "file_update":
			return {
				t: "fu",
				f: block.update.fileName,
				p: block.update.filePath,
				tp: block.update.type === "create" ? "c" : "u",
				a: block.update.additions,
				d: block.update.deletions,
				s: block.update.status
					? FILE_UPDATE_STATUS_MAP[block.update.status]
					: undefined,
				tcid: block.update.toolCallId,
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
				toolType: compact.tt,
				status: compact.s
					? STATUS_REVERSE_MAP[compact.s] ||
						(compact.s as
							| "pending"
							| "running"
							| "completed"
							| "error"
							| "cancelled")
					: undefined,
				input: compact.i,
				output: compact.o,
				error: compact.e,
			};
		case "fu":
			return {
				type: "file_update",
				update: {
					fileName: compact.f,
					filePath: compact.p,
					type: compact.tp === "c" ? "create" : "update",
					additions: compact.a,
					deletions: compact.d,
					status: compact.s
						? FILE_UPDATE_STATUS_REVERSE_MAP[compact.s]
						: undefined,
					toolCallId: compact.tcid,
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
				p: fu.filePath,
				t: fu.type === "create" ? ("c" as const) : ("u" as const),
				a: fu.additions,
				d: fu.deletions,
				s: fu.status ? FILE_UPDATE_STATUS_MAP[fu.status] : undefined,
				tcid: fu.toolCallId,
			}));
		}

		// 精简 blocks
		if (msg.metadata.blocks && msg.metadata.blocks.length > 0) {
			md.bs = msg.metadata.blocks.map(compactBlock);
		}

		if (msg.metadata.trace) {
			if (msg.metadata.trace.type === "agent_task") {
				md.tr = { t: "a", tid: msg.metadata.trace.taskId };
			} else if (msg.metadata.trace.type === "tool_call") {
				md.tr = {
					t: "tc",
					tid: msg.metadata.trace.taskId,
					tcid: msg.metadata.trace.toolCallId,
				};
			}
		}

		if (msg.metadata.taskId) md.tid = msg.metadata.taskId;
		if (msg.metadata.sandboxDir) md.sd = msg.metadata.sandboxDir;

		if (msg.metadata.attachedFiles && msg.metadata.attachedFiles.length > 0) {
			md.af = msg.metadata.attachedFiles.map((f) => ({
				t: f.title,
				p: f.path,
				k: f.type === "document" ? "d" : f.type === "file" ? "f" : undefined,
				s: typeof f.size === "number" ? f.size : undefined,
			}));
		}

		if (msg.metadata.tokenUsage) {
			md.tu = {
				p: msg.metadata.tokenUsage.promptTokens,
				c: msg.metadata.tokenUsage.completionTokens,
				t: msg.metadata.tokenUsage.totalTokens,
				cr: msg.metadata.tokenUsage.cacheReadInputTokens || undefined,
				cc: msg.metadata.tokenUsage.cacheCreationInputTokens || undefined,
				cost: msg.metadata.tokenUsage.costUsd || undefined,
			};
		}

		const {
			agentMessageId: _agentMessageId,
			fileUpdates: _fileUpdates,
			blocks: _blocks,
			trace: _trace,
			taskId: _taskId,
			sandboxDir: _sandboxDir,
			attachedFiles: _attachedFiles,
			tokenUsage: _tokenUsage,
			...rest
		} = msg.metadata as Record<string, unknown>;

		if (Object.keys(rest).length > 0) {
			md.x = rest;
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

		if (compact.md.tr) {
			if (compact.md.tr.t === "a") {
				metadata.trace = { type: "agent_task", taskId: compact.md.tr.tid };
			} else if (compact.md.tr.t === "tc" && compact.md.tr.tcid) {
				metadata.trace = {
					type: "tool_call",
					taskId: compact.md.tr.tid,
					toolCallId: compact.md.tr.tcid,
				};
			}
		}

		if (compact.md.tid) metadata.taskId = compact.md.tid;
		if (compact.md.sd) metadata.sandboxDir = compact.md.sd;

		if (compact.md.af && compact.md.af.length > 0) {
			metadata.attachedFiles = compact.md.af.map((f) => ({
				title: f.t,
				path: f.p,
				type: f.k === "d" ? "document" : f.k === "f" ? "file" : undefined,
				size: typeof f.s === "number" ? f.s : undefined,
			}));
		}

		if (compact.md.tu) {
			metadata.tokenUsage = {
				promptTokens: compact.md.tu.p,
				completionTokens: compact.md.tu.c,
				totalTokens: compact.md.tu.t,
				cacheReadInputTokens: compact.md.tu.cr,
				cacheCreationInputTokens: compact.md.tu.cc,
				costUsd: compact.md.tu.cost,
			};
		}

		// 还原 fileUpdates
		if (compact.md.fus && compact.md.fus.length > 0) {
			metadata.fileUpdates = compact.md.fus.map((fu) => ({
				fileName: fu.f,
				filePath: fu.p,
				type: fu.t === "c" ? ("create" as const) : ("update" as const),
				additions: fu.a,
				deletions: fu.d,
				status: fu.s ? FILE_UPDATE_STATUS_REVERSE_MAP[fu.s] : undefined,
				toolCallId: fu.tcid,
			}));
		}

		// 还原 blocks
		if (compact.md.bs && compact.md.bs.length > 0) {
			metadata.blocks = compact.md.bs.map(expandBlock);
		}

		if (compact.md.x && typeof compact.md.x === "object") {
			Object.assign(metadata, compact.md.x);
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
	if (session.cwd) compact.cwd = session.cwd;
	if (session.isPinned) compact.p = true;
	if (session.isArchived) compact.ar = true;
	if (session.threadSource) {
		compact.src = {
			t: session.threadSource.type === "remote" ? "r" : "l",
			rsid: session.threadSource.remoteSessionId,
			ch: session.threadSource.channelId,
			pn: session.threadSource.peerName,
			pid: session.threadSource.peerId,
		};
	}

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
		cwd: compact.cwd,
		isPinned: compact.p,
		isArchived: compact.ar,
		threadSource: compact.src
			? {
					type: compact.src.t === "r" ? "remote" : "local",
					remoteSessionId: compact.src.rsid,
					channelId: compact.src.ch,
					peerName: compact.src.pn,
					peerId: compact.src.pid,
				}
			: undefined,
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

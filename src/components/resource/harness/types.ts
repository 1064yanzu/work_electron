/**
 * 会话中枢（HarnessView）的共享类型定义。
 *
 * 后端行类型（HarnessSessionRow 等）直接复用 `lib/api/harnessHub` 的导出，
 * 这里只定义纯前端的视图状态类型。
 */
import type {
	HarnessHandoffPackage,
	HarnessMessageRow,
	HarnessSessionRow,
} from "../../../lib/api/harnessHub";

/** harness-ingest-progress 事件负载 */
export interface IngestProgressPayload {
	phase: "scanning" | "parsing" | "done";
	/** phase 为 "done" 时后端发 null（此时已不属于任何单一 harness） */
	harness: string | null;
	processed: number;
	total: number;
	updated: number;
	skipped_lines: number;
}

/** harness-handoff-event 事件负载 */
export interface HandoffProgressPayload {
	phase: "loading" | "mapping" | "reducing" | "done";
	current: number;
	total: number;
}

/** harness-session-updated 事件负载 */
export interface SessionUpdatedPayload {
	harness: string;
	origin_path: string;
}

/** 迁移目标：App 内 pty 起的 CLI / 内嵌 Web 站点 / 本应用 Copilot */
export interface MigrateTarget {
	kind: "cli" | "web" | "app";
	/** web 时为站点 id，其余等同 harness */
	id: string;
	harness: string;
	label: string;
}

/** HANDOFF 蒸馏 + 迁移的流程状态 */
export interface HandoffFlow {
	session: HarnessSessionRow;
	target: MigrateTarget;
	stage: "distilling" | "preview" | "launching";
	progress: HandoffProgressPayload | null;
	handoffId: string | null;
	pkg: HarnessHandoffPackage | null;
	markdown: string;
	error: string | null;
}

/** 转录覆盖层状态 */
export interface TranscriptState {
	sessionId: string;
	session: HarnessSessionRow | null;
	messages: HarnessMessageRow[];
	loading: boolean;
	error: string | null;
}

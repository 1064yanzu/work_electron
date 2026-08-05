/**
 * 蒸馏 + Handoff 引擎 —— 把一段长转录压缩成结构化 HANDOFF 上下文包。
 *
 * 核心判断：跨 harness 迁移真正要搬的不是「对话逐字稿」，而是「脑中状态」——
 * 任务目标 / 已完成 / 进行中 / 关键决策与踩坑 / 涉及文件 / 下一步。
 * 代码改动本来就在工作目录磁盘上，天然共享，不需要搬。
 *
 * 超长转录走 map-reduce：先分段各自摘要（map），再把段摘要合成最终包（reduce）。
 * 原始转录完整保留在 harness_messages（FTS 可查），HANDOFF 里附可检索的会话 id，
 * 目标端要细节可回查。
 */
import type { DbContext } from "../db/client";
import { invokeLlm } from "../llm/invoke";
import { createLogger } from "../logging/logger";
import type { CanonicalMessage, HandoffPackage, HarnessKind } from "./types";

const logger = createLogger();

/** 单段送入 LLM 的字符上限（约 15k token，给各家模型留足余量）。 */
const SEGMENT_CHAR_LIMIT = 60_000;

/** 参与蒸馏的最大消息数（从尾部倒取——近期上下文比开头更相关）。 */
const MAX_MESSAGES = 400;

const SYSTEM_PROMPT = `你是一个「AI 编码会话交接」专家。你的任务是把一段 AI 编码助手的会话转录，
压缩成让**另一个 AI 助手**能无缝接手的交接包。

要求：
1. 只保留接手者真正需要的信息，丢弃寒暄、重复试错的中间过程、已被推翻的方案。
2. 「关键决策与踩坑」最重要——记录为什么这样做、试过什么失败了，避免接手者重蹈覆辙。
3. 「下一步」必须具体可执行，而不是"继续完成任务"这种空话。
4. 涉及文件用仓库相对路径或绝对路径原样保留。
5. 用中文输出。

严格按以下 JSON 格式输出，不要有任何额外文字或 markdown 代码块标记：
{
  "goal": "一句话说清这个会话要达成什么",
  "done": ["已完成的事项，每条一句"],
  "inProgress": ["正在做但没做完的事项"],
  "decisions": ["关键决策与踩坑，格式：结论（原因/教训）"],
  "files": ["涉及的文件路径"],
  "nextSteps": ["接手者应该立刻做的下一步，按优先级排序"]
}`;

const SEGMENT_PROMPT = `你在为一段超长会话做分段摘要（这是第 {index}/{total} 段）。
请提炼本段中的：任务目标线索、已完成的事、关键决策与踩坑、涉及文件、未完成事项。
用紧凑的中文要点列出，不要输出 JSON，不要客套。`;

/** 把 canonical 消息渲染成送 LLM 的转录文本。 */
function renderTranscript(messages: CanonicalMessage[]): string {
	const lines: string[] = [];
	for (const m of messages) {
		const roleLabel =
			m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : "系统";
		const text = m.content.trim();
		if (!text) continue;
		lines.push(`【${roleLabel}】${text}`);
	}
	return lines.join("\n\n");
}

/** 按字符上限切分转录（在消息边界切，不切碎单条消息）。 */
function segmentTranscript(messages: CanonicalMessage[]): string[] {
	const segments: string[] = [];
	let current: CanonicalMessage[] = [];
	let size = 0;
	for (const m of messages) {
		const len = m.content.length;
		if (size + len > SEGMENT_CHAR_LIMIT && current.length) {
			segments.push(renderTranscript(current));
			current = [];
			size = 0;
		}
		current.push(m);
		size += len;
	}
	if (current.length) segments.push(renderTranscript(current));
	return segments;
}

/** 容错解析 LLM 返回的 JSON（可能被包在 markdown 代码块里）。 */
function parseHandoffJson(raw: string): Partial<HandoffPackage> | null {
	let text = raw.trim();
	// 剥 ```json ... ``` 包裹
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence?.[1]) text = fence[1].trim();
	// 截取第一个 { 到最后一个 }
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start >= 0 && end > start) text = text.slice(start, end + 1);
	try {
		const parsed = JSON.parse(text) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		return parsed as Partial<HandoffPackage>;
	} catch {
		return null;
	}
}

/** 保证是字符串数组（LLM 偶尔会返回字符串而非数组）。 */
function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
			.filter(Boolean);
	}
	if (typeof value === "string" && value.trim()) {
		return value
			.split("\n")
			.map((s) => s.replace(/^[-*\d.\s]+/, "").trim())
			.filter(Boolean);
	}
	return [];
}

/** 把结构化包渲染成最终 markdown。 */
export function renderHandoffMarkdown(
	pkg: Omit<HandoffPackage, "markdown">,
	ctx: {
		sourceHarness: HarnessKind;
		targetHarness: HarnessKind;
		sessionId: string;
		title: string | null;
		cwd: string | null;
	},
): string {
	const section = (heading: string, items: string[]): string => {
		if (!items.length) return "";
		return `\n## ${heading}\n\n${items.map((i) => `- ${i}`).join("\n")}\n`;
	};

	const header = [
		"# 会话交接包（HANDOFF）",
		"",
		`> 来源：${ctx.sourceHarness}${ctx.title ? ` · ${ctx.title}` : ""}`,
		`> 目标：${ctx.targetHarness}`,
		ctx.cwd ? `> 工作目录：${ctx.cwd}` : "",
		`> 可检索的原始会话 id：\`${ctx.sessionId}\`（完整转录已存档，需要细节可回查）`,
		"",
		"## 任务目标",
		"",
		pkg.goal || "（未能提炼出明确目标）",
	]
		.filter((l) => l !== "")
		.join("\n");

	return [
		header,
		section("已完成", pkg.done),
		section("进行中", pkg.inProgress),
		section("关键决策与踩坑", pkg.decisions),
		section("涉及文件", pkg.files),
		section("下一步", pkg.nextSteps),
	]
		.join("")
		.trim();
}

/** 蒸馏进度回调。 */
export type DistillProgress = (p: {
	phase: "loading" | "mapping" | "reducing" | "done";
	current: number;
	total: number;
}) => void;

/**
 * 从 canonical 表读取会话转录并蒸馏成 HANDOFF 包。
 *
 * @param model 蒸馏所用模型；传空串走用户当前活跃模型
 */
export async function distillHandoff(
	db: DbContext,
	options: {
		sessionId: string;
		targetHarness: HarnessKind;
		model?: string;
		onProgress?: DistillProgress;
	},
): Promise<HandoffPackage> {
	const { sessionId, targetHarness, model = "", onProgress } = options;
	onProgress?.({ phase: "loading", current: 0, total: 1 });

	const sessionRes = await db.client.execute({
		sql: `SELECT id, harness, title, cwd, message_count FROM harness_sessions WHERE id = ?`,
		args: [sessionId],
	});
	const sessionRow = sessionRes.rows[0] as Record<string, unknown> | undefined;
	if (!sessionRow) {
		throw new Error(`会话不存在：${sessionId}`);
	}
	const sourceHarness = (sessionRow.harness as HarnessKind) ?? "claude-code";
	const title = (sessionRow.title as string) ?? null;
	const cwd = (sessionRow.cwd as string) ?? null;

	// 取尾部 MAX_MESSAGES 条（近期上下文更相关），再正序还原
	const msgRes = await db.client.execute({
		sql: `SELECT role, content, seq, created_at FROM harness_messages
		      WHERE session_id = ? ORDER BY seq DESC LIMIT ?`,
		args: [sessionId, MAX_MESSAGES],
	});
	const messages: CanonicalMessage[] = msgRes.rows
		.map((r0) => {
			const r = r0 as Record<string, unknown>;
			return {
				id: "",
				role: (r.role as CanonicalMessage["role"]) ?? "assistant",
				content: (r.content as string) ?? "",
				seq: Number(r.seq ?? 0),
				createdAt: Number(r.created_at ?? 0),
			};
		})
		.filter((m) => m.content.trim())
		.reverse();

	if (!messages.length) {
		throw new Error("该会话没有可蒸馏的转录内容");
	}

	const segments = segmentTranscript(messages);
	let reduceInput: string;

	if (segments.length === 1) {
		reduceInput = segments[0];
	} else {
		// map 阶段：逐段摘要
		const summaries: string[] = [];
		for (let i = 0; i < segments.length; i++) {
			onProgress?.({
				phase: "mapping",
				current: i + 1,
				total: segments.length,
			});
			try {
				const r = await invokeLlm(db, {
					model,
					prompt: `${SEGMENT_PROMPT.replace("{index}", String(i + 1)).replace(
						"{total}",
						String(segments.length),
					)}\n\n---\n\n${segments[i]}`,
					temperature: 0.3,
				});
				summaries.push(`【第 ${i + 1} 段】\n${r.content.trim()}`);
			} catch (error) {
				logger.warn({
					msg: "handoff 分段摘要失败，跳过该段",
					index: i,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (!summaries.length) {
			throw new Error("分段摘要全部失败，无法生成交接包");
		}
		reduceInput = summaries.join("\n\n");
	}

	// reduce 阶段：合成结构化包
	onProgress?.({ phase: "reducing", current: 1, total: 1 });
	const result = await invokeLlm(db, {
		model,
		prompt: `请把以下${segments.length > 1 ? "分段摘要" : "会话转录"}压缩成交接包 JSON。

接手方是「${targetHarness}」，${cwd ? `工作目录 ${cwd}。` : ""}

---

${reduceInput}`,
		context: [SYSTEM_PROMPT],
		temperature: 0.3,
	});

	const parsed = parseHandoffJson(result.content);
	if (!parsed) {
		logger.warn({
			msg: "handoff JSON 解析失败，回落纯文本包",
			preview: result.content.slice(0, 200),
		});
	}

	const pkg: Omit<HandoffPackage, "markdown"> = {
		goal:
			typeof parsed?.goal === "string" && parsed.goal.trim()
				? parsed.goal.trim()
				: title || "（未能提炼出明确目标）",
		done: asStringArray(parsed?.done),
		inProgress: asStringArray(parsed?.inProgress),
		decisions: asStringArray(parsed?.decisions),
		files: asStringArray(parsed?.files),
		nextSteps: asStringArray(parsed?.nextSteps),
	};

	// JSON 全解析失败时，把原始回答塞进决策区，至少不丢信息
	if (
		!parsed &&
		result.content.trim() &&
		!pkg.done.length &&
		!pkg.nextSteps.length
	) {
		pkg.decisions = [result.content.trim().slice(0, 4000)];
	}

	onProgress?.({ phase: "done", current: 1, total: 1 });

	return {
		...pkg,
		markdown: renderHandoffMarkdown(pkg, {
			sourceHarness,
			targetHarness,
			sessionId,
			title,
			cwd,
		}),
	};
}

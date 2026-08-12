/**
 * 原文接力 + 接力档位自动选择。
 *
 * 一期把「接力」等同于「LLM 蒸馏」，这在两种常见情况下都是浪费：
 *
 * 1. **同 harness 续接**：CLI 自己存着完整会话，`claude --resume` 一条命令就回到
 *    原位，根本不需要搬运上下文；
 * 2. **短会话跨 harness**：整段转录才几千字，直接原样交给对方比压缩成摘要更好——
 *    压缩必然丢信息，而这里根本没有超上下文的压力。
 *
 * 所以真正需要蒸馏的只有「跨 harness + 超长」。本文件实现另外两档，以及
 * 自动选档逻辑 `pickHandoffMode`。
 */
import type { DbContext } from "../db/client";
import { listBoardEntries, summarizeBoardForHandoff } from "./board";
import { buildResumeCommand, supportsNativeResume } from "./resume";
import type {
	CanonicalMessage,
	HandoffModeDecision,
	HandoffPackage,
} from "./types";

/**
 * 原文接力的字符上限。
 *
 * 超过这个量再原样搬运，目标端首条消息会占掉大半上下文窗口，反而挤压干活空间。
 * 24k 字符 ≈ 6–8k token，对所有主流模型都是安全的开场量级。
 */
export const RAW_MODE_CHAR_LIMIT = 24_000;

/** 原文接力最多带几条消息（超长单条会被下面的字符预算再裁一次）。 */
const RAW_MAX_MESSAGES = 120;

/** 单条消息在原文包里的最大长度，防止一条巨型 tool_result 吃光预算。 */
const RAW_PER_MESSAGE_LIMIT = 4_000;

function roleLabel(role: CanonicalMessage["role"]): string {
	if (role === "user") return "用户";
	if (role === "assistant") return "助手";
	return "系统";
}

/**
 * 从尾部倒着装填消息，直到触达字符预算，再正序还原。
 *
 * 倒着装是因为近期上下文比开头更相关；正序还原是因为对话读起来必须是时间顺序。
 */
function packTail(messages: CanonicalMessage[]): {
	picked: CanonicalMessage[];
	truncated: boolean;
} {
	const picked: CanonicalMessage[] = [];
	let budget = RAW_MODE_CHAR_LIMIT;
	let truncated = false;

	for (let i = messages.length - 1; i >= 0; i--) {
		if (picked.length >= RAW_MAX_MESSAGES) {
			truncated = true;
			break;
		}
		const message = messages[i];
		const text = message.content.trim();
		if (!text) continue;
		const clipped =
			text.length > RAW_PER_MESSAGE_LIMIT
				? `${text.slice(0, RAW_PER_MESSAGE_LIMIT)}\n…（本条已截断）`
				: text;
		if (clipped.length > budget) {
			truncated = true;
			break;
		}
		budget -= clipped.length;
		picked.push({ ...message, content: clipped });
	}

	picked.reverse();
	return { picked, truncated };
}

/**
 * 组装原文接力包（零 LLM 调用）。
 *
 * 与蒸馏包的结构字段（goal/done/…）保持一致，但**不编造**这些字段：
 * 除了从白板里读到的真实条目，其余一律留空，由转录本身说话。
 * 这一点很重要——用启发式规则硬凑出来的「已完成/下一步」是幻觉的另一种形式。
 */
export async function buildRawHandoff(
	db: DbContext,
	options: {
		sessionId: string;
		sourceHarness: string;
		targetHarness: string;
		title: string | null;
		cwd: string | null;
		messages: CanonicalMessage[];
	},
): Promise<HandoffPackage> {
	const { picked, truncated } = packTail(options.messages);
	const board = await listBoardEntries(db, options.cwd).catch(() => []);
	const boardSummary = summarizeBoardForHandoff(board);
	const goalEntry = board.find((entry) => entry.kind === "goal");

	const transcript = picked
		.map((m) => `**${roleLabel(m.role)}**：${m.content}`)
		.join("\n\n");

	const header = [
		"# 会话交接包（原文接力）",
		"",
		`> 来源：${options.sourceHarness}${options.title ? ` · ${options.title}` : ""}`,
		`> 目标：${options.targetHarness}`,
		options.cwd ? `> 工作目录：${options.cwd}` : "",
		`> 可检索的原始会话 id：\`${options.sessionId}\``,
		"> 本包为**原文接力**：未经 LLM 压缩，内容即原始转录（可能只含尾部片段），无信息损失风险。",
		truncated
			? `> 注意：原会话较长，此处只包含最近 ${picked.length} 条消息。需要更早的内容请按上面的会话 id 回查。`
			: "",
		"",
	]
		.filter((line) => line !== "")
		.join("\n");

	const sections: string[] = [];

	if (boardSummary.decisions.length) {
		sections.push(
			`## 已定决策（来自共享白板）\n\n${boardSummary.decisions
				.map((d) => `- ${d}`)
				.join("\n")}\n`,
		);
	}
	if (boardSummary.pitfalls.length) {
		sections.push(
			`## 踩过的坑（来自共享白板）\n\n${boardSummary.pitfalls
				.map((d) => `- ${d}`)
				.join("\n")}\n`,
		);
	}
	if (boardSummary.nextSteps.length) {
		sections.push(
			`## 待办（来自共享白板）\n\n${boardSummary.nextSteps
				.map((d) => `- ${d}`)
				.join("\n")}\n`,
		);
	}

	sections.push(`## 原始转录\n\n${transcript || "（该会话没有可读转录）"}\n`);

	return {
		goal: goalEntry?.content ?? "",
		done: [],
		inProgress: [],
		decisions: [...boardSummary.decisions, ...boardSummary.pitfalls],
		files: [],
		nextSteps: boardSummary.nextSteps,
		markdown: [header, ...sections].join("\n").trim(),
	};
}

/**
 * 自动选档。
 *
 * 判定顺序刻意如此：先看能不能零成本无损（native），再看能不能零成本原样搬（raw），
 * 最后才动用 LLM（distill）。用户不需要理解这三档，但 `reason` 会如实展示出来。
 */
export async function pickHandoffMode(
	db: DbContext,
	options: {
		sessionId: string;
		sourceHarness: string;
		targetHarness: string;
		externalId: string | null;
		/** 目标 CLI 是否可在本机启动（detect 的 can_inject） */
		targetInstalled: boolean;
		/** 用户强制指定档位时直接采纳 */
		force?: "native" | "raw" | "distill" | "auto";
	},
): Promise<HandoffModeDecision> {
	const charsRes = await db.client.execute({
		sql: `SELECT COALESCE(SUM(LENGTH(content)), 0) AS chars
		      FROM harness_messages WHERE session_id = ?`,
		args: [options.sessionId],
	});
	const transcriptChars = Number(
		(charsRes.rows[0] as Record<string, unknown> | undefined)?.chars ?? 0,
	);

	const sameHarness = options.sourceHarness === options.targetHarness;
	const resumeCommand = sameHarness
		? buildResumeCommand(options.targetHarness, options.externalId)
		: null;
	const nativeAvailable = Boolean(resumeCommand) && options.targetInstalled;

	const force = options.force ?? "auto";

	if (force === "native") {
		if (!nativeAvailable) {
			throw new Error(
				sameHarness
					? `${options.targetHarness} 不支持原生续接（或缺少原生会话 id / CLI 未安装）`
					: "原生续接只能在同一个入口内使用，跨入口请用原文或蒸馏接力",
			);
		}
		return {
			mode: "native",
			reason: "用户指定原生续接",
			resumeCommand: resumeCommand ?? undefined,
			transcriptChars,
		};
	}
	if (force === "raw") {
		return { mode: "raw", reason: "用户指定原文接力", transcriptChars };
	}
	if (force === "distill") {
		return { mode: "distill", reason: "用户指定蒸馏接力", transcriptChars };
	}

	if (nativeAvailable) {
		return {
			mode: "native",
			reason: `同一入口内续接，${options.targetHarness} 支持原生 resume —— 上下文无损，零成本`,
			resumeCommand: resumeCommand ?? undefined,
			transcriptChars,
		};
	}

	if (transcriptChars > 0 && transcriptChars <= RAW_MODE_CHAR_LIMIT) {
		return {
			mode: "raw",
			reason: `转录 ${transcriptChars.toLocaleString("en-US")} 字符，未超过原文接力上限 ${RAW_MODE_CHAR_LIMIT.toLocaleString("en-US")} —— 原样搬运，不做压缩`,
			transcriptChars,
		};
	}

	if (transcriptChars === 0) {
		return {
			mode: "raw",
			reason: "该会话没有可读转录，走原文接力（结果可能为空）",
			transcriptChars,
		};
	}

	return {
		mode: "distill",
		reason: `转录 ${transcriptChars.toLocaleString("en-US")} 字符，超过原文接力上限 —— 用 LLM 压缩成结构化交接包（有损）`,
		transcriptChars,
	};
}

/** 供 UI 展示：该源会话能否原生续接到目标入口。 */
export function nativeResumeAvailable(
	sourceHarness: string,
	targetHarness: string,
	externalId: string | null,
): boolean {
	return (
		sourceHarness === targetHarness &&
		supportsNativeResume(targetHarness) &&
		Boolean((externalId ?? "").trim())
	);
}

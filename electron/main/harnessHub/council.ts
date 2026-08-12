/**
 * 议会模式 —— 同一个问题并发问多个入口，再由本应用做裁决合并。
 *
 * 适用场景是那种「问一家不放心」的判断题：架构选型、疑难 bug 的成因、
 * 两个方案哪个坑少。不同厂商的模型有不同的训练数据与偏好，四路独立回答里
 * 的分歧点本身就是最有价值的信息——它精确标出了「这个问题没有共识」。
 *
 * 设计上的两个硬要求：
 *
 * 1. **失败分支如实记录**。某一路超时或报错，就在结果里明明白白写 failed +
 *    原因，绝不用其他分支的答案顶替，也不静默把它从参与者名单里抹掉。
 *    裁决结论必须建立在「几路答了、几路没答」的真实情况上。
 * 2. **裁决产物标注分歧**。合并不是把四段话缝起来，而是要指出共识在哪、
 *    分歧在哪、以及分歧的根源。只有共识没有分歧的合并等于丢掉了议会的意义。
 */
import { randomUUID } from "node:crypto";
import type { DbContext } from "../db/client";
import { invokeLlm } from "../llm/invoke";
import { createLogger } from "../logging/logger";
import { runBridgeCall } from "./bridge";
import type { BridgeTargetKind } from "./types";

const logger = createLogger();

/** 单个议员（参与的入口）。 */
export interface CouncilMember {
	harness: string;
	kind: BridgeTargetKind;
	label: string;
}

/** 单路答案。 */
export interface CouncilAnswer {
	id: string;
	harness: string;
	label: string;
	answer: string;
	status: "succeeded" | "failed" | "timeout";
	error: string | null;
	durationMs: number;
}

/** 一次议会运行的完整结果。 */
export interface CouncilResult {
	runId: string;
	question: string;
	cwd: string | null;
	answers: CouncilAnswer[];
	/** 裁决合并后的结论 markdown；全部分支失败时为空 */
	verdict: string;
	status: "done" | "failed";
	error: string | null;
}

const VERDICT_SYSTEM_PROMPT = `你在主持一场「多模型议会」。同一个问题被独立问了多个 AI 助手，
现在要你把它们的回答合成一份对用户真正有用的结论。

要求：
1. **先给结论**：一句话说清最终建议是什么。
2. **共识**：哪些点是多数或全部答案都同意的（这些可信度最高）。
3. **分歧**：哪些点各家说法不一致，分别是怎么说的，以及分歧的根源
   （信息不同？假设不同？还是有一方明显错了）。分歧部分**不要**强行调和成一句话，
   用户需要看到真实的不确定性。
4. **被忽略的角度**：如果某一家提到了别家都没提、但确实重要的点，单独指出来。
5. 如果有分支失败或没有作答，在结论开头如实说明「本次只有 N/M 路作答」。

用中文输出 markdown，不要客套，不要复述问题。`;

/** 组装送给裁决模型的输入。 */
function renderAnswersForVerdict(answers: CouncilAnswer[]): string {
	const parts: string[] = [];
	for (const a of answers) {
		if (a.status !== "succeeded" || !a.answer.trim()) {
			parts.push(
				`### ${a.label}（${a.harness}）\n\n**未作答** —— ${a.error ?? "无返回内容"}`,
			);
			continue;
		}
		parts.push(`### ${a.label}（${a.harness}）\n\n${a.answer.trim()}`);
	}
	return parts.join("\n\n---\n\n");
}

/**
 * 跑一次议会。
 *
 * @param onProgress 每一路结束时回调，UI 可以逐条点亮而不是干等全部结束
 */
export async function runCouncil(
	db: DbContext,
	options: {
		question: string;
		members: CouncilMember[];
		cwd?: string | null;
		/** 单路超时 */
		timeoutMs?: number;
		/** 裁决用的模型；空串走用户当前活跃模型 */
		verdictModel?: string;
		/** 只收集答案、跳过裁决（用户想自己看原始四路时） */
		skipVerdict?: boolean;
		onProgress?: (payload: {
			phase: "asking" | "answered" | "reducing" | "done";
			harness?: string;
			finished: number;
			total: number;
		}) => void;
	},
): Promise<CouncilResult> {
	const question = options.question.trim();
	if (!question) throw new Error("议会问题为空");
	if (!options.members.length) throw new Error("没有选择任何参与入口");

	const runId = randomUUID();
	const now = Date.now();
	const cwd = options.cwd ?? null;

	await db.client.execute({
		sql: `INSERT INTO harness_council_runs
		        (id, question, cwd, participants_json, status, verdict, error, created_at, finished_at)
		      VALUES (?, ?, ?, ?, 'running', NULL, NULL, ?, NULL)`,
		args: [
			runId,
			question,
			cwd,
			JSON.stringify(options.members.map((m) => m.harness)),
			now,
		],
	});

	const total = options.members.length;
	let finished = 0;
	options.onProgress?.({ phase: "asking", finished: 0, total });

	// 并发问所有议员。用 allSettled 语义：任何一路炸了都不能拖垮其他路。
	const answers = await Promise.all(
		options.members.map(async (member): Promise<CouncilAnswer> => {
			const result = await runBridgeCall(
				db,
				{
					target: member.harness,
					kind: member.kind,
					prompt: question,
					cwd: cwd ?? undefined,
					timeoutMs: options.timeoutMs,
					caller: "council",
				},
				// 议会是「问意见」，不该让任何一路去改文件
				{ allowWrite: false },
			);

			finished += 1;
			options.onProgress?.({
				phase: "answered",
				harness: member.harness,
				finished,
				total,
			});

			const answer: CouncilAnswer = {
				id: randomUUID(),
				harness: member.harness,
				label: member.label,
				answer: result.answer,
				status: result.ok ? "succeeded" : "failed",
				error: result.error,
				durationMs: result.durationMs,
			};

			await db.client
				.execute({
					sql: `INSERT INTO harness_council_answers
					        (id, run_id, harness, label, answer, status, error, duration_ms, created_at)
					      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [
						answer.id,
						runId,
						answer.harness,
						answer.label,
						answer.answer,
						answer.status,
						answer.error,
						answer.durationMs,
						Date.now(),
					],
				})
				.catch(() => undefined);

			return answer;
		}),
	);

	const succeeded = answers.filter(
		(a) => a.status === "succeeded" && a.answer.trim(),
	);

	if (!succeeded.length) {
		const error = "全部入口都没有返回有效回答";
		await db.client.execute({
			sql: `UPDATE harness_council_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`,
			args: [error, Date.now(), runId],
		});
		return {
			runId,
			question,
			cwd,
			answers,
			verdict: "",
			status: "failed",
			error,
		};
	}

	if (options.skipVerdict) {
		await db.client.execute({
			sql: `UPDATE harness_council_runs SET status = 'done', finished_at = ? WHERE id = ?`,
			args: [Date.now(), runId],
		});
		options.onProgress?.({ phase: "done", finished, total });
		return {
			runId,
			question,
			cwd,
			answers,
			verdict: "",
			status: "done",
			error: null,
		};
	}

	options.onProgress?.({ phase: "reducing", finished, total });

	let verdict = "";
	let error: string | null = null;
	try {
		const reduced = await invokeLlm(db, {
			model: options.verdictModel ?? "",
			prompt: `原始问题：\n\n${question}\n\n---\n\n本次共 ${total} 路参与，${succeeded.length} 路给出了回答。各路回答如下：\n\n${renderAnswersForVerdict(answers)}`,
			context: [VERDICT_SYSTEM_PROMPT],
			temperature: 0.3,
		});
		verdict = reduced.content.trim();
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
		logger.warn({ msg: "议会裁决失败，保留原始各路答案", error });
	}

	await db.client.execute({
		sql: `UPDATE harness_council_runs SET status = ?, verdict = ?, error = ?, finished_at = ? WHERE id = ?`,
		args: [
			verdict ? "done" : "failed",
			verdict || null,
			error,
			Date.now(),
			runId,
		],
	});
	options.onProgress?.({ phase: "done", finished, total });

	return {
		runId,
		question,
		cwd,
		answers,
		verdict,
		status: verdict ? "done" : "failed",
		error,
	};
}

/** 列出历史议会运行。 */
export async function listCouncilRuns(
	db: DbContext,
	limit = 30,
): Promise<
	{
		id: string;
		question: string;
		cwd: string | null;
		participants: string[];
		status: string;
		verdict: string | null;
		error: string | null;
		createdAt: number;
		finishedAt: number | null;
	}[]
> {
	const res = await db.client.execute({
		sql: `SELECT id, question, cwd, participants_json, status, verdict, error, created_at, finished_at
		      FROM harness_council_runs ORDER BY created_at DESC LIMIT ?`,
		args: [Math.min(Math.max(limit, 1), 200)],
	});
	return res.rows.map((raw) => {
		const row = raw as Record<string, unknown>;
		let participants: string[] = [];
		try {
			const parsed = JSON.parse(String(row.participants_json ?? "[]"));
			if (Array.isArray(parsed)) {
				participants = parsed.filter((x): x is string => typeof x === "string");
			}
		} catch {
			participants = [];
		}
		return {
			id: String(row.id),
			question: String(row.question ?? ""),
			cwd: (row.cwd as string) ?? null,
			participants,
			status: String(row.status ?? ""),
			verdict: (row.verdict as string) ?? null,
			error: (row.error as string) ?? null,
			createdAt: Number(row.created_at ?? 0),
			finishedAt: row.finished_at ? Number(row.finished_at) : null,
		};
	});
}

/** 取一次议会运行的全部答案。 */
export async function getCouncilRun(
	db: DbContext,
	runId: string,
): Promise<{ answers: CouncilAnswer[] }> {
	const res = await db.client.execute({
		sql: `SELECT id, harness, label, answer, status, error, duration_ms
		      FROM harness_council_answers WHERE run_id = ? ORDER BY created_at ASC`,
		args: [runId],
	});
	return {
		answers: res.rows.map((raw) => {
			const row = raw as Record<string, unknown>;
			return {
				id: String(row.id),
				harness: String(row.harness ?? ""),
				label: String(row.label ?? ""),
				answer: String(row.answer ?? ""),
				status:
					(String(row.status ?? "failed") as CouncilAnswer["status"]) ??
					"failed",
				error: (row.error as string) ?? null,
				durationMs: Number(row.duration_ms ?? 0),
			};
		}),
	};
}

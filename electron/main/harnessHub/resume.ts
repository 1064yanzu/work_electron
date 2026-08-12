/**
 * 原生续接 —— 同一个 harness 内「接着上次那段会话继续」的最优解。
 *
 * 一期的接力无论什么情况都要过一遍 LLM 蒸馏，但**同 harness 续接根本不需要搬运
 * 上下文**：CLI 自己就存着完整会话，`claude --resume <id>` / `codex resume <id>`
 * 一条命令就回到原位，零成本、零损耗。只有跨 harness 才真的需要 handoff。
 *
 * 能力表 `RESUME_SPECS` 只登记**实测验证过**的 harness。没登记的一律降级到
 * raw / distill —— 对没验证过的 CLI 乐观假设它支持 resume，结果是命令报错、
 * pty 里留下一堆红字，比多花一次蒸馏糟糕得多。
 *
 * 实测（2026-08-10，本机）：
 *   claude --resume <sessionId> [--fork-session]   ✓
 *   codex  resume <sessionId>                      ✓（另有 codex fork）
 *   gemini                                          ✗ 无 resume 子命令
 *   opencode                                        ✗ 未验证
 */
import type { HarnessKind } from "./types";

interface ResumeSpec {
	/** 基础可执行文件名（与 detect.ts 的 launchCommand 对齐） */
	bin: string;
	/**
	 * 构造续接命令。
	 * @param externalId 原生会话 id（claude 的 sessionId / codex 的 payload.id）
	 * @param fork       true = 分叉出新会话，不覆盖原始历史
	 */
	build: (externalId: string, fork: boolean) => string;
	/** 是否支持分叉 */
	supportsFork: boolean;
	/** UI 上解释这条命令做了什么 */
	description: string;
}

/** 在 shell 里安全引用一个参数（单引号包裹，内部单引号转义）。 */
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

const RESUME_SPECS: Partial<Record<HarnessKind, ResumeSpec>> = {
	"claude-code": {
		bin: "claude",
		supportsFork: true,
		description: "claude --resume 直接载入原会话，上下文完全无损",
		build: (externalId, fork) =>
			`claude --resume ${shellQuote(externalId)}${fork ? " --fork-session" : ""}`,
	},
	codex: {
		bin: "codex",
		supportsFork: true,
		// codex 的 fork 是独立子命令而不是 resume 的开关
		description: "codex resume 直接载入原会话，上下文完全无损",
		build: (externalId, fork) =>
			fork
				? `codex fork ${shellQuote(externalId)}`
				: `codex resume ${shellQuote(externalId)}`,
	},
};

/** 该 harness 是否支持原生续接。 */
export function supportsNativeResume(harness: string): boolean {
	return Boolean(RESUME_SPECS[harness as HarnessKind]);
}

/** 该 harness 的原生续接是否支持分叉（不覆盖原会话）。 */
export function supportsNativeFork(harness: string): boolean {
	return Boolean(RESUME_SPECS[harness as HarnessKind]?.supportsFork);
}

/**
 * 构造原生续接命令。
 *
 * @returns 命令字符串；该 harness 不支持或 externalId 为空时返回 null
 *          （调用方据此降级到 raw / distill，**不要**自己拼命令）
 */
export function buildResumeCommand(
	harness: string,
	externalId: string | null | undefined,
	options: { fork?: boolean } = {},
): string | null {
	const spec = RESUME_SPECS[harness as HarnessKind];
	if (!spec) return null;
	const id = (externalId ?? "").trim();
	if (!id) return null;
	return spec.build(id, options.fork === true);
}

/** 取该 harness 原生续接的说明文案（UI 用）。 */
export function resumeDescription(harness: string): string | null {
	return RESUME_SPECS[harness as HarnessKind]?.description ?? null;
}
